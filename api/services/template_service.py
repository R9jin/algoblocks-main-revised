from fastapi import HTTPException
from api.repositories.template_repo import TemplateRepository
from api.models import TemplateModel, TemplateUpdate

class TemplateService:
    @staticmethod
    def create_template(template: TemplateModel):
        if TemplateRepository.insert is None:
            raise HTTPException(500, "Database not connected")
        result = TemplateRepository.insert(template.model_dump())
        return {"status": "success", "id": str(result.inserted_id)}

    @staticmethod
    def get_templates():
        templates = TemplateRepository.get_all()
        for t in templates:
            t["_id"] = str(t["_id"])
        return {"status": "success", "templates": templates}

    @staticmethod
    def delete_template(template_id: str):
        result = TemplateRepository.delete(template_id)
        if result.deleted_count == 0:
            raise HTTPException(404, "Template not found")
        return {"status": "success"}

    @staticmethod
    def update_template(template_id: str, payload: TemplateUpdate):
        update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
        result = TemplateRepository.update(template_id, update_data)
        if result.matched_count == 0:
            raise HTTPException(404, "Template not found")
        return {"status": "success"}