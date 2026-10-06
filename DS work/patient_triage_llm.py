"""
Clinical Patient Triage LLM Layer
---------------------------------
1. Accepts patient-reported symptoms.
2. Retrieves top matching candidate diseases from Pinecone index ('astra-diseases').
3. Passes patient symptoms + retrieved disease-symptom profiles to OpenAI LLM.
4. Generates intelligent, clinical follow-up questions to differentiate candidate diseases
   and screen for critical red flags.
"""

import os
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
from openai import OpenAI
from pinecone import Pinecone

# Load environment variables
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)


class PatientTriageLLM:
    def __init__(
        self,
        openai_api_key: Optional[str] = None,
        pinecone_api_key: Optional[str] = None,
        pinecone_index: Optional[str] = None,
        llm_model: str = "gpt-4o-mini",
        embedding_model: str = "text-embedding-3-small"
    ):
        self.openai_api_key = openai_api_key or os.getenv("OPEN_AI_API")
        self.pinecone_api_key = pinecone_api_key or os.getenv("PINECONE_API_KEY")
        self.pinecone_index_name = pinecone_index or os.getenv("PINECONE_INDEX", "astra-diseases")
        self.llm_model = llm_model
        self.embedding_model = embedding_model

        if not self.openai_api_key:
            raise ValueError("OPEN_AI_API key not found in environment or arguments.")
        if not self.pinecone_api_key:
            raise ValueError("PINECONE_API_KEY not found in environment or arguments.")

        # Initialize clients
        self.openai_client = OpenAI(api_key=self.openai_api_key)
        self.pc = Pinecone(api_key=self.pinecone_api_key)
        self.index = self.pc.Index(self.pinecone_index_name)

    def retrieve_candidate_diseases(self, symptoms_text: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Embeds the input symptoms text and retrieves top_k nearest disease profiles from Pinecone.
        """
        if not symptoms_text or not symptoms_text.strip():
            return []

        # 1. Generate query embedding (1536 dim)
        emb_res = self.openai_client.embeddings.create(
            input=[symptoms_text.strip()],
            model=self.embedding_model
        )
        query_vector = emb_res.data[0].embedding

        # 2. Query Pinecone vector index
        query_res = self.index.query(
            vector=query_vector,
            top_k=top_k,
            include_metadata=True
        )

        candidates = []
        for match in query_res.matches:
            metadata = match.metadata or {}
            candidates.append({
                "id": match.id,
                "disease": metadata.get("disease", ""),
                "similarity_score": round(match.score, 4),
                "characteristic_symptoms": metadata.get("symptoms", "")
            })

        return candidates

    def generate_followup_questions(
        self,
        patient_symptoms: str,
        language: str = "English",
        top_k: int = 5,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Retrieves candidate diseases from Pinecone and asks OpenAI LLM to formulate
        targeted follow-up questions to differentiate between suspected conditions.
        """
        # Step 1: Retrieve candidate diseases from Pinecone
        candidates = self.retrieve_candidate_diseases(patient_symptoms, top_k=top_k)

        # Step 2: Format history if provided
        history_context = ""
        if conversation_history:
            history_context = "\nPreviously Asked Questions & Patient Answers:\n"
            for item in conversation_history:
                q = item.get("question", "")
                a = item.get("answer", "")
                history_context += f"- Q: {q}\n  A: {a}\n"

        # Step 3: Build Prompt for OpenAI LLM
        system_prompt = (
            "You are an expert Clinical Diagnostic & Triage AI at a primary care clinic. "
            "Your task is to analyze the patient's reported symptoms alongside disease candidates "
            "retrieved from our medical vector database. "
            "Generate targeted, high-yield follow-up questions to help differentiate between "
            "the suspected conditions and screen for urgent red flags. "
            "Never repeat symptoms or questions the patient has already described or answered. "
            "Respond ONLY with a strictly valid JSON object."
        )

        user_prompt = f"""
Patient's Initial Complaint / Symptoms:
\"{patient_symptoms}\"
{history_context}
Suspected Candidate Diseases retrieved from Pinecone Vector Index:
{json.dumps(candidates, indent=2)}

Language Preference for Questions: {language}

CLINICAL INSTRUCTIONS:
1. Examine the patient's symptoms and match them against the retrieved candidate diseases.
2. Identify missing differentiating symptoms that can help distinguish between these candidate diseases.
3. Formulate 3-4 targeted, patient-friendly follow-up questions.
4. If Language is not English (e.g., Hindi, Odia), provide the question in the requested language AND include its English translation.
5. Identify any potential red flags or emergency signs related to these candidate diseases.

Return PURE JSON using the following structure:
{{
  "reported_symptoms": ["<list of symptoms identified in patient report>"],
  "retrieved_candidates": [
    {{
      "disease": "<disease_name>",
      "similarity_score": <float>,
      "overlapping_symptoms": ["<symptoms patient has>"],
      "discriminating_symptoms_to_check": ["<symptoms to investigate>"]
    }}
  ],
  "followup_questions": [
    {{
      "question_id": 1,
      "question_text": "<patient-friendly question phrased in {language}>",
      "question_text_en": "<question in English>",
      "clinical_intent": "<short medical reason for asking this>",
      "target_differential": "<which disease or symptom this question tests for>"
    }}
  ],
  "red_flag_warnings": ["<list of any red flags to monitor, or empty list>"],
  "clinical_summary": "<brief 1-2 sentence assessment of the clinical presentation>"
}}
"""

        # Step 4: Call OpenAI Chat Completions API
        response = self.openai_client.chat.completions.create(
            model=self.llm_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.2
        )

        raw_content = response.choices[0].message.content
        result_json = json.loads(raw_content)

        # Attach Pinecone candidates directly to output for transparency
        result_json["pinecone_matches"] = candidates
        return result_json


import sys
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


def print_triage_result(result: Dict[str, Any]):
    """Pretty prints the triage result to terminal."""
    print("\n" + "=" * 70)
    print("CLINICAL TRIAGE & FOLLOW-UP GENERATION RESULT")
    print("=" * 70)

    print("\n[Reported Symptoms]:", ", ".join(result.get("reported_symptoms", [])))
    print(f"[Clinical Assessment]: {result.get('clinical_summary', '')}")

    print("\n[Top Candidate Diseases from Pinecone]:")
    for cand in result.get("retrieved_candidates", []):
        disease = cand.get("disease")
        score = cand.get("similarity_score", 0.0)
        overlap = ", ".join(cand.get("overlapping_symptoms", []))
        to_check = ", ".join(cand.get("discriminating_symptoms_to_check", []))
        print(f"  * {disease.upper()} (Similarity: {score:.4f})")
        print(f"    - Matching Symptoms: {overlap or 'None identified'}")
        print(f"    - To Investigate   : {to_check}")

    print("\n[Generated Clinical Follow-up Questions]:")
    for q in result.get("followup_questions", []):
        qid = q.get("question_id")
        qtext = q.get("question_text")
        qtext_en = q.get("question_text_en")
        intent = q.get("clinical_intent")
        target = q.get("target_differential")

        print(f"\n  Q{qid}: \"{qtext}\"")
        if qtext_en and qtext_en != qtext:
            print(f"       (English: \"{qtext_en}\")")
        print(f"       Intent: {intent}")
        print(f"       Target: {target}")

    red_flags = result.get("red_flag_warnings", [])
    if red_flags:
        print("\n[Red Flag Warnings]:")
        for rf in red_flags:
            print(f"  [!] {rf}")

    print("\n" + "=" * 70)


if __name__ == "__main__":
    triage_service = PatientTriageLLM()

    # Test Case 1: Respiratory patient
    test_complaint_1 = "I have had a high fever for 3 days, accompanied by sharp chest pain when coughing and shortness of breath."
    print(f"\nProcessing Case 1: \"{test_complaint_1}\"")
    result_1 = triage_service.generate_followup_questions(
        patient_symptoms=test_complaint_1,
        language="English",
        top_k=4
    )
    print_triage_result(result_1)

    # Test Case 2: Hindi language preference test
    test_complaint_2 = "मुझे पेट में बहुत तेज दर्द हो रहा है और उल्टी जैसा लग रहा है।"
    print(f"\nProcessing Case 2 (Hindi): \"{test_complaint_2}\"")
    result_2 = triage_service.generate_followup_questions(
        patient_symptoms="Severe sharp abdominal pain and vomiting sensations",
        language="Hindi",
        top_k=4
    )
    print_triage_result(result_2)
