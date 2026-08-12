# api/services/template_service.py
from repositories.template_repo import TemplateRepository
from fastapi import HTTPException

MAX_TEMPLATES_PER_USER = 20

class TemplateService:
    @staticmethod
    def get_templates_by_category(category: str):
        templates = TemplateRepository.find_by_category(category)
        return {"status": "success", "templates": templates}

    @staticmethod
    def get_all_templates():
        templates = TemplateRepository.find_all()
        return {"status": "success", "templates": templates}

    @staticmethod
    def save_template(req):
        if hasattr(req, "model_dump"):
            template_data = req.model_dump(exclude_unset=True)
        elif hasattr(req, "dict"):
            template_data = req.dict(exclude_unset=True)
        else:
            template_data = dict(req)
        
        if template_data.get("userId") and not template_data.get("owner_id"):
            template_data["owner_id"] = template_data["userId"]
            
        template_id = template_data.get("templateId", None)
        user_id = template_data.get("userId")
        
        if template_id:
            updated_id = TemplateRepository.update(template_id, template_data, user_id=user_id)
            if updated_id is None:
                # Either the template doesn't exist, or it exists but isn't
                # owned by this user -- don't leak which, just refuse.
                raise HTTPException(
                    status_code=403,
                    detail="You don't have permission to modify this template."
                )
            return {
                "status": "success", 
                "message": "Template updated successfully", 
                "templateId": updated_id
            }
        else:
            user_id = template_data.get("userId")
            if user_id:
                # Atomic check-and-insert (advisory-lock-guarded transaction)
                # instead of a separate count check + insert, which raced
                # under rapid repeated saves -- see
                # TemplateRepository.save_if_under_limit.
                inserted_id = TemplateRepository.save_if_under_limit(template_data, MAX_TEMPLATES_PER_USER)
                if inserted_id is None:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Template limit reached ({MAX_TEMPLATES_PER_USER} max per account). Please delete an existing template before creating a new one."
                    )
            else:
                inserted_id = TemplateRepository.save(template_data)
            return {
                "status": "success", 
                "message": "Template saved successfully", 
                "templateId": inserted_id
            }