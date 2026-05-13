# api/models.py
from pydantic import BaseModel
from typing import Optional

class ProjectModel(BaseModel):
    title: str
    description: Optional[str] = "" 
    data: dict
    owner_id: str

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None 
    data: Optional[dict] = None

class TemplateModel(BaseModel):
    title: str
    description: Optional[str] = ""
    data: dict
    owner_id: str

class TemplateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    data: Optional[dict] = None

# --- ADDED FROM OLD INDEX.PY ---
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