import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load the secret connection string from the .env file
load_dotenv()
MONGO_URL = os.getenv("MONGO_URL")

# --- DEBUG LINE ---
print(f"DEBUG: My MONGO_URL is: {MONGO_URL}")
# ------------------

# Connect to the MongoDB database
try:
    if not MONGO_URL:
        raise Exception("MONGO_URL not found. Make sure your .env file is correct.")

    client = MongoClient(MONGO_URL, tlsAllowInvalidCertificates=True)
    db = client.misinfo_db  # This is your database name
    hashed_headlines = db.hashed_headlines # This is your collection name

    # Test the connection by sending a 'ping'
    client.admin.command('ping')
    print("✅ MongoDB connection successful.")

except Exception as e:
    print(f"Error connecting to MongoDB: {e}")
    client = None
    hashed_headlines = None 