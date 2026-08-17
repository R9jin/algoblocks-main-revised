# api/models.py
import json
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Dict, Any, Optional, List

# Hardening: Blockly workspace JSON and generated Python are user-controlled
# and were previously unbounded (Dict[str, Any] / str with no length limit).
# That's not SQL-injectable (all queries are parameterized -- see
# repositories/*.py) or server-executable (the backend only ever runs
# ast.parse() on pythonCode for static analysis, never eval/exec), but an
# unbounded payload is still a storage- and DB-row-bloat DoS vector: a
# malicious or buggy client could push megabytes of JSON per save. Cap both
# to a generous-but-bounded size so a single project/template can't blow up
# the `projects`/`templates` tables.
MAX_WORKSPACE_BYTES = 300_000   # ~300KB of Blockly JSON; a large real workspace is a few KB
MAX_PYTHON_CODE_CHARS = 50_000  # ~50k chars of generated/raw Python


def _validate_workspace_size(value):
    if value in (None, {}):
        return value
    try:
        size = len(json.dumps(value))
    except (TypeError, ValueError):
        raise ValueError("workspace must be JSON-serializable")
    if size > MAX_WORKSPACE_BYTES:
        raise ValueError(f"workspace exceeds maximum size of {MAX_WORKSPACE_BYTES} bytes")
    return value

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: Dict[str, Any]

class GoogleLoginRequest(BaseModel):
    token: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)

class VerifyEmailRequest(BaseModel):
    token: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr

class ProgressUpdate(BaseModel):
    email: Optional[str] = None
    lesson_id: str
    score: float
    completed: Optional[bool] = False

class AssessmentUpdateRequest(BaseModel):
    email: Optional[str] = None
    assessment_key: str
    score: float
    correct: int
    total: int
    timeElapsed: int
    completedAt: str
    attempts: int

class ProjectSyncRequest(BaseModel):
    userId: Optional[str] = None
    owner_id: Optional[str] = None
    projectId: Optional[str] = None
    title: Optional[str] = "Untitled Project"
    name: Optional[str] = "Untitled Project"
    description: Optional[str] = ""
    workspace: Optional[Dict[str, Any]] = {}
    pythonCode: Optional[str] = Field(default="", max_length=MAX_PYTHON_CODE_CHARS)
    timestamp: Optional[int] = None
    isSynced: Optional[bool] = False

    _check_workspace_size = field_validator("workspace")(_validate_workspace_size)

class TemplateSyncRequest(BaseModel):
    templateId: Optional[str] = None
    title: Optional[str] = "Untitled Template"
    name: Optional[str] = "Untitled Template"
    description: Optional[str] = ""
    category: Optional[str] = "Custom Templates"
    workspace: Optional[Dict[str, Any]] = {}
    pythonCode: Optional[str] = Field(default="", max_length=MAX_PYTHON_CODE_CHARS)
    userId: Optional[str] = None
    owner_id: Optional[str] = None
    timestamp: Optional[int] = None
    isSynced: Optional[bool] = False

    _check_workspace_size = field_validator("workspace")(_validate_workspace_size)

class ActivitySubmission(BaseModel):
    userId: str
    moduleId: str
    activityId: str
    type: str = "activity"
    status: str = "draft"
    score: float = 0
    maxScore: float = 100
    
    passedTestCases: int = 0
    totalTestCases: int = 0
    passed_tests: Optional[int] = 0
    total_tests: Optional[int] = 0
    
    functional_passed: Optional[int] = 0
    functional_total: Optional[int] = 0
    
    initial_aes: Optional[float] = None
    final_aes: Optional[float] = None
    rog: Optional[float] = 0.0

    testCases: Optional[List[Dict[str, Any]]] = []
    target_complexity: Optional[str] = "O(n)"
    actual_complexity: Optional[str] = "O(n^2)"
    target_space_complexity: Optional[str] = "O(1)"
    actual_space_complexity: Optional[str] = "O(1)"
    workspace: Optional[Dict[str, Any]] = {}
    pythonCode: str = ""
    timestamp: Optional[int] = None
    submittedAt: Optional[str] = None
    isSynced: Optional[bool] = False

class AssessmentSubmission(BaseModel):
    userId: str
    assessmentId: str
    score: float
    maxScore: float
    passed: bool
    answers: Dict[str, Any]
    timestamp: Optional[int] = None

class GuestProgressUpdate(BaseModel):
    session_id: str
    progress_data: Dict[str, Any]

class BatchSyncPayload(BaseModel):
    progress: Optional[List[Dict[str, Any]]] = []
    submissions: Optional[List[Dict[str, Any]]] = []
    assessments: Optional[List[Dict[str, Any]]] = []

class SyncResponse(BaseModel):
    status: str
    message: str
    synced_items: int