import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.base_class import Base
from app.db.session import engine
from app.routers import (
    auth, me, tutors, requests, responses, assignments,
    threads, notifications, messages, offers, users,
)
from app.routers.telegram import router as telegram_router

app = FastAPI(title="Repetitor18 App API")
logger = logging.getLogger("repetitor_app_api")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(app\.repetitor18\.ru|api\.app\.repetitor18\.ru)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

app.include_router(auth.router)
app.include_router(me.router)
app.include_router(tutors.router)
app.include_router(requests.router)
app.include_router(responses.router)
app.include_router(assignments.router)
app.include_router(threads.router)
app.include_router(notifications.router)
app.include_router(messages.router)
app.include_router(offers.router)
app.include_router(users.router)
app.include_router(telegram_router)
