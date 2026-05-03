import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo


def _normalize_origin(value: str) -> str:
    return str(value or "").strip().rstrip("/")


def _csv_env(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = os.environ.get(name)
    values = default if raw is None else tuple(part for part in raw.split(","))
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = _normalize_origin(value)
        if normalized and normalized not in seen:
            seen.add(normalized)
            out.append(normalized)
    return tuple(out)


@dataclass(frozen=True)
class Settings:
    base_dir: Path = Path(__file__).resolve().parents[1]
    data_dir: Path = Path(__file__).resolve().parents[1] / "data"
    db_name: str = "trading.db"
    auth_cookie: str = "session_token"
    auth_whitelist: tuple[str, ...] = ("/api/auth/login", "/api/auth/check", "/api/auth/setup")
    dev_mode: bool = os.environ.get("DEV_MODE", "0") == "1"
    cookie_secure: bool = os.environ.get("COOKIE_SECURE", "0" if os.environ.get("DEV_MODE", "0") == "1" else "1") == "1"
    cors_origins: tuple[str, ...] = _csv_env(
        "CORS_ORIGINS",
        (
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "http://localhost:5175",
            "http://127.0.0.1:5175",
            "http://localhost:5176",
            "http://127.0.0.1:5176",
        ),
    )
    timezone: ZoneInfo = ZoneInfo("Asia/Shanghai")
    app_title: str = "交易记录系统"
    app_version: str = "2.0.0-refactor"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
