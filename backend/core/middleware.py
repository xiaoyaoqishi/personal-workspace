import uuid
import json

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from auth import verify_token
from core import context
from core.config import settings
from core.db import SessionLocal
from models import User

ALL_USER_MODULES = {"trading", "notes", "ledger"}


def _normalize_module_permissions(value):
    if not isinstance(value, list):
        return sorted(ALL_USER_MODULES)
    out = []
    seen = set()
    for item in value:
        key = str(item or "").strip().lower()
        if key in ALL_USER_MODULES and key not in seen:
            seen.add(key)
            out.append(key)
    return out or sorted(ALL_USER_MODULES)


def _normalize_data_permissions(value):
    out = {module: "read_write" for module in ALL_USER_MODULES}
    if not isinstance(value, dict):
        return out
    for module, mode in value.items():
        key = str(module or "").strip().lower()
        val = str(mode or "").strip().lower()
        if key in ALL_USER_MODULES and val in {"read_write", "read_only"}:
            out[key] = val
    return out


def _extract_permissions(user: User):
    try:
        module_raw = json.loads(user.module_permissions or "")
    except Exception:
        module_raw = []
    try:
        data_raw = json.loads(user.data_permissions or "")
    except Exception:
        data_raw = {}
    return _normalize_module_permissions(module_raw), _normalize_data_permissions(data_raw)


def _api_module_from_path(path: str):
    if path.startswith("/api/ledger"):
        return "ledger"
    if path.startswith("/api/notebooks") or path.startswith("/api/notes") or path.startswith("/api/todos"):
        return "notes"
    trading_prefixes = (
        "/api/trades",
        "/api/reviews",
        "/api/review-sessions",
        "/api/trade-plans",
        "/api/knowledge-items",
        "/api/trade-brokers",
        "/api/trade-review-taxonomy",
        "/api/recycle",
    )
    if path.startswith(trading_prefixes):
        return "trading"
    return None


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request.state.request_id = str(uuid.uuid4())

        username = "xiaoyao"
        role = "admin"
        is_admin = True
        module_permissions = sorted(ALL_USER_MODULES)
        data_permissions = {module: "read_write" for module in ALL_USER_MODULES}

        if not settings.dev_mode and request.url.path.startswith("/api/"):
            token = request.cookies.get(settings.auth_cookie)
            parsed_username = verify_token(token) if token else None
            public_paths = set(settings.auth_whitelist) | {"/api/health"}
            if request.url.path not in public_paths and not parsed_username:
                return JSONResponse(status_code=401, content={"detail": "未登录"})
            if parsed_username:
                db = SessionLocal()
                try:
                    user = db.query(User).filter(User.username == parsed_username, User.is_active == True).first()  # noqa: E712
                finally:
                    db.close()
                if not user and request.url.path not in public_paths:
                    return JSONResponse(status_code=401, content={"detail": "账号不可用"})
                if user:
                    username = user.username
                    role = (user.role or "user").strip().lower()
                    is_admin = role == "admin"
                    module_permissions, data_permissions = _extract_permissions(user)

            if not is_admin and request.url.path not in public_paths:
                module_key = _api_module_from_path(request.url.path)
                if module_key and module_key not in module_permissions:
                    return JSONResponse(status_code=403, content={"detail": "该模块对当前用户不可见"})
                if module_key and request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
                    if data_permissions.get(module_key, "read_write") == "read_only":
                        return JSONResponse(status_code=403, content={"detail": "该模块为只读权限，禁止写入"})

        request.state.username = username
        request.state.role = role
        request.state.is_admin = is_admin
        request.state.module_permissions = module_permissions
        request.state.data_permissions = data_permissions

        token_u = context.current_username.set(username)
        token_r = context.current_role.set(role)
        token_a = context.current_is_admin.set(is_admin)
        try:
            response = await call_next(request)
            response.headers["X-Request-Id"] = request.state.request_id
            return response
        finally:
            context.current_username.reset(token_u)
            context.current_role.reset(token_r)
            context.current_is_admin.reset(token_a)


def register_middleware(app: FastAPI) -> None:
    app.add_middleware(RequestContextMiddleware)
