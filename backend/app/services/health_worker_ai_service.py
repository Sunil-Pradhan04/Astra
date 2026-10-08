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
        dialogue_turns = (
            patient_data.get("dialogue_turns")
            or (patient_data.get("ai_summary") or {}).get("dialogue_turns")
            or (patient_data.get("ai_summary") or {}).get("structured_summary", {}).get("dialogue_turns")
            or []
        )

        system_prompt = (
            "You are an expert Clinical AI Medical Co-Pilot assistant for a Health Worker / Reviewer and Attending Doctor at a hospital / care hub.\n"
            "Your role has TWO capabilities:\n"
            "1. CASE INQUIRY & INTERROGATION Q&A: If the health worker or reviewer asks a question about what the patient disclosed during kiosk interrogation "
            "(e.g., 'What did the patient say about fever timing?', 'Did they report evening symptoms?', 'What did they say about chest pain?', 'Any known allergies?'), "
            "provide a comprehensive, factual, and medically coherent clinical answer in `ai_reply` referencing what the patient stated during interrogation. "
            "In this inquiry mode, DO NOT modify patient fields: set `changes_applied` to [] and leave all keys in `updated_fields` as null or empty.\n\n"
            "2. REPORT FIELD UPDATE: If the health worker instructs an update (e.g., 'Add dry cough for 3 days', 'Update BP to 135/85', 'Escalate to Emergency'), "
            "accurately populate `updated_fields`, summarize the change in `ai_reply`, and provide clean bullet points in `changes_applied`.\n"
            "CRITICAL RULES FOR UPDATES:\n"
            "- New symptoms should include name, duration, severity, location, pattern, triggers.\n"
            "- If priority escalation is indicated ('emergency', 'critical', 'urgent', chest pain, distress), set priority to 'emergency' and urgency_level to 'red'.\n"
            "- If priority downgrade is indicated, set priority to 'normal' and urgency_level to 'green'.\n"
            "- Return strictly valid JSON matching the requested schema."
        )

        user_prompt = f"""CURRENT PATIENT RECORD:
- Patient ID: {patient_data.get('patient_id')}
- Name: {patient_data.get('full_name')} ({patient_data.get('age')}y / {patient_data.get('gender')})
- Current Priority: {patient_data.get('priority', 'normal')} (Urgency Level: {patient_data.get('urgency_level', 'green')})
- Vitals: BP {patient_data.get('bp_systolic')}/{patient_data.get('bp_diastolic')} mmHg, Temp {patient_data.get('temperature_f')} °F, Weight {patient_data.get('weight_kg')} kg, Height {patient_data.get('height_cm')} cm
- Chief Complaints: {patient_data.get('chief_complaints', 'None recorded')}
- Kiosk Interrogation Dialogue History:
{json.dumps(dialogue_turns, indent=2) if dialogue_turns else "No separate turn list; refer to summary disclosures."}
- Current AI Summary:
{json.dumps(patient_data.get('ai_summary') or {}, indent=2)}

HEALTH WORKER MESSAGE / QUERY:
"{worker_message}"

Generate the JSON response matching this schema:
{{
  "ai_reply": "<comprehensive, courteous clinical answer addressing what the patient said, or describing the applied update>",
  "changes_applied": ["<bullet 1 if changes were made; empty array [] if this was an inquiry / interrogation question>"],
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
        msg_lower = message.lower().strip()

        # Check if message is a question or inquiry
        is_question = (
            msg_lower.endswith("?")
            or any(msg_lower.startswith(w) for w in ["what", "did", "when", "is", "are", "does", "can", "how", "tell", "show", "why", "where"])
        )

        if is_question:
            # Inquiry response without mutating clinical record
            chief = patient_data.get("chief_complaints") or "No chief complaint recorded."
            vitals_str = f"BP: {patient_data.get('bp_systolic', '—')}/{patient_data.get('bp_diastolic', '—')}, Temp: {patient_data.get('temperature_f', '—')} °F"
            ai_sum = patient_data.get("ai_summary") or {}
            struct = ai_sum.get("structured_summary") or ai_sum
            symptoms = struct.get("symptoms_deep_dive") or struct.get("symptoms") or []
            sym_names = [s.get("name") for s in symptoms if isinstance(s, dict) and s.get("name")]

            reply = f"Regarding {patient_data.get('full_name')}'s interrogation: Presenting complaints: '{chief}'. Active symptoms cataloged: {', '.join(sym_names) if sym_names else 'None'}. Current vitals: {vitals_str}."
            return {
                "ai_reply": reply,
                "changes_applied": [],
                "updated_fields": {},
            }

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
            "ai_reply": f"Understood. Recorded your clinical instruction: '{message}'. Relevant parameters updated for doctor review.",
            "changes_applied": changes if changes else ["Recorded health worker update in clinical notes"],
            "updated_fields": updated_fields,
        }

    async def generate_referral_note(
        self,
        patient_data: Dict[str, Any],
        reason_for_referral: str,
        possible_diagnosis: str,
        referring_doctor_name: str,
        referring_facility_name: str,
        urgency: str = "Urgent",
        clinical_notes: Optional[str] = None,
    ) -> str:
        """
        Synthesizes an official, structured Hospital Referral Memorandum using Sarvam AI LLM.
        """
        from app.core.prompts import CLINICAL_REFERRAL_NOTE_SYSTEM, build_clinical_referral_note_prompt

        p_name = patient_data.get("full_name") or "Patient"
        p_id = patient_data.get("patient_id") or "N/A"
        age = patient_data.get("age", 0)
        gender = patient_data.get("gender", "Unknown")

        bp_sys = patient_data.get("bp_systolic")
        bp_dia = patient_data.get("bp_diastolic")
        temp = patient_data.get("temperature_f")
        vitals_parts = []
        if bp_sys and bp_dia:
            vitals_parts.append(f"BP: {bp_sys}/{bp_dia} mmHg")
        if temp:
            vitals_parts.append(f"Temp: {temp}°F")
        vitals_text = ", ".join(vitals_parts) if vitals_parts else "Vitals recorded at triage"

        chief_complaints = patient_data.get("chief_complaints") or ""
        ai_sum = patient_data.get("ai_summary") or {}
        if isinstance(ai_sum, dict):
            st = ai_sum.get("structured_summary") or ai_sum
            if isinstance(st, dict) and st.get("clinical_narrative"):
                chief_complaints = f"{chief_complaints} | Narrative: {st.get('clinical_narrative')}"

        user_prompt = build_clinical_referral_note_prompt(
            patient_name=p_name,
            patient_id=p_id,
            age=age,
            gender=gender,
            vitals_text=vitals_text,
            chief_complaints=chief_complaints,
            reason_for_referral=reason_for_referral,
            possible_diagnosis=possible_diagnosis,
            referring_doctor_name=referring_doctor_name,
            referring_facility_name=referring_facility_name,
            urgency=urgency,
            clinical_notes=clinical_notes,
        )

        try:
            note = await self._call_llm(CLINICAL_REFERRAL_NOTE_SYSTEM, user_prompt)
            if note and len(note.strip()) > 40:
                return note.strip()
        except Exception as e:
            print(f"[HealthWorkerAiService] Error generating referral note: {e}")

        # Deterministic fallback
        now_str = datetime.utcnow().strftime("%d %B %Y, %H:%M UTC")
        return (
            f"OFFICIAL CLINICAL REFERRAL & TRANSFER MEMORANDUM\n"
            f"----------------------------------------------------\n"
            f"Date / Time: {now_str}\n"
            f"Referring Facility: {referring_facility_name}\n"
            f"Referring Physician: Dr. {referring_doctor_name}\n"
            f"Transfer Priority / Urgency: {urgency.upper()}\n\n"
            f"1. PATIENT IDENTIFICATION & CLINICAL STATUS:\n"
            f"• Patient: {p_name} (ID: {p_id})\n"
            f"• Age / Gender: {age} yrs / {gender}\n"
            f"• Baseline Vitals: {vitals_text}\n\n"
            f"2. WORKING / PROVISIONAL DIAGNOSIS:\n"
            f"• {possible_diagnosis}\n\n"
            f"3. REASON & JUSTIFICATION FOR EXTERNAL TRANSFER:\n"
            f"• {reason_for_referral}\n\n"
            f"4. PRESENTING SYMPTOMS & CLINICAL FINDINGS:\n"
            f"• {chief_complaints or 'Reported acute medical symptoms requiring advanced evaluation.'}\n\n"
            f"5. PRE-TRANSFER BEDSIDE STABILIZATION & NOTES:\n"
            f"• {clinical_notes or 'Supportive clinical care initiated. Vital parameters monitored.'}\n\n"
            f"6. RECOMMENDED TRANSPORT & ESCORT PROTOCOL:\n"
            f"• Patient requires transfer under continuous observation with medical escort to designated higher-level facility."
        )


health_worker_ai = HealthWorkerAiService()
