# api/database.py
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

# BUG-17 Fix: Initialize structured application logger
logger = logging.getLogger(__name__)

api_dir = Path(__file__).resolve().parent
env_path = api_dir / ".env"
load_dotenv(dotenv_path=env_path)

MONGO_URI = os.getenv("MONGODB_URI")
if not MONGO_URI:
    raise ValueError(f"No MONGODB_URI found in environment variables. Please check your .env file at {env_path}")

try:
    client = MongoClient(MONGO_URI)
    db = client.get_default_database("algoblocks_db")
    
    projects_collection = db["projects"]
    users_collection = db["users"]
    templates_collection = db["templates"]
    
    # BUG-10 Fix: Explicitly define collections required by progress routers
    progress_collection = db["progress"]
    submissions_collection = db["submissions"]
    assessments_collection = db["assessments"]
    
    logger.info("Successfully connected to MongoDB.")
except Exception as e:
    logger.error(f"Error connecting to MongoDB: {e}", exc_info=True)
    raise