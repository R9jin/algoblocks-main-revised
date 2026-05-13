from bson import ObjectId
from api.database import projects_collection

class ProjectRepository:
    @staticmethod
    def insert(data: dict):
        return projects_collection.insert_one(data)

    @staticmethod
    def get_all():
        return list(projects_collection.find({}))

    @staticmethod
    def delete(project_id: str):
        return projects_collection.delete_one({"_id": ObjectId(project_id)})

    @staticmethod
    def update(project_id: str, update_data: dict):
        return projects_collection.update_one({"_id": ObjectId(project_id)}, {"$set": update_data})