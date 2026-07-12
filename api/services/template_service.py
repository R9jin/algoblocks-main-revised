# api/services/template_service.py
from repositories.template_repo import TemplateRepository

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
        
        if template_id:
            updated_id = TemplateRepository.update(template_id, template_data)
            return {
                "status": "success", 
                "message": "Template updated successfully", 
                "templateId": updated_id
            }
        else:
            inserted_id = TemplateRepository.save(template_data)
            return {
                "status": "success", 
                "message": "Template saved successfully", 
                "templateId": inserted_id
            }