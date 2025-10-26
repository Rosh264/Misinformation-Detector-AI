# main.py
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import hashlib
from pymongo import MongoClient
from dotenv import load_dotenv
import os
import joblib

# ---- Setup ----
load_dotenv()

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- MongoDB ----
MONGO_URL = os.getenv("MONGO_URL")
client = MongoClient(MONGO_URL)
db = client["misinfo_db"]
collection = db["hashed_headlines"]

# ---- Load AI Model ----
model = joblib.load("misinfo_model.pkl")

# ---- Data Model ----
class HeadlinesRequest(BaseModel):
    headlines: List[str]

# ---- Helper: Hashing ----
def get_headline_hash(text: str) -> str:
    normalized = text.strip().lower()
    return hashlib.sha256(normalized.encode()).hexdigest()

# ---- API Endpoint ----
@app.post("/check-headlines")
def check_headlines(req: HeadlinesRequest):
    results = []
    for headline in req.headlines:
        hash_val = get_headline_hash(headline)
        match = collection.find_one({"hash": hash_val})

        if match:
            results.append({
                "headline": headline,
                "status": "misleading",
                "reason": "Exact hash match found in known misinformation database."
            })
        else:
            # Use AI model for prediction
            pred = model.predict([headline])[0]
            if pred == 1:
                results.append({
                    "headline": headline,
                    "status": "caution",
                    "reason": "AI model flagged as potentially misleading."
                })
            else:
                results.append({
                    "headline": headline,
                    "status": "verified",
                    "reason": "No hash match, AI model found it reliable."
                })
    return {"results": results}


@app.get("/")
def read_root():
    return {"message": "Misinformation Detector API is running!"}



