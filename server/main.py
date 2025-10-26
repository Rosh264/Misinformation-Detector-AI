# main.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
from typing import List
import hashlib
from pymongo import MongoClient
from dotenv import load_dotenv
import os
import joblib
import numpy as np # Make sure numpy is in requirements.txt

# --- Setup ----
load_dotenv()

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows all origins for development
    allow_credentials=True,
    allow_methods=["*"], # Allows all methods
    allow_headers=["*"], # Allows all headers
)

# --- MongoDB ----
MONGO_URL = os.getenv("MONGO_URL")
client = None
collection = None
try:
    if not MONGO_URL:
        raise ValueError("MONGO_URL environment variable not set.")
    # Add tlsAllowInvalidCertificates=True only if needed for local Mac SSL issues
    # client = MongoClient(MONGO_URL, tlsAllowInvalidCertificates=True)
    client = MongoClient(MONGO_URL)
    db = client["misinfo_db"]
    collection = db["hashed_headlines"]
    client.admin.command('ping') # Verify connection
    print("✅ MongoDB connection successful.")
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")
    # You might want the app to fail startup if DB connection fails
    # raise RuntimeError("Failed to connect to MongoDB") from e


# --- Load AI Model ----
model = None
try:
    model_path = "misinfo_model.pkl"
    if not os.path.exists(model_path):
         raise FileNotFoundError(f"Model file not found at {model_path}")
    model = joblib.load(model_path)
    print(f"✅ AI model '{model_path}' loaded successfully.")
    # Optional: Print model classes if needed for debugging probabilities
    # if hasattr(model, 'classes_'):
    #    print(f"Model classes: {model.classes_}")
except Exception as e:
    print(f"❌ Failed to load AI model: {e}")
    # Decide if the app should run without the AI model
    # raise RuntimeError("Failed to load AI model") from e


# --- Pydantic Data Model ----
class HeadlinesRequest(BaseModel):
    headlines: List[str]


# --- Custom Exception Handler for Validation Errors ---
# This helps log the exact validation error causing the 400/422 status
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"❌ Pydantic Validation Error for request: {request.url}")
    print(f"Details: {exc.errors()}") # Log the detailed errors
    # Return a standard 422 Unprocessable Entity response
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

# --- Helper: Hashing ----
def get_headline_hash(text: str) -> str:
    # Normalize: remove non-alphanumeric, convert to lowercase
    normalized = "".join(e for e in text if e.isalnum()).lower()
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

# --- API Endpoint ----
@app.post("/check-headlines")
async def check_headlines(req: HeadlinesRequest): # Use async def for consistency
    results = []

    if collection is None:
         print("❌ /check-headlines: Database collection is not available.")
         raise HTTPException(status_code=500, detail="Database connection not established")
    if model is None:
         print("❌ /check-headlines: AI model is not available.")
         raise HTTPException(status_code=500, detail="AI model not loaded")

    print(f"Received request to check {len(req.headlines)} headlines.")

    for headline in req.headlines:
        status = "error"
        reason = "Processing failed"
        probabilities = {"error": "Prediction not run"} # Default error state

        try:
            # 1. Hashing Check
            headline_hash = get_headline_hash(headline)
            match = collection.find_one({"hash": headline_hash})

            if match:
                status = "misleading"
                reason = "Exact hash match found in known misinformation database."
                # Assign default probabilities or skip if hash match is definitive
                probabilities = {"misleading": 1.0, "verified": 0.0}
                print(f"  -> Headline matched hash: '{headline[:50]}...'")

            else:
                # 2. AI Model Check (if no hash match)
                try:
                    # Use predict_proba to get probabilities
                    # Assumes model.predict_proba returns [[prob_class_0, prob_class_1]]
                    # IMPORTANT: Verify the order of classes! Let's assume class 0 = verified, class 1 = misleading/caution
                    proba = model.predict_proba([headline])[0]

                    # Verify class order - Adjust indices [0] and [1] if needed!
                    # Example: if model.classes_ is ['misleading', 'verified'], then proba[0] is misleading, proba[1] is verified
                    prob_verified = float(proba[0]) # Assuming class 0 is verified
                    prob_misleading = float(proba[1]) # Assuming class 1 is misleading/caution

                    probabilities = {
                        "verified": prob_verified,
                        "misleading": prob_misleading
                    }

                    # Determine final status based on probability (adjust threshold as needed)
                    threshold = 0.6 # Example: If > 60% likely misleading, flag as caution
                    if prob_misleading > threshold:
                        status = "caution"
                        reason = f"AI model flagged as potentially misleading (Confidence: {prob_misleading*100:.1f}%)"
                    else:
                        status = "verified"
                        reason = f"No hash match found. AI confidence (Real): {prob_verified*100:.1f}%"
                    print(f"  -> Headline checked by AI: Status={status}, Probs={probabilities}, Text='{headline[:50]}...'")

                except AttributeError:
                     # Fallback if model doesn't have predict_proba
                    print(f"  -> AI model for '{headline[:50]}...' lacks predict_proba. Using predict.")
                    pred = model.predict([headline])[0]
                    # Assuming 1 = misleading/caution, 0 = verified
                    if pred == 1:
                        status = "caution"
                        reason = "AI model flagged as potentially misleading (predict)."
                        probabilities = {"error": "Probabilities unavailable (predict used)"}
                    else:
                        status = "verified"
                        reason = "No hash match, AI model found it reliable (predict)."
                        probabilities = {"error": "Probabilities unavailable (predict used)"}
                    print(f"  -> AI Fallback Predict: Status={status}")

                except Exception as ai_err:
                    print(f"❌ Error during AI prediction for '{headline[:50]}...': {ai_err}")
                    status = "error"
                    reason = f"AI prediction failed: {ai_err}"
                    probabilities = {"error": "AI prediction failed"}


            results.append({
                "headline": headline,
                "status": status,
                "reason": reason,
                "probabilities": probabilities
            })

        except Exception as e:
            print(f"❌ Error processing headline '{headline[:50]}...': {e}")
            results.append({
                "headline": headline,
                "status": "error",
                "reason": f"Internal server error during processing: {e}",
                "probabilities": {"error": "Processing error"}
            })

    print(f"Finished processing request. Returning {len(results)} results.")
    return {"results": results}


@app.get("/")
async def read_root(): # Use async def
    return {"message": "Misinformation Detector API is running!"}

