"""
Upload Disease and Symptoms Dataset to Pinecone Vector Index
-----------------------------------------------------------
- Model: text-embedding-3-small (1536 dimensions)
- Index: astra-diseases (Pinecone Serverless)
- Record format:
  {
    "id": "disease:<disease_name>",
    "values": [ ...1536 numbers... ],
    "metadata": {
      "disease": "<disease_name>",
      "symptoms": "<comma_separated_symptoms>"
    }
  }
"""

import os
import csv
import time
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
from pinecone import Pinecone

# 1. Load environment variables
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

OPENAI_API_KEY = os.getenv("OPEN_AI_API")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX", "astra-diseases")

if not OPENAI_API_KEY:
    raise ValueError("OPEN_AI_API not found in .env")
if not PINECONE_API_KEY:
    raise ValueError("PINECONE_API_KEY not found in .env")

CSV_PATH = Path(__file__).resolve().parent / "disease_symptoms_normalized.csv"
if not CSV_PATH.exists():
    raise FileNotFoundError(f"CSV file not found at {CSV_PATH}")

print("=" * 60)
print("Starting Disease Ingestion into Pinecone")
print(f"Index Name: {PINECONE_INDEX_NAME}")
print(f"CSV Path  : {CSV_PATH}")
print("=" * 60)

# 2. Initialize Clients
openai_client = OpenAI(api_key=OPENAI_API_KEY)
pc = Pinecone(api_key=PINECONE_API_KEY)

index = pc.Index(PINECONE_INDEX_NAME)
index_stats = index.describe_index_stats()
print(f"Initial Index Stats: {index_stats}")

# 3. Read dataset
records = []
with open(CSV_PATH, mode="r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    for row in reader:
        disease = row.get("disease", "").strip()
        symptoms = row.get("symptoms", "").strip()
        if disease:
            records.append({
                "disease": disease,
                "symptoms": symptoms
            })

total_records = len(records)
print(f"Loaded {total_records} valid disease records from CSV.")

# 4. Batch Embed and Upsert
BATCH_SIZE = 50
total_batches = (total_records + BATCH_SIZE - 1) // BATCH_SIZE
upserted_count = 0

start_time = time.time()

for batch_idx in range(total_batches):
    start = batch_idx * BATCH_SIZE
    end = min(start + BATCH_SIZE, total_records)
    batch = records[start:end]

    # Prepare embedding inputs: combining disease identity and clinical symptoms
    texts_to_embed = [f"{item['disease']}: {item['symptoms']}" for item in batch]

    # Generate embeddings with OpenAI text-embedding-3-small (1536 dim)
    response = openai_client.embeddings.create(
        input=texts_to_embed,
        model="text-embedding-3-small"
    )

    # Format vectors according to user specification
    batch_vectors = []
    for item, emb_data in zip(batch, response.data):
        disease_clean = item["disease"].strip().lower()
        vector_record = {
            "id": f"disease:{disease_clean}",
            "values": emb_data.embedding,
            "metadata": {
                "disease": item["disease"].strip(),
                "symptoms": item["symptoms"].strip()
            }
        }
        batch_vectors.append(vector_record)

    # Upsert to Pinecone
    index.upsert(vectors=batch_vectors)
    upserted_count += len(batch_vectors)

    print(f"[{batch_idx + 1:02d}/{total_batches:02d}] Upserted {len(batch_vectors)} vectors (Progress: {upserted_count}/{total_records}). First ID: '{batch_vectors[0]['id']}'")

elapsed = time.time() - start_time
print("=" * 60)
print(f"Successfully embedded and upserted {upserted_count} vectors in {elapsed:.2f} seconds!")
print("=" * 60)

# 5. Verification
print("Waiting 5 seconds for Pinecone index synchronization...")
time.sleep(5)

updated_stats = index.describe_index_stats()
print(f"Updated Pinecone Index Stats: {updated_stats}")

# 6. Test Query
test_query = "fever, cough, shortness of breath, chest pain"
print(f"\nRunning test semantic search for query: '{test_query}'...")
q_emb = openai_client.embeddings.create(
    input=[test_query],
    model="text-embedding-3-small"
).data[0].embedding

query_results = index.query(
    vector=q_emb,
    top_k=5,
    include_metadata=True
)

print("\nTop 5 semantic matches:")
for rank, match in enumerate(query_results.matches, start=1):
    meta = match.metadata or {}
    print(f"{rank}. [{match.score:.4f}] ID: {match.id}")
    print(f"   Disease : {meta.get('disease')}")
    print(f"   Symptoms: {meta.get('symptoms')}\n")
