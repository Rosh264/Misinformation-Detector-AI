# main.py
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Union
import hashlib
from pymongo import MongoClient
from dotenv import load_dotenv
import os
import joblib
import numpy as np # Import numpy for array handling

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
model = None # Initialize model to None
try:
    model = joblib.load("misinfo_model.pkl")
    print("AI Model loaded successfully!")
except Exception as e:
    print(f"ERROR: Could not load AI model (misinfo_model.pkl): {e}")
    # Handle case where model is not loaded, e.g., use default responses
    # or raise an exception to prevent server start if model is critical.

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

        probabilities: Dict[str, float] = {"verified": 0.0, "misleading": 0.0, "caution": 0.0} # Default

        if match:
            results.append({
                "headline": headline,
                "status": "misleading",
                "reason": "Exact hash match found in known misinformation database.",
                "probabilities": {"misleading": 1.0, "verified": 0.0, "caution": 0.0} # High confidence for hash match
            })
        else:
            if model is not None:
                try:
                    # Predict class (e.g., 0 or 1)
                    pred = model.predict([headline])[0]

                    # Get prediction probabilities
                    # IMPORTANT: Assumes model has predict_proba and outputs probabilities for classes
                    # You might need to adjust class labels (0 and 1) based on your model's training
                    if hasattr(model, 'predict_proba'):
                        proba = model.predict_proba([headline])[0]
                        # Assuming class 0 is "verified" and class 1 is "misleading/caution"
                        # Adjust these indices (0, 1) if your model's classes are different
                        probabilities["verified"] = proba[0] if len(proba) > 0 else 0.0
                        probabilities["misleading"] = proba[1] if len(proba) > 1 else 0.0
                        probabilities["caution"] = proba[1] if len(proba) > 1 else 0.0 # Using misleading prob for caution too, adjust if you have a 3rd class

                    if pred == 1: # Assuming 1 corresponds to misleading/caution
                        results.append({
                            "headline": headline,
                            "status": "caution", # Or "misleading" depending on model's certainty
                            "reason": "AI model flagged as potentially misleading.",
                            "probabilities": probabilities
                        })
                    else: # Assuming 0 corresponds to verified
                        results.append({
                            "headline": headline,
                            "status": "verified",
                            "reason": "No hash match, AI model found it reliable.",
                            "probabilities": probabilities
                        })
                except Exception as e:
                    print(f"ERROR: AI model prediction failed for headline '{headline}': {e}")
                    results.append({
                        "headline": headline,
                        "status": "error",
                        "reason": f"AI prediction error: {e}",
                        "probabilities": {"error": 1.0}
                    })
            else:
                results.append({
                    "headline": headline,
                    "status": "error",
                    "reason": "AI Model not loaded on server.",
                    "probabilities": {"error": 1.0}
                })
    return {"results": results}


@app.get("/")
def read_root():
    return {"message": "Misinformation Detector API is running!"}
