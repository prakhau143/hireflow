import asyncio
from app.tasks.celery_app import celery_app
from app.services.ai_service import analyze_job_match


@celery_app.task(name="app.tasks.job_tasks.process_job_ai", bind=True, max_retries=3)
def process_job_ai(self, job_id: str, job_description: str, user_skills: list[str], resume_text: str = ""):
    """Analyze a job with Groq AI and update the database."""
    try:
        result = asyncio.run(analyze_job_match(job_description, resume_text, user_skills))
        # In production: update Job record in DB with result
        return {"job_id": job_id, "result": result}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.job_tasks.bulk_import_jobs")
def bulk_import_jobs(user_id: str, jobs_data: list[dict]):
    """Process a batch of imported jobs."""
    results = []
    for job_data in jobs_data:
        result = process_job_ai.delay(
            job_data["id"],
            job_data["description"],
            job_data.get("user_skills", []),
        )
        results.append(result.id)
    return {"queued": len(results), "task_ids": results}
