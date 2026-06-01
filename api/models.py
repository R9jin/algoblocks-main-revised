# api/models.py
from pydantic import BaseModel, EmailStr, Field
from typing import Dict, Any, Optional

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class SignUpRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)

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
    key: Optional[str] = ""
    score: Optional[Any] = 0
    passed: Optional[bool] = False
    data: Optional[Dict[str, Any]] = {}

class SaveProjectRequest(BaseModel):
    projectId: Optional[str] = None
    userId: Optional[str] = ""
    name: Optional[str] = ""
    workspace: Optional[Dict[str, Any]] = {}
    pythonCode: Optional[str] = ""

# --- ADD THIS MISSING CLASS BELOW ---
class SaveTemplateRequest(BaseModel):
    category: Optional[str] = ""
    name: Optional[str] = ""
    workspace: Optional[Dict[str, Any]] = {}
    pythonCode: Optional[str] = ""
    data: Optional[Dict[str, Any]] = {}