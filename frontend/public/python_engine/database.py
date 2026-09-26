# frontend\public\python_engine\database.py
import os
from dotenv import load_dotenv
from pymongo import MongoClient

# Load environment variables from .env
load_dotenv()

# Get MongoDB URI from environment
MONGO_URI = os.getenv("MONGODB_URI")
if not MONGO_URI:
    raise ValueError("No MONGODB_URI found in environment variables. Please check your .env file.")

# Connect to MongoDB
try:
    client = MongoClient(MONGO_URI)
    db = client.get_database("algoblocks_db")  # Replace with your DB name

    # Define your collections
    projects_collection = db["projects"]
    users_collection = db["users"]
    templates_collection = db["templates"] # <--- ADD THIS LINE

    print("Successfully connected to MongoDB.")

except Exception as e:
    print(f"Error connecting to MongoDB: {e}")
    raise  # Reraise to stop app startup if DB connection fails