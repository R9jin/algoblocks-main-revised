# api/services/project_service.py
from repositories.project_repo import ProjectRepository
from models import ProjectSyncRequest
from fastapi import HTTPException
from datetime import datetime

class ProjectService:
    @staticmethod
    def get_user_projects(user_id: str):
        if not user_id:
            raise HTTPException(status_code=400, detail="Missing userId")
        projects = ProjectRepository.find_by_user(user_id)
        return {"status": "success", "projects": projects}

    @staticmethod
    def save_project(req: ProjectSyncRequest):
        proj_name = req.name or req.title or "Untitled Project"
        update_data = {
            "name": proj_name,
            "title": proj_name,
            "description": req.description or "",
            "workspace": req.workspace or {},
            "pythonCode": req.pythonCode or "",
            "updatedAt": datetime.utcnow().isoformat(),
            "userId": req.userId,
            "owner_id": req.userId
        }

        if req.projectId and not str(req.projectId).startswith("local_"):
            result = ProjectRepository.update(req.projectId, req.userId, update_data)
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Project not found or unauthorized")
            return {"status": "success", "projectId": req.projectId, "synced": True}
        else:
            update_data["createdAt"] = update_data["updatedAt"]
            project_id = ProjectRepository.insert(update_data)
            return {"status": "success", "projectId": project_id, "synced": True}

    @staticmethod
    def delete_project(payload: dict):
        project_id = payload.get("projectId")
        user_id = payload.get("userId") or payload.get("owner_id")

        if not project_id or not user_id:
            raise HTTPException(status_code=400, detail="Missing projectId or userId")

        result = ProjectRepository.delete(project_id, user_id)
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Project not found or unauthorized")

        return {"status": "success"}