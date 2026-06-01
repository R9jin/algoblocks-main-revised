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

    # ADDED: Method to handle saving a template
    @staticmethod
    def save_template(req):
        # Convert pydantic model to dict if necessary
        template_data = req.dict() if hasattr(req, "dict") else dict(req)
        
        # Save to repo
        inserted_id = TemplateRepository.save(template_data)
        
        return {
            "status": "success", 
            "message": "Template saved successfully", 
            "template_id": inserted_id
        }