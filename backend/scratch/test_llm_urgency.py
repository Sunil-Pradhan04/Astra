import asyncio
import json
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.services.sarvam_service import sarvam_ai

sys_prompt = """You are an expert clinical triage emergency validation AI.
A keyword/NLP detector flagged an urgency trigger in a patient statement.
Distinguish genuine acute emergencies from mild, chronic, or benign mentions.

RULES:
1. TRUE EMERGENCY (is_true_emergency = true, should_halt_interview = true):
   - Severe, crushing chest pain, cannot breathe / gasping, collapse, unconsciousness, heavy uncontrolled bleeding.
2. NON-EMERGENCY / MOVE FORWARD (is_true_emergency = false, should_halt_interview = false):
   - Explicitly 'mild', 'slight', 'minor', 'gas pain', chronic for weeks/months, bearable discomfort.
   - For these, DO NOT halt the interview; move forward so the full triage interview is completed.

Return JSON ONLY:
{
  "is_true_emergency": boolean,
  "should_halt_interview": boolean,
  "severity": "critical" | "moderate" | "mild",
  "reason": "short reason"
}"""

async def test():
    test_cases = [
        "i am feeling mild heart pain",
        "severe crushing heart pain radiating to left arm and sweating",
        "just a slight pain in chest since 2 weeks",
        "cannot breathe suffocating",
    ]
    for tc in test_cases:
        res = await sarvam_ai.generate_completion(sys_prompt, f'Patient statement: "{tc}"\nConcept: chest_pain_critical\nJSON response:')
        print(f"=== TEST: {tc}")
        print(res)

if __name__ == "__main__":
    asyncio.run(test())
