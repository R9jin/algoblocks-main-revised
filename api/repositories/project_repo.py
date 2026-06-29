# api/repositories/project_repo.py
from database import projects_collection
from bson import ObjectId

class ProjectRepository:
    @staticmethod
    def find_by_user(user_id: str):
        projects = list(projects_collection.find({"$or": [{"userId": user_id}, {"owner_id": user_id}]}))
        for proj in projects:
            proj["_id"] = str(proj["_id"])
            if "userId" not in proj and "owner_id" in proj:
                proj["userId"] = proj["owner_id"]
            if "owner_id" not in proj and "userId" in proj:
                proj["owner_id"] = proj["userId"]
        return projects

    @staticmethod
    def insert(project_data: dict):
        result = projects_collection.insert_one(project_data)
        return str(result.inserted_id)

    @staticmethod
    def update(project_id: str, user_id: str, data: dict):
        try:
            obj_id = ObjectId(project_id)
        except Exception:
            obj_id = project_id
        return projects_collection.update_one(
            {"_id": obj_id, "$or": [{"userId": user_id}, {"owner_id": user_id}]},
            {"$set": data}
        )

    @staticmethod
    def delete(project_id: str, user_id: str):
        try:
            obj_id = ObjectId(project_id)
        except Exception:
            obj_id = project_id
        return projects_collection.delete_one({"_id": obj_id, "$or": [{"userId": user_id}, {"owner_id": user_id}]})