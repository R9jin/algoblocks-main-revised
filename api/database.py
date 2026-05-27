# api/database.py

import os
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

# Get the absolute path to the directory where this file (database.py) lives
api_dir = Path(__file__).resolve().parent

# Explicitly load the .env file located in the 'api' directory
env_path = api_dir / ".env"
load_dotenv(dotenv_path=env_path)

# Get MongoDB URI from environment
MONGO_URI = os.getenv("MONGODB_URI")
if not MONGO_URI:
    raise ValueError(f"No MONGODB_URI found in environment variables. Please check your .env file at {env_path}")

# Initialize MongoDB Client
try:
    client = MongoClient(MONGO_URI)
    db = client.get_default_database("algoblocks_db")
    
    projects_collection = db["projects"]
    users_collection = db["users"]
    templates_collection = db["templates"] # <--- ADD THIS LINE
    
    print("Successfully connected to MongoDB.")
except Exception as e:
    print(f"Error connecting to MongoDB: {e}")
    raise