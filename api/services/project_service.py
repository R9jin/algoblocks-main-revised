# api/services/project_service.py
from repositories.project_repo import ProjectRepository
from models import ProjectSyncRequest
from fastapi import HTTPException
from datetime import datetime
import time

MAX_PROJECTS_PER_USER = 20

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
            "timestamp": req.timestamp or int(time.time() * 1000),
            "userId": req.userId,
            "owner_id": req.owner_id or req.userId,
            "projectId": req.projectId,
            "isSynced": True
        }

        if req.projectId and not str(req.projectId).startswith("local_"):
            # ProjectRepository.update now returns rowcount instead of PyMongo object
            rowcount = ProjectRepository.update(req.projectId, req.userId, update_data)
            if rowcount == 0 or rowcount is None:
                raise HTTPException(status_code=404, detail="Project not found or unauthorized")
            return {"status": "success", "projectId": req.projectId, "synced": True}
        else:
            # Count-check-then-insert used to be two separate statements,
            # which raced under rapid repeated saves (see
            # ProjectRepository.insert_if_under_limit). Do both atomically
            # under one advisory-lock-guarded transaction instead.
            project_id = ProjectRepository.insert_if_under_limit(update_data, MAX_PROJECTS_PER_USER)
            if project_id is None:
                raise HTTPException(
                    status_code=403,
                    detail=f"Project limit reached ({MAX_PROJECTS_PER_USER} max per account). Please delete an existing project before creating a new one."
                )
            return {"status": "success", "projectId": project_id, "synced": True}

    @staticmethod
    def delete_project(payload: dict):
        project_id = payload.get("projectId")
        user_id = payload.get("userId") or payload.get("owner_id")

        if not project_id or not user_id:
            raise HTTPException(status_code=400, detail="Missing projectId or userId")

        # ProjectRepository.delete now returns rowcount instead of PyMongo object
        rowcount = ProjectRepository.delete(project_id, user_id)
        if rowcount == 0:
            raise HTTPException(status_code=404, detail="Project not found or unauthorized")

        return {"status": "success"}