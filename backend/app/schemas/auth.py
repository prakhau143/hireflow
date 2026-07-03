from pydantic import BaseModel, EmailStr
from typing import Optional


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: str
    role: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    theme: str
    avatar: Optional[str]
    created_at: str

    model_config = {"from_attributes": True}
