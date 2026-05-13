from api.database import users_collection

class UserRepository:
    @staticmethod
    def find_by_email(email: str):
        return users_collection.find_one({"email": email})

    @staticmethod
    def insert(data: dict):
        return users_collection.insert_one(data)

    @staticmethod
    def update_progress(email: str, lesson_id: str, score: int):
        return users_collection.update_one(
            {"email": email},
            {"$set": {f"progress.{lesson_id}": score}}
        )