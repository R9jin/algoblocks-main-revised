# api/models.py
from pydantic import BaseModel
from typing import Dict, Any, Optional

class LoginRequest(BaseModel):
    email: str
    password: str

class SignUpRequest(BaseModel):
    name: str
    email: str
    password: str

class ProgressRequest(BaseModel):
    email: str
    lesson_id: str
    score: int

class GoogleAuthRequest(BaseModel):
    token: str

class AssessmentRequest(BaseModel):
    email: str
    assessment_key: str
    data: dict

# ADDED: Missing model required by project_router.py
class SaveProjectRequest(BaseModel):
    projectId: Optional[str] = None
    userId: str
    name: str
    workspace: dict
    pythonCode: str