# api/repositories/template_repo.py
from database import templates_collection

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