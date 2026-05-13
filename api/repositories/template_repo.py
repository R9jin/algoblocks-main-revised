from bson import ObjectId
from api.database import templates_collection

class TemplateRepository:
    @staticmethod
    def insert(data: dict):
        return templates_collection.insert_one(data)

    @staticmethod
    def get_all():
        return list(templates_collection.find({}))

    @staticmethod
    def delete(template_id: str):
        return templates_collection.delete_one({"_id": ObjectId(template_id)})

    @staticmethod
    def update(template_id: str, update_data: dict):
        return templates_collection.update_one({"_id": ObjectId(template_id)}, {"$set": update_data})