from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.errors import register_error_handlers
from core.middleware import register_middleware
from routers import api_router
from services.runtime import init_runtime


def create_app() -> FastAPI:
    init_runtime()
    @asynccontextmanager
    async def lifespan(app):
        from services.discipline_ai import jobs
        stop, wake, thread = jobs.start()
        try:
            yield
        finally:
            stop.set(); wake.set()
            thread.join(timeout=2)
    app = FastAPI(title=settings.app_title, version=settings.app_version, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    )
    register_middleware(app)
    register_error_handlers(app)
    app.include_router(api_router)
    return app
