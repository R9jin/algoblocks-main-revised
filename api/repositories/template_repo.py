# api/repositories/template_repo.py
from database import templates_collection
from bson.objectid import ObjectId

class TemplateRepository:
    @staticmethod
    def find_by_category(category: str):
        templates = list(templates_collection.find({"category": category}))
        for tpl in templates:
            tpl["_id"] = str(tpl["_id"])
        return templates

    @staticmethod
    def find_all():
        templates = list(templates_collection.find({}))
        for tpl in templates:
            tpl["_id"] = str(tpl["_id"])
        return templates

    # ADDED: Save method to push to database
    @staticmethod
    def save(template_data: dict):
        result = templates_collection.insert_one(template_data)
        return str(result.inserted_id)

    # ADDED: Update method for existing templates
    @staticmethod
    def update(template_id: str, template_data: dict):
        try:
            obj_id = ObjectId(template_id)
        except Exception:
            obj_id = template_id
            
        templates_collection.update_one(
            {"_id": obj_id},
            {"$set": template_data},
            upsert=True
        )
        return str(template_id)