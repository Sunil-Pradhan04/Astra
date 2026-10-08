"""
Health Worker AI Co-Pilot Service
=================================
Allows mid-level health workers to interactively review and update clinical triage summaries
via natural language prompts before dispatching cases to the attending doctor queue.
"""

import json
import re
import httpx
from datetime import datetime
from typing import Dict, Any, List, Optional
from openai import AsyncOpenAI

from app.core.config import settings

SARVAM_BASE_URL = "https://api.sarvam.ai"
SARVAM_LLM_MODEL = "sarvam-105b-conversations"


def _clean_json_response(raw: str) -> Any:
    cleaned = raw.strip()
    if "```json" in cleaned:
        cleaned = cleaned.split("```json")[1].split("```")[0].strip()
    elif "```" in cleaned:
        cleaned = cleaned.split("```")[1].split("```")[0].strip()
    return json.loads(cleaned)


class HealthWorkerAiService:
    def __init__(self):
        self._openai: Optional[AsyncOpenAI] = None

    def _get_openai(self) -> AsyncOpenAI:
        if self._openai is None:
            self._openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._openai

    async def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        # 1. Try Sarvam AI first
        if settings.SARVAM_AI_API_KEY:
            try:
                headers = {
                    "api-subscription-key": settings.SARVAM_AI_API_KEY,
                    "Content-Type": "application/json",
                }
                payload = {
                    "model": SARVAM_LLM_MODEL,
                    "messages": messages,
                    "temperature": 0.2,
                    "max_tokens": 1200,
                }
                async with httpx.AsyncClient(timeout=35.0) as client:
                    res = await client.post(
                        f"{SARVAM_BASE_URL}/v1/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                    if res.status_code == 200:
                        data = res.json()
                        content = data["choices"][0]["message"]["content"].strip()
                        if content:
                            return content
            except Exception as e:
                print(f"[HealthWorkerAI] Sarvam LLM failed, falling back to OpenAI: {e}")

        # 2. Fallback to OpenAI
        if settings.OPENAI_API_KEY:
            try:
                client = self._get_openai()
                resp = await client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    temperature=0.2,
                    max_tokens=1200,
                )
                return resp.choices[0].message.content.strip()
            except Exception as e:
                print(f"[HealthWorkerAI] OpenAI LLM failed: {e}")

        raise RuntimeError("No working LLM provider available for report update.")

    async def process_report_update(
        self,
        patient_data: Dict[str, Any],
        worker_message: str,
        worker_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Interprets health worker instructions and applies clinical updates to report fields.
        """
        system_prompt = (
            "You are an expert Clinical AI Medical Co-Pilot assistant for a Mid-Level Health Worker at a hospital / care hub. "
            "Your job is to update a patient's pre-consultation clinical triage report based on instructions from the health worker.\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. Accurately modify patient vitals, chief complaints, symptoms, candidate conditions, triage priority, or clinical notes as requested.\n"
            "2. If the health worker reports new symptoms, add them to the symptoms list with clear clinical attributes (duration, severity, location).\n"
            "3. If the health worker reports vitals (e.g., BP 135/85, Temp 101.4 F, Weight 68 kg), extract them cleanly.\n"
            "4. If priority escalation is indicated (e.g. 'urgent', 'critical', 'emergency', chest pain, severe distress), change priority to 'emergency' and urgency_level to 'red'.\n"
            "5. If priority downgrade is indicated, set priority to 'normal' and urgency_level to 'green' or 'yellow'.\n"
            "6. Always return a strictly valid JSON object without markdown formatting, code fences, or extra commentary."
        )

        user_prompt = f"""CURRENT PATIENT RECORD:
- Patient ID: {patient_data.get('patient_id')}
- Name: {patient_data.get('full_name')} ({patient_data.get('age')}y / {patient_data.get('gender')})
- Current Priority: {patient_data.get('priority', 'normal')} (Urgency Level: {patient_data.get('urgency_level', 'green')})
- Vitals: BP {patient_data.get('bp_systolic')}/{patient_data.get('bp_diastolic')} mmHg, Temp {patient_data.get('temperature_f')} °F, Weight {patient_data.get('weight_kg')} kg, Height {patient_data.get('height_cm')} cm
- Chief Complaints: {patient_data.get('chief_complaints', 'None recorded')}
- Current AI Summary:
{json.dumps(patient_data.get('ai_summary') or {}, indent=2)}

HEALTH WORKER INSTRUCTION:
"{worker_message}"

Generate the JSON response matching this schema:
{{
  "ai_reply": "<courteous, clear clinical response explaining what was updated and any relevant clinical insight>",
  "changes_applied": ["<bullet 1: e.g. Updated Blood Pressure to 135/85 mmHg>", "<bullet 2: Added mild dry cough (3 days) to symptoms>"],
  "updated_fields": {{
    "bp_systolic": <integer or null if unchanged>,
    "bp_diastolic": <integer or null if unchanged>,
    "temperature_f": <float or null if unchanged>,
    "weight_kg": <float or null if unchanged>,
    "height_cm": <float or null if unchanged>,
    "chief_complaints": "<revised string or null if unchanged>",
    "priority": "<'emergency' | 'normal' or null if unchanged>",
    "urgency_level": "<'red' | 'yellow' | 'green' or null if unchanged>",
    "symptoms_added_or_modified": [
      {{
        "name": "<symptom name>",
        "duration": "<duration or null>",
        "severity": "<severity or null>",
        "location": "<location or null>",
        "pattern": "<pattern or null>",
        "triggers": "<triggers or null>"
      }}
    ],
    "symptoms_removed": ["<symptom names to remove if requested>"],
    "candidate_conditions": [
      {{
        "condition": "<disease name>",
        "match_confidence": "High | Moderate | Low",
        "matching_rationale": "<rationale>"
      }}
    ],
    "medications_and_history": {{
      "medications_taken": "<or null>",
      "chronic_conditions": "<or null>",
      "allergies": "<or null>"
    }},
    "clinical_notes": "<updated clinical notes for doctor or null>"
  }}
}}"""

        try:
            raw_response = await self._call_llm(system_prompt, user_prompt)
            parsed = _clean_json_response(raw_response)
            return parsed
        except Exception as e:
            print(f"[HealthWorkerAI] LLM processing error: {e}. Executing rule-based fallback.")
            return self._rule_based_fallback(patient_data, worker_message)

    def _rule_based_fallback(self, patient_data: Dict[str, Any], message: str) -> Dict[str, Any]:
        """Resilient rule-based parser if LLM endpoint fails or is unreachable."""
        changes = []
        updated_fields = {}
        msg_lower = message.lower()

        # BP detection (e.g. 130/85 or 130 / 85)
        bp_match = re.search(r"(\d{2,3})\s*/\s*(\d{2,3})", message)
        if bp_match:
            sys_val = int(bp_match.group(1))
            dia_val = int(bp_match.group(2))
            updated_fields["bp_systolic"] = sys_val
            updated_fields["bp_diastolic"] = dia_val
            changes.append(f"Updated Blood Pressure to {sys_val}/{dia_val} mmHg")

        # Temp detection (e.g. 101.4 or 99 F)
        temp_match = re.search(r"(?:temp(?:erature)?\s*(?:is|to|:)?\s*|\b)(\d{2,3}(?:\.\d+)?)\s*(?:°?\s*[fF]|\s*degree)", message)
        if temp_match:
            try:
                t_val = float(temp_match.group(1))
                updated_fields["temperature_f"] = t_val
                changes.append(f"Updated Temperature to {t_val} °F")
            except ValueError:
                pass

        # Priority detection
        if any(w in msg_lower for w in ["emergency", "critical", "red flag", "urgent", "escalate"]):
            updated_fields["priority"] = "emergency"
            updated_fields["urgency_level"] = "red"
            changes.append("Escalated triage priority to Emergency (Red)")
        elif any(w in msg_lower for w in ["normal priority", "routine", "downgrade to normal", "not urgent"]):
            updated_fields["priority"] = "normal"
            updated_fields["urgency_level"] = "green"
            changes.append("Updated triage priority to Normal (Routine)")

        # Complaints or general note
        note_added = f"Worker update: {message}"
        updated_fields["clinical_notes"] = note_added
        changes.append("Appended health worker clinical instruction to notes")

        return {
            "ai_reply": f"Understood. I have recorded your update: '{message}'. The relevant parameters have been updated for physician review.",
            "changes_applied": changes if changes else ["Recorded health worker update in clinical notes"],
            "updated_fields": updated_fields,
        }


health_worker_ai = HealthWorkerAiService()
