# api/repositories/user_repo.py
from database import users_collection

class UserRepository:
    @staticmethod
    def find_by_email(email: str):
        return users_collection.find_one({"email": email}, {"_id": 0})

    @staticmethod
    def insert(user_data: dict):
        return users_collection.insert_one(user_data)

    @staticmethod
    def update_progress(email: str, lesson_id: str, score: int):
        users_collection.update_one(
            {"email": email},
            {"$set": {f"progress.{lesson_id}": score}}
        )

    @staticmethod
    def update_assessment(email: str, assessment_key: str, data: dict):
        users_collection.update_one(
            {"email": email},
            {"$set": {f"assessments.{assessment_key}": data}}
        )
        
    @staticmethod
    def find_all_users():
        # Exclude passwords and MongoDB ObjectIds from the response payload
        users = list(users_collection.find({}, {"password": 0, "_id": 0}))
        return users

    @staticmethod
    def update_user_status(email: str, status: str):
        return users_collection.update_one(
            {"email": email},
            {"$set": {"status": status}}
        )

    @staticmethod
    def delete_user(email: str):
        return users_collection.delete_one({"email": email})