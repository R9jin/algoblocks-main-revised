# api/models.py
"""
Pydantic request/response models for the AlgoBlocks API.

All user-supplied payloads are validated here before they reach service or
repository code. Size caps on workspace JSON and generated Python prevent
DoS via oversized payloads; password-strength rules are enforced both here
(server-side, authoritative) and in the frontend (UX convenience only).
"""
import json
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Dict, Any, Optional, List

# Blockly workspace JSON and generated Python are user-controlled and were
# previously unbounded (Dict[str, Any] / str with no length limit). While
# all queries are parameterized (no SQL injection risk) and the backend only
# runs ast.parse() for static analysis (never eval/exec), an unbounded payload
# is a storage and DB-row-bloat DoS vector: a malicious or buggy client could
# push megabytes of JSON per save. These caps are generous enough for any
# real workspace while bounding worst-case row size in the projects/templates
# tables.
MAX_WORKSPACE_BYTES = 300_000   # ~300 KB of Blockly JSON; a large real workspace is a few KB
MAX_PYTHON_CODE_CHARS = 50_000  # ~50 k chars of generated/raw Python


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

def _validate_password_strength(value: str) -> str:
    """
    Enforces a minimum password complexity policy.

    Requires at least 8 characters, at least one letter, and at least one
    digit. This validation lives here (not only in the frontend) because a
    frontend-only check does nothing to stop a request sent directly to the
    API. Raises ``ValueError`` on failure so Pydantic surfaces it as a 422
    validation error.

    Args:
        value: The plain-text password to validate.

    Returns:
        The original value unchanged if it passes all rules.

    Raises:
        ValueError: If the password does not meet strength requirements.
    """
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    # bcrypt only accepts up to 72 BYTES (multi-byte characters count more than
    # one). Newer bcrypt releases raise on longer input, which surfaced as a 500
    # on signup / password reset instead of a clear validation message.
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password is too long (maximum 72 bytes).")
    if not any(ch.isalpha() for ch in value):
        raise ValueError("Password must include at least one letter.")
    if not any(ch.isdigit() for ch in value):
        raise ValueError("Password must include at least one number.")
    return value

# Classic email/password signup model (see AuthService.signup_with_email).
# The account is created unverified and a verification link is emailed to
# ``email``; the person must click it before they can sign in.
class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)

    @field_validator("password")
    @classmethod
    def check_password_strength(cls, value: str) -> str:
        return _validate_password_strength(value)

class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=256)  # bounded: bcrypt work scales with attacker-chosen input

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
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def check_password_strength(cls, value: str) -> str:
        return _validate_password_strength(value)

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
    # The frontend (AssessmentPage.jsx handleSubmit) builds and sends
    # ``answers`` (question position -> selected option index) and
    # ``questionIds`` (position -> question id) in this same POST body.
    # Both must be declared here; Pydantic silently drops any undeclared
    # field, which would cause individual question choices to never reach
    # the service layer — only the aggregate score/correct/total would
    # survive.
    answers: Optional[Dict[str, Any]] = None
    questionIds: Optional[List[Any]] = None

class ProjectSyncRequest(BaseModel):
    userId: Optional[str] = None
    owner_id: Optional[str] = None
    projectId: Optional[str] = None
    # Stable client-generated idempotency key (see database.py, uq_projects_user_client)
    clientId: Optional[str] = Field(default=None, max_length=255)
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
    # Stable client-generated idempotency key (see database.py, uq_templates_user_client)
    clientId: Optional[str] = Field(default=None, max_length=255)
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