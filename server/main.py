from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # <--- ADD THIS LINE
from pydantic import BaseModel
from typing import List
import hashlib # We'll use this for simple, fast hashing

# Import the database collection from our database.py file
from database import hashed_headlines

app = FastAPI()

# --- ADD THIS CORS MIDDLEWARE BLOCK ---
origins = [
    "*" # Allow all origins (less secure, but fine for local dev)
    # You could restrict this later, e.g., to your extension's ID
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Allow all methods (GET, POST, etc.)
    allow_headers=["*"], # Allow all headers
)
# --- END CORS MIDDLEWARE BLOCK ---

# ... (the rest of your code: HeadlineRequest, functions, endpoints) ...
# --- 1. Define the "shape" of our incoming data ---
# This tells FastAPI to expect a JSON object from the extension
# e.g., {"headlines": ["headline 1", "headline 2"]}
class HeadlineRequest(BaseModel):
    headlines: List[str]

# --- 2. Define the Hashing Function ---
def get_headline_hash(headline: str):
    # Normalize: convert to lowercase and remove all spaces/punctuation
    normalized = "".join(e for e in headline if e.isalnum()).lower()
    # Hash it
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

# --- 3. Create the API Endpoint ---
@app.post("/check-headlines")
def check_headlines(request: HeadlineRequest):
    results = []

    if hashed_headlines is None:
         return {"error": "Database connection not established"}

    try:
        # --- 4. Hashing Logic (The Core) ---
        for headline in request.headlines:
            # Get the hash of the incoming headline
            headline_hash = get_headline_hash(headline)

            # Check if this *exact hash* exists in our database
            match = hashed_headlines.find_one({"hash": headline_hash})

            if match:
                # FOUND A MATCH! This is known misinformation.
                results.append({
                    "headline": headline, 
                    "status": "misleading", 
                    "reason": "Exact match found in hash database"
                })
            else:
                # --- 5. Placeholder AI Logic ---
                # If no hash match, we run our (placeholder) AI check

                if "shocking" in headline.lower() or "you won't believe" in headline.lower():
                    results.append({
                        "headline": headline, 
                        "status": "caution", 
                        "reason": "AI placeholder: Flagged as clickbait"
                    })
                else:
                    # No hash match and AI found nothing wrong
                    results.append({
                        "headline": headline, 
                        "status": "verified", 
                        "reason": "No match found"
                    })

    except Exception as e:
        return {"error": str(e)}

    return {"results": results}

@app.get("/")
def read_root():
    return {"message": "Misinformation Detector API is running!"}



