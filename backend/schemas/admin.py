from typing import Optional
from typing import Dict, List

from pydantic import BaseModel


class UserCreateBody(BaseModel):
    username: str
    password: str


class UserResetPasswordBody(BaseModel):
    password: str


class UserUpdateBody(BaseModel):
    role: Optional[str] = None
    password: Optional[str] = None
    module_permissions: Optional[List[str]] = None
    data_permissions: Optional[Dict[str, str]] = None
