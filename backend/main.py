"""API skeleton. Routers are added here as each backend module is rebuilt —
see CLAUDE.md and Day_1.md for the rebuild order. Only auth exists so far."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.auth.router import router as auth_router
from backend.core.config import settings

app = FastAPI()

_extra_origins = [o.strip() for o in settings.EXTRA_ALLOWED_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost",  # Docker nginx (port 80)
        "http://localhost:80",
        "https://dav1fcmwl68t0.cloudfront.net",  # deployed frontend
        *_extra_origins,
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
