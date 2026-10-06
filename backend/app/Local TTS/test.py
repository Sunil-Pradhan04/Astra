from kokoro import KPipeline
import soundfile as sf

pipeline = KPipeline(lang_code="h")

text = "नमस्ते! मैं आपका हिंदी AI सहायक हूँ।"

generator = pipeline(
    text,
    voice="hf_alpha",
    speed=1.0
)

for _, _, audio in generator:
    sf.write("hindi.wav", audio, 24000)
    break

print("✅ Generated hindi.wav")