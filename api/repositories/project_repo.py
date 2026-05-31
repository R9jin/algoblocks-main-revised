# api/repositories/project_repo.py
from database import projects_collection
from bson import ObjectId

class ProjectRepository:
    @staticmethod
    def find_by_user(user_id: str):
        projects = list(projects_collection.find({"userId": user_id}))
        for proj in projects:
            proj["_id"] = str(proj["_id"])
        return projects

    @staticmethod
    def insert(project_data: dict):
        result = projects_collection.insert_one(project_data)
        return str(result.inserted_id)

    @staticmethod
    def update(project_id: str, user_id: str, data: dict):
        return projects_collection.update_one(
            {"_id": ObjectId(project_id), "userId": user_id},
            {"$set": data}
        )

    @staticmethod
    def delete(project_id: str, user_id: str):
        return projects_collection.delete_one({"_id": ObjectId(project_id), "userId": user_id})