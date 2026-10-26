"""FastAPI application entry point. Run with: uvicorn app.main:app --reload --port 8000"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config
from .api import router
from .database import SessionLocal, init_db
from .seed import seed_demo


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        if config.SEED_DEMO:
            seed_demo(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="MediMate IoT API",
    version="0.2.0",
    description="Simulation-first API for the MediMate IoT expo prototype. Not a medical device.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        location = [str(part) for part in err.get("loc", []) if part not in ("body", "query", "path")]
        errors.append({
            "field": ".".join(location) or "request",
            "message": str(err.get("msg", "Invalid value")).replace("Value error, ", ""),
        })
    return JSONResponse(status_code=422, content={"detail": errors})


app.include_router(router)


@app.get("/")
def root():
    return {"app": "MediMate IoT API", "docs": "/docs", "health": "/api/health"}
