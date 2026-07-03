from celery import Celery
from app.config import settings

celery_app = Celery(
    "hireflow",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.job_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_routes={
        "app.tasks.job_tasks.*": {"queue": "jobs"},
    },
)
