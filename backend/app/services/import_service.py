"""Background import worker.

Runs the full pipeline (noise → blocks → AI extraction → validation → dedupe →
matching → save) as an asyncio task, writing REAL progress to ImportSession after
every stage and every extracted block. Jobs land as review_status='pending_review'
— they become visible to users only after admin approval.
"""
import asyncio
from datetime import datetime, timezone
from difflib import SequenceMatcher

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.import_session import ImportSession
from app.models.user import User
from app.models.job import Job
from app.models.resume import Resume
from app.models.activity_log import ActivityLog


async def _update(session_id: str, **fields):
    async with AsyncSessionLocal() as db:
        s = (await db.execute(select(ImportSession).where(ImportSession.id == session_id))).scalar_one_or_none()
        if s is None:
            return None
        for k, v in fields.items():
            setattr(s, k, v)
        await db.commit()
        return {"cancel": s.cancel_requested}


async def _is_cancelled(session_id: str) -> bool:
    async with AsyncSessionLocal() as db:
        s = (await db.execute(
            select(ImportSession.cancel_requested).where(ImportSession.id == session_id)
        )).scalar_one_or_none()
        return bool(s)


def spawn_import(session_id: str):
    asyncio.create_task(run_import(session_id))


async def run_import(session_id: str):
    from app.services.ai_service import (
        _detect_source, _clean_noise, _segment_blocks, _extract_job_ai,
        _validate_enterprise, _normalize_job, _dedupe_key, _parse_experience,
    )

    try:
        async with AsyncSessionLocal() as db:
            s = (await db.execute(select(ImportSession).where(ImportSession.id == session_id))).scalar_one_or_none()
            if s is None:
                return
            raw_text, user_id = s.raw_text, s.user_id
            user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
            resume = (await db.execute(
                select(Resume).where(Resume.user_id == user_id).order_by(Resume.created_at.desc()).limit(1)
            )).scalars().first()

        # ── Stage: preprocessing ────────────────────────────────────────────
        await _update(session_id, status="preprocessing", started_at=datetime.now(timezone.utc))
        source = _detect_source(raw_text)
        total_lines = len(raw_text.splitlines())

        # ── Stage: noise removal ────────────────────────────────────────────
        await _update(session_id, status="noise_removal", source=source)
        cleaned = _clean_noise(raw_text)
        noise_removed = total_lines - sum(1 for l in cleaned.splitlines() if l.strip())

        # ── Stage: block detection ──────────────────────────────────────────
        await _update(session_id, status="block_detection",
                      stats={"source": source, "raw_lines": total_lines, "noise_removed": noise_removed})
        blocks = _segment_blocks(cleaned)
        stats = {
            "source": source, "raw_lines": total_lines, "noise_removed": noise_removed,
            "blocks_found": len(blocks), "validated": 0, "needs_review": 0,
            "rejected": 0, "duplicates": 0, "saved": 0,
        }
        await _update(session_id, status="ai_extraction", total_blocks=len(blocks), stats=dict(stats))

        # ── Stage: AI extraction + validation + matching (per block) ────────
        results: list[dict] = []
        seen_keys: list[tuple[str, str]] = []
        ai_failures = 0
        for i, block in enumerate(blocks):
            if await _is_cancelled(session_id):
                await _update(session_id, status="cancelled", finished_at=datetime.now(timezone.utc))
                return
            job = await _extract_job_ai(block, list(user.skills or []))
            if job is None:
                ai_failures += 1
                stats["rejected"] += 1
            else:
                is_valid, status_, reason = _validate_enterprise(job, block)
                if is_valid:
                    key = _dedupe_key(job)
                    dup_of = next((lbl for k, lbl in seen_keys
                                   if SequenceMatcher(None, key, k).ratio() >= 0.9), None)
                    if dup_of:
                        is_valid, status_ = False, "rejected"
                        reason = f"Duplicate of '{dup_of}' in this import"
                        stats["duplicates"] += 1
                    else:
                        seen_keys.append((key, f"{job.get('role')} @ {job.get('company')}"))
                try:
                    _normalize_job(job, user, resume)
                except Exception as e:
                    print(f"[Import] normalize error: {e}")
                job.update({"is_valid": is_valid, "review_status_pipeline": status_,
                            "validation_reason": reason, "_source": source})
                if is_valid:
                    stats["needs_review" if status_ == "needs_review" else "validated"] += 1
                elif "Duplicate" not in (reason or ""):
                    stats["rejected"] += 1
                results.append(job)
            await _update(session_id, processed_blocks=i + 1, stats=dict(stats))

        # All blocks failed AI extraction → this is an outage/quota problem, not bad data.
        # Mark the session failed (retryable) instead of "completed with 0 jobs".
        if blocks and ai_failures == len(blocks):
            await _update(
                session_id, status="failed", stats=dict(stats),
                error=("AI extraction failed for every block — the Groq API is rate-limited "
                       "(free tier: 100k tokens/day) or unreachable. Hit Retry once the quota "
                       "resets, or upgrade the Groq plan / swap the API key in backend/.env."),
                finished_at=datetime.now(timezone.utc),
            )
            return

        # ── Stage: dedupe against existing DB jobs (global pool, not just this admin's) ──
        await _update(session_id, status="deduplication", stats=dict(stats))
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                select(Job.title, Job.company, Job.location, Job.contact_email)
            )).all()
        existing = [
            " | ".join((x or "").lower().strip() for x in r) for r in rows
        ]

        # ── Stage: saving (pending review) ──────────────────────────────────
        await _update(session_id, status="saving", stats=dict(stats))
        async with AsyncSessionLocal() as db:
            for job in results:
                if not job.get("is_valid"):
                    continue
                title = (job.get("role") or "Unknown Role").strip()
                company = (job.get("company") or "Unknown Company").strip()
                fp = " | ".join(x.lower().strip() for x in (
                    title, company, job.get("location") or "", job.get("email") or ""))
                dup_db = next((e for e in existing if SequenceMatcher(None, fp, e).ratio() >= 0.9), None)
                if dup_db:
                    stats["duplicates"] += 1
                    continue
                existing.append(fp)
                exp_min, exp_max = job.get("experience_min", 0), job.get("experience_max", 5)
                warnings = [w for w in [job.get("validation_reason")] if w]
                db.add(Job(
                    user_id=user_id, title=title, company=company,
                    location=job.get("location") or "",
                    location_type=(job.get("work_mode") or "onsite").lower(),
                    experience_min=exp_min, experience_max=exp_max,
                    skills=job.get("skills") or [], description=job.get("description") or "",
                    contact_email=job.get("email"), contact_phone=job.get("phone"),
                    salary=job.get("salary"), employment_type=job.get("employment_type"),
                    application_type=job.get("application_type"),
                    hiring_manager=job.get("recruiter"),
                    ai_summary=job.get("description"),
                    confidence_score=int(job.get("confidence_score") or 0),
                    smart_tags=job.get("smart_tags") or [],
                    apply_link=job.get("apply_link"), source=source,
                    review_status="pending_review",
                    import_session_id=session_id,
                    duplicate_reason=None,
                    validation_warnings=warnings,
                ))
                stats["saved"] += 1
            db.add(ActivityLog(
                user_id=user_id, action="Background Import Completed",
                description=(f"{stats['saved']} jobs pending review — {stats['validated']} valid, "
                             f"{stats['needs_review']} flagged, {stats['rejected']} rejected, "
                             f"{stats['duplicates']} duplicates"),
            ))
            await db.commit()

        await _update(session_id, status="completed", stats=dict(stats),
                      finished_at=datetime.now(timezone.utc))
        print(f"[Import {session_id[:8]}] done: {stats}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        await _update(session_id, status="failed", error=str(e)[:800],
                      finished_at=datetime.now(timezone.utc))
