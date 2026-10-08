"""
Conversation RAG Service
========================
Provides high-fidelity semantic search and clinical Q&A over verbatim patient-agent
dialogue turns recorded during autonomous AI kiosk triage interrogation.

Uses Pinecone vector index `astra-conversation` (1536 dim, cosine similarity)
with OpenAI `text-embedding-3-small` embeddings and Sarvam AI LLM generation.
"""

import re
import httpx
from datetime import datetime
from typing import Dict, Any, List, Optional
from openai import AsyncOpenAI
from pinecone import Pinecone as PineconeClient

from app.core.config import settings
from app.models.patient import Patient

SARVAM_BASE_URL = "https://api.sarvam.ai"
SARVAM_LLM_MODEL = "sarvam-105b-conversations"
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


class ConversationRagService:
    def __init__(self):
        self._openai: Optional[AsyncOpenAI] = None
        self._pinecone: Optional[PineconeClient] = None
        self._pinecone_index = None
        self.index_name = getattr(settings, "PINECONE_CONVERSATION_INDEX", "astra-conversation") or "astra-conversation"

    def _get_openai(self) -> AsyncOpenAI:
        if self._openai is None:
            if not settings.OPENAI_API_KEY:
                raise RuntimeError("OPENAI_API_KEY not configured in .env (required for conversation embeddings)")
            self._openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._openai

    def _get_index(self):
        if self._pinecone_index is None:
            if not settings.PINECONE_API_KEY:
                raise RuntimeError("PINECONE_API_KEY not configured in .env")
            pc = PineconeClient(api_key=settings.PINECONE_API_KEY)
            self._pinecone = pc
            self._pinecone_index = pc.Index(self.index_name)
            print(f"[ConversationRagService] Connected to Pinecone index '{self.index_name}' (dim {EMBEDDING_DIM})")
        return self._pinecone_index

    async def get_embedding(self, text: str) -> List[float]:
        """Generates 1536-dimensional dense vector using OpenAI text-embedding-3-small."""
        client = self._get_openai()
        cleaned = (text or "").strip().replace("\n", " ")
        if not cleaned:
            cleaned = "patient clinical interrogation query"

        res = await client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=cleaned,
        )
        return res.data[0].embedding

    async def index_patient_conversation(
        self,
        patient_id: str,
        dialogue_turns: List[dict],
        session_id: Optional[str] = None
    ) -> int:
        """
        Embeds and indexes all real dialogue turns between patient and kiosk agent
        into Pinecone index `astra-conversation`.
        """
        if not dialogue_turns:
            return 0

        index = self._get_index()
        vectors_to_upsert = []

        for idx, turn in enumerate(dialogue_turns):
            turn_num = turn.get("turn_number") or (idx + 1)
            q_text = (
                turn.get("question")
                or turn.get("question_text_en")
                or turn.get("question_text")
                or ""
            ).strip()
            a_text = (
                turn.get("answer")
                or turn.get("patient_answer_en")
                or turn.get("patient_answer")
                or ""
            ).strip()

            if not q_text or not a_text:
                continue

            # Real conversation text in English
            canonical_text = f"Turn {turn_num} | Question: {q_text}\nPatient Answer: {a_text}"
            vector_id = f"{patient_id}_turn_{turn_num}"

            embedding = await self.get_embedding(canonical_text)

            vectors_to_upsert.append({
                "id": vector_id,
                "values": embedding,
                "metadata": {
                    "patient_id": str(patient_id),
                    "turn_number": int(turn_num),
                    "question": str(q_text),
                    "answer": str(a_text),
                    "timestamp": str(turn.get("timestamp") or datetime.utcnow().isoformat()),
                    "phase": str(turn.get("phase") or "interrogation"),
                    "intent": str(turn.get("clinical_intent") or turn.get("intent") or ""),
                    "text": canonical_text,
                }
            })

        if not vectors_to_upsert:
            return 0

        # Upsert in batches of 50
        batch_size = 50
        for i in range(0, len(vectors_to_upsert), batch_size):
            chunk = vectors_to_upsert[i : i + batch_size]
            index.upsert(vectors=chunk)

        print(f"[ConversationRagService] Indexed {len(vectors_to_upsert)} turns for patient {patient_id} into '{self.index_name}'")
        return len(vectors_to_upsert)

    async def ensure_patient_indexed(self, patient_id: str) -> bool:
        """
        Verifies if patient conversation is present in Pinecone; if not, pulls
        dialogue turns from MongoDB Patient record and indexes on the fly.
        """
        try:
            index = self._get_index()
            # Probe query with unit non-zero vector (cosine distance requires non-zero norm)
            dummy_vec = [0.001] * EMBEDDING_DIM
            probe = index.query(
                vector=dummy_vec,
                top_k=1,
                filter={"patient_id": {"$eq": patient_id}},
                include_metadata=False,
            )
            if probe.get("matches") and len(probe["matches"]) > 0:
                return True
        except Exception as e:
            print(f"[ConversationRagService] Probe query warning: {e}")

        # Fetch from MongoDB if available
        patient = None
        try:
            patient = await Patient.find_one({"patient_id": patient_id})
        except Exception:
            try:
                patient = await Patient.find_one(Patient.patient_id == patient_id)
            except Exception:
                patient = None

        if not patient or not patient.ai_summary:
            return False

        ai = patient.ai_summary
        turns = []
        if isinstance(ai, dict):
            st = ai.get("structured_summary") or {}
            turns = (
                (st.get("dialogue_turns") if isinstance(st, dict) else None)
                or ai.get("dialogue_turns")
                or ai.get("questions")
                or []
            )

        if turns:
            indexed_count = await self.index_patient_conversation(patient_id, turns)
            return indexed_count > 0

        return False

    async def answer_doctor_query(
        self,
        patient_id: str,
        query: str,
        doctor_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Answers doctor's query regarding patient interrogation by:
        1. Querying Pinecone `astra-conversation` for matching real dialogue turns.
        2. Prompting Sarvam AI LLM to quote exact questions and answers verbatim.
        """
        cleaned_query = (query or "").strip()
        if not cleaned_query:
            return {
                "patient_id": patient_id,
                "query": query,
                "reply": "Please provide a specific clinical question regarding the patient's interrogation.",
                "citations": []
            }

        # Ensure patient turns are in Pinecone
        await self.ensure_patient_indexed(patient_id)

        # 1. Embed query
        query_emb = await self.get_embedding(cleaned_query)

        # 2. Vector search in Pinecone
        index = self._get_index()
        retrieved_turns = []
        try:
            query_res = index.query(
                vector=query_emb,
                top_k=5,
                filter={"patient_id": {"$eq": patient_id}},
                include_metadata=True,
            )
            for m in query_res.get("matches", []):
                meta = m.get("metadata") or {}
                raw_turn = meta.get("turn_number")
                try:
                    t_num = int(float(raw_turn))
                except (ValueError, TypeError):
                    t_num = raw_turn or 1
                retrieved_turns.append({
                    "turn_number": t_num,
                    "question": meta.get("question"),
                    "answer": meta.get("answer"),
                    "timestamp": meta.get("timestamp"),
                    "score": round(float(m.get("score", 1.0)), 3),
                })
        except Exception as e:
            print(f"[ConversationRagService] Pinecone query error: {e}")

        # Fallback to MongoDB if Pinecone returned 0 turns
        if not retrieved_turns:
            patient = None
            try:
                patient = await Patient.find_one({"patient_id": patient_id})
            except Exception:
                try:
                    patient = await Patient.find_one(Patient.patient_id == patient_id)
                except Exception:
                    patient = None
            if patient and patient.ai_summary:
                st = (patient.ai_summary.get("structured_summary") or {}) if isinstance(patient.ai_summary, dict) else {}
                mongo_turns = st.get("dialogue_turns") or patient.ai_summary.get("dialogue_turns") or []
                for i, t in enumerate(mongo_turns[:6]):
                    retrieved_turns.append({
                        "turn_number": t.get("turn_number") or (i + 1),
                        "question": t.get("question") or t.get("question_text_en"),
                        "answer": t.get("answer") or t.get("patient_answer_en"),
                        "timestamp": t.get("timestamp"),
                        "score": 0.85,
                    })

        # 3. Construct prompt with real dialogue context
        context_lines = []
        for t in retrieved_turns:
            context_lines.append(
                f"[Turn #{t['turn_number']}]\n"
                f"Agent Question: \"{t['question']}\"\n"
                f"Patient Answer: \"{t['answer']}\"\n"
            )
        dialogue_context = "\n".join(context_lines) if context_lines else "No real dialogue turns recorded for this patient."

        system_prompt = (
            "You are the Astra Clinical Interrogation Assistant for attending physicians and verification health workers.\n"
            "A physician or clinical reviewer is asking about what happened during the patient's real automated interrogation session at the Astra Kiosk.\n\n"
            "MANDATORY FORMATTING & CLINICAL RULES:\n"
            "1. STRUCTURE YOUR OUTPUT STRICTLY INTO PARAGRAPHS AND BULLET POINTS. NEVER WRITE A SINGLE CONTINUOUS RUN-ON WALL OF TEXT.\n"
            "2. SUMMARY PARAGRAPH: Begin with a clear 1-2 sentence clinical summary directly addressing the question.\n"
            "3. KEY DIALOGUE & CLINICAL FINDINGS (BULLET POINTS):\n"
            "   Use bullet points (•) for each key dialogue turn or clinical finding:\n"
            "   • Quote the exact question asked and the exact answer the patient gave in English (e.g. • Turn #4: When asked about duration, the patient stated: \"...\").\n"
            "   • Highlight exact timelines, duration, severity scores (1-10), anatomical location, triggers, diurnal patterns, or medicines.\n"
            "4. CLINICAL IMPRESSION / NOTE: Conclude with a separate paragraph summarizing any diagnostic or triage significance.\n"
            "5. If the patient was NOT asked about this topic or did not give information on it, state clearly in a separate paragraph that this was not disclosed during interrogation. NEVER extrapolate or hallucinate facts.\n"
            "6. Use double newlines between paragraphs and bullet points so every section is cleanly separated and easy to read."
        )

        user_prompt = (
            f"PATIENT ID: {patient_id}\n\n"
            f"REAL CONVERSATION TURNS RETRIEVED FROM VECTOR DATABASE (ASTRA-CONVERSATION):\n"
            f"{dialogue_context}\n\n"
            f"DOCTOR'S QUESTION / DOUBT:\n"
            f"\"{cleaned_query}\"\n\n"
            f"Answer the doctor using clear paragraphs and bullet points with exact dialogue quotes:"
        )

        # 4. Generate answer via Sarvam AI LLM (with OpenAI fallback)
        ai_reply = await self._call_llm(system_prompt, user_prompt)

        return {
            "patient_id": patient_id,
            "query": cleaned_query,
            "reply": ai_reply,
            "citations": retrieved_turns,
            "total_turns_available": len(retrieved_turns),
        }

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
                    "temperature": 0.15,
                    "max_tokens": 600,
                }
                async with httpx.AsyncClient(timeout=30.0) as client:
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
                print(f"[ConversationRAG] Sarvam LLM failed, falling back to OpenAI: {e}")

        # 2. Fallback to OpenAI
        if settings.OPENAI_API_KEY:
            try:
                client = self._get_openai()
                resp = await client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    temperature=0.15,
                    max_tokens=600,
                )
                return resp.choices[0].message.content.strip()
            except Exception as e:
                print(f"[ConversationRAG] OpenAI LLM failed: {e}")

        return "Could not generate response. Please refer directly to the interrogation dialogue transcript."

    async def bootstrap_existing_patients(self) -> int:
        """
        Indexes any existing patients from MongoDB into Pinecone 'astra-conversation'.
        Non-blocking, resilient.
        """
        try:
            patients = await Patient.find_all().to_list()
            indexed_total = 0
            for p in patients:
                if p.ai_summary:
                    res = await self.ensure_patient_indexed(p.patient_id)
                    if res:
                        indexed_total += 1
            if indexed_total > 0:
                print(f"[ConversationRagService] Successfully bootstrapped {indexed_total} patients into Pinecone index '{self.index_name}'.")
            return indexed_total
        except Exception as e:
            print(f"[ConversationRagService] Error bootstrapping patients: {e}")
            return 0


# Global singleton instance
conversation_rag = ConversationRagService()
