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

# FIX: Made highly permissive to prevent 422 errors from React state delays
class ProgressRequest(BaseModel):
    email: Optional[str] = ""
    lesson_id: Optional[str] = ""
    score: Optional[Any] = 0
    completed: Optional[Any] = False

class GoogleAuthRequest(BaseModel):
    token: str

class AssessmentRequest(BaseModel):
    email: Optional[str] = ""
    assessment_key: Optional[str] = ""
    data: Optional[Dict[str, Any]] = {}

class SaveProjectRequest(BaseModel):
    projectId: Optional[str] = None
    userId: Optional[str] = ""
    name: Optional[str] = ""
    workspace: Optional[Dict[str, Any]] = {}
    pythonCode: Optional[str] = ""