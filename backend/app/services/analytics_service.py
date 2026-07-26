"""Dashboard analytics — aggregates real database rows into stats, chart datasets and insights.

No mock values: every number is computed from Job / User / Resume / SmtpConfig /
SmtpLog / ActivityLog rows. Empty tables produce empty arrays so the frontend can
render "No Data Available" states.
"""
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from types import SimpleNamespace
import json
import re
import time

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.job import Job
from app.models.user_job_match import UserJobMatch
from app.models.resume import Resume
from app.models.smtp import SmtpConfig
from app.models.smtp_log import SmtpLog
from app.models.activity_log import ActivityLog
from app.models.application import Application
from app.models.import_session import ImportSession


# ---------------------------------------------------------------- helpers

def _naive(dt: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; normalize aware ones so comparisons never crash."""
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _utcnow() -> datetime:
    return datetime.utcnow()


def _month_keys(count: int = 6) -> list[tuple[str, str]]:
    """Last `count` months as [(sort_key 'YYYY-MM', label 'Feb'), ...] oldest first."""
    now = _utcnow()
    keys = []
    year, month = now.year, now.month
    for _ in range(count):
        keys.append((f"{year:04d}-{month:02d}", datetime(year, month, 1).strftime("%b")))
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return list(reversed(keys))


def _bucket_match(score: float) -> str:
    if score >= 90: return "90-100%"
    if score >= 80: return "80-89%"
    if score >= 70: return "70-79%"
    if score >= 55: return "55-69%"
    if score >= 40: return "40-54%"
    return "Below 40%"


MATCH_BUCKET_ORDER = ["90-100%", "80-89%", "70-79%", "55-69%", "40-54%", "Below 40%"]


def _bucket_experience(years: int) -> str:
    if years <= 0: return "Fresher"
    if years <= 3: return "1-3 yrs"
    if years <= 5: return "3-5 yrs"
    if years <= 8: return "5-8 yrs"
    return "8+ yrs"


EXP_BUCKET_ORDER = ["Fresher", "1-3 yrs", "3-5 yrs", "5-8 yrs", "8+ yrs"]
SCORE_BUCKET_ORDER = ["0-20", "21-40", "41-60", "61-80", "81-100"]


def _bucket_score(score: int) -> str:
    if score <= 20: return "0-20"
    if score <= 40: return "21-40"
    if score <= 60: return "41-60"
    if score <= 80: return "61-80"
    return "81-100"


async def _user_jobs(db: AsyncSession, user_id: str) -> list[SimpleNamespace]:
    """This user's personalized view: every job they have a UserJobMatch row for
    (every job approved since they existed), with Job's global facts and the
    user's personalized match fields merged onto one object — every call site
    below reads `j.match_score` / `j.status` / `j.missing_skills` etc. exactly as
    it did when those lived directly on Job, so none of them needed to change."""
    rows = (await db.execute(
        select(Job, UserJobMatch).join(UserJobMatch, UserJobMatch.job_id == Job.id)
        .where(UserJobMatch.user_id == user_id)
    )).all()
    return [
        SimpleNamespace(
            id=j.id, title=j.title, company=j.company, location=j.location,
            location_type=j.location_type, experience_min=j.experience_min,
            experience_max=j.experience_max, skills=j.skills, description=j.description,
            ai_summary=j.ai_summary, smart_tags=j.smart_tags, salary=j.salary,
            employment_type=j.employment_type, application_type=j.application_type,
            review_status=j.review_status, source=j.source, created_at=j.created_at,
            confidence_score=j.confidence_score,
            match_score=m.match_score, matched_skills=m.matched_skills,
            missing_skills=m.missing_skills, match_tier=m.match_tier,
            experience_badge=m.experience_badge, is_recommended=m.is_recommended,
            ai_analysis=m.ai_analysis, status=m.status, archive_reason=m.archive_reason,
            emails_generated=m.emails_generated,
        )
        for j, m in rows
    ]


# ---------------------------------------------------------------- stats

async def dashboard_stats(db: AsyncSession, user: User) -> dict:
    jobs = await _user_jobs(db, user.id)
    now = _utcnow()
    week_ago = now - timedelta(days=7)

    total = len(jobs)
    active = sum(1 for j in jobs if j.status in ("new", "shortlisted"))
    archived = sum(1 for j in jobs if j.status == "archived")
    applied = sum(1 for j in jobs if j.status == "applied")
    shortlisted = sum(1 for j in jobs if j.status == "shortlisted")
    scores = [j.match_score for j in jobs if (j.match_score or 0) > 0]
    avg_match = round(sum(scores) / len(scores), 1) if scores else 0.0
    jobs_this_week = sum(1 for j in jobs if (_naive(j.created_at) or now) >= week_ago)

    resumes = (await db.execute(select(Resume).where(Resume.user_id == user.id))).scalars().all()
    ats_scores = [r.ats_score for r in resumes if (r.ats_score or 0) > 0]
    ats_average = round(sum(ats_scores) / len(ats_scores), 1) if ats_scores else 0.0

    smtp_rows = (await db.execute(select(SmtpConfig).where(SmtpConfig.user_id == user.id))).scalars().all()
    emails_sent = sum(s.emails_sent or 0 for s in smtp_rows)
    emails_failed = sum(s.emails_failed or 0 for s in smtp_rows)
    smtp_total = emails_sent + emails_failed
    smtp_success_rate = round(emails_sent / smtp_total * 100, 1) if smtp_total else None

    ai_jobs = sum(1 for j in jobs if j.ai_summary or j.ai_analysis)
    ai_logs = (await db.execute(
        select(func.count(ActivityLog.id)).where(
            ActivityLog.user_id == user.id, ActivityLog.action.ilike("%AI%")
        )
    )).scalar() or 0

    stats = {
        "total_jobs": total,
        "active_jobs": active,
        "archived_jobs": archived,
        "applications_sent": applied + emails_sent,
        "shortlisted": shortlisted,
        "avg_match": avg_match,
        "resume_analyses": len(resumes),
        "ats_average": ats_average,
        "smtp_success_rate": smtp_success_rate,
        "emails_sent": emails_sent,
        "ai_usage": ai_jobs + ai_logs,
        "jobs_this_week": jobs_this_week,
        "total_users": None,
        "active_users": None,
    }

    if user.role == "admin":
        stats["total_users"] = (await db.execute(select(func.count(User.id)))).scalar() or 0
        logs = (await db.execute(select(ActivityLog.user_id, ActivityLog.created_at))).all()
        stats["active_users"] = len({uid for uid, ts in logs if (_naive(ts) or now) >= week_ago})

    return stats


# ---------------------------------------------------------------- charts

async def dashboard_charts(db: AsyncSession, user: User, days: int = 180) -> dict:
    jobs = await _user_jobs(db, user.id)
    now = _utcnow()
    cutoff = now - timedelta(days=days)
    jobs_in_range = [j for j in jobs if (_naive(j.created_at) or now) >= cutoff]

    # 1. Match distribution
    match_counter = Counter(_bucket_match(j.match_score or 0) for j in jobs_in_range)
    match_distribution = [
        {"name": label, "value": match_counter[label]}
        for label in MATCH_BUCKET_ORDER if match_counter[label] > 0
    ]

    # 2. Experience distribution (required by jobs)
    exp_counter = Counter(_bucket_experience(j.experience_min or 0) for j in jobs_in_range)
    experience_distribution = [
        {"name": label, "value": exp_counter[label]}
        for label in EXP_BUCKET_ORDER if exp_counter[label] > 0
    ]

    # 3. Top skills demanded
    skill_counter: Counter[str] = Counter()
    for j in jobs_in_range:
        for s in (j.skills or []):
            if s and s.strip():
                skill_counter[s.strip()] += 1
    top_skills = [{"skill": k, "count": v} for k, v in skill_counter.most_common(10)]

    # 4. Job locations
    loc_counter: Counter[str] = Counter()
    for j in jobs_in_range:
        loc = (j.location or "").strip()
        if j.location_type == "remote" and not loc:
            loc = "Remote"
        if loc:
            loc_counter[loc.title() if loc.islower() else loc] += 1
    job_locations = [{"location": k, "count": v} for k, v in loc_counter.most_common(8)]

    # 5. Application funnel
    total = len(jobs_in_range)
    qualified = sum(1 for j in jobs_in_range if (j.match_score or 0) >= 40)
    shortlisted = sum(1 for j in jobs_in_range if j.status == "shortlisted")
    applied = sum(1 for j in jobs_in_range if j.status == "applied")
    application_funnel = [] if total == 0 else [
        {"stage": "Imported", "count": total},
        {"stage": "Qualified (40%+)", "count": qualified},
        {"stage": "Shortlisted", "count": shortlisted},
        {"stage": "Applied", "count": applied},
    ]

    # 6. Weekly activity (last 7 days: jobs added + actions logged)
    activity_rows = (await db.execute(
        select(ActivityLog.created_at).where(ActivityLog.user_id == user.id)
    )).scalars().all()
    weekly_activity = []
    any_weekly = False
    for offset in range(6, -1, -1):
        day = (now - timedelta(days=offset)).date()
        jobs_count = sum(1 for j in jobs if (_naive(j.created_at) or now).date() == day)
        actions_count = sum(1 for ts in activity_rows if (_naive(ts) or now).date() == day)
        if jobs_count or actions_count:
            any_weekly = True
        weekly_activity.append({
            "day": day.strftime("%a"),
            "date": day.isoformat(),
            "jobs": jobs_count,
            "actions": actions_count,
        })
    if not any_weekly:
        weekly_activity = []

    # 7. Resume score distribution
    resumes = (await db.execute(select(Resume).where(Resume.user_id == user.id))).scalars().all()
    score_counter = Counter(_bucket_score(r.ats_score or 0) for r in resumes if (r.ats_score or 0) > 0)
    resume_scores = [
        {"range": label, "count": score_counter[label]}
        for label in SCORE_BUCKET_ORDER
    ] if score_counter else []

    # 8. Monthly growth (jobs added per month, cumulative)
    months = _month_keys(6)
    by_month: dict[str, int] = defaultdict(int)
    for j in jobs:
        dt = _naive(j.created_at)
        if dt:
            by_month[f"{dt.year:04d}-{dt.month:02d}"] += 1
    monthly_growth = []
    running = sum(v for k, v in by_month.items() if k < months[0][0])
    for key, label in months:
        added = by_month.get(key, 0)
        running += added
        monthly_growth.append({"month": label, "jobs": added, "cumulative": running})
    if running == 0:
        monthly_growth = []

    # 9. Technology trends (top-5 skills counted per month)
    trend_skills = [s["skill"] for s in top_skills[:5]]
    technology_trends: dict = {"skills": trend_skills, "data": []}
    if trend_skills:
        per_month: dict[str, Counter] = defaultdict(Counter)
        for j in jobs:
            dt = _naive(j.created_at)
            if not dt:
                continue
            key = f"{dt.year:04d}-{dt.month:02d}"
            for s in (j.skills or []):
                if s in trend_skills:
                    per_month[key][s] += 1
        for key, label in months:
            row: dict = {"month": label}
            for s in trend_skills:
                row[s] = per_month[key][s]
            technology_trends["data"].append(row)

    # 10. SMTP performance
    smtp_logs = (await db.execute(
        select(SmtpLog.status).where(SmtpLog.user_id == user.id)
    )).scalars().all()
    ok = sum(1 for s in smtp_logs if s == "success")
    bad = sum(1 for s in smtp_logs if s == "failed")
    smtp_performance = {"success": ok, "failed": bad, "rate": round(ok / (ok + bad) * 100, 1)} if (ok + bad) else None

    return {
        "range_days": days,
        "match_distribution": match_distribution,
        "experience_distribution": experience_distribution,
        "top_skills": top_skills,
        "job_locations": job_locations,
        "application_funnel": application_funnel,
        "weekly_activity": weekly_activity,
        "resume_scores": resume_scores,
        "monthly_growth": monthly_growth,
        "technology_trends": technology_trends,
        "smtp_performance": smtp_performance,
    }


# ---------------------------------------------------------------- activity (paginated)

async def dashboard_activity(db: AsyncSession, user: User, limit: int = 20, offset: int = 0) -> dict:
    total = (await db.execute(
        select(func.count(ActivityLog.id)).where(ActivityLog.user_id == user.id)
    )).scalar() or 0
    rows = (await db.execute(
        select(ActivityLog)
        .where(ActivityLog.user_id == user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit).offset(offset)
    )).scalars().all()
    return {
        "items": [
            {"id": r.id, "action": r.action, "description": r.description, "created_at": r.created_at}
            for r in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ---------------------------------------------------------------- insights

_INSIGHTS_CACHE: dict[str, tuple[float, dict]] = {}
_INSIGHTS_TTL = 900  # 15 min


def _rule_insights(jobs: list[Job], user: User) -> list[dict]:
    """Deterministic insights computed from real data — used standalone and as AI fallback."""
    if not jobs:
        return [{
            "type": "action",
            "title": "Import your first jobs to unlock insights",
            "detail": "Paste LinkedIn or WhatsApp job posts in Import Jobs. HireFlow will score every job against your profile and surface trends here.",
        }]

    insights: list[dict] = []
    total = len(jobs)
    now = _utcnow()

    # Biggest skill gap
    missing = Counter()
    for j in jobs:
        for s in (j.missing_skills or []):
            missing[s] += 1
    if missing:
        skill, n = missing.most_common(1)[0]
        insights.append({
            "type": "action",
            "title": f"Learning {skill} would unlock the most jobs",
            "detail": f"{skill} is required in {n} of your {total} tracked jobs but missing from your profile — it's your single highest-leverage skill gap.",
        })

    # Strong matches waiting
    strong = [j for j in jobs if (j.match_score or 0) >= 80 and j.status in ("new", "shortlisted")]
    if strong:
        insights.append({
            "type": "win",
            "title": f"{len(strong)} strong match{'es' if len(strong) != 1 else ''} (80%+) ready to apply",
            "detail": f"Top pick: {strong[0].title} at {strong[0].company} ({round(strong[0].match_score)}% match). High-match applications get the best response rates — prioritize these.",
        })

    # Remote share
    remote = sum(1 for j in jobs if j.location_type == "remote")
    if total >= 5:
        pct = round(remote / total * 100)
        insights.append({
            "type": "trend",
            "title": f"{pct}% of your job pool is remote",
            "detail": f"{remote} of {total} tracked roles are remote-friendly. " + (
                "Remote demand in your stack is strong — widen your search radius at no commute cost."
                if pct >= 40 else "Most of your pool is onsite/hybrid — consider adding remote-specific searches."
            ),
        })

    # Shortlisted but not applied
    stalled = [j for j in jobs if j.status == "shortlisted"]
    if stalled:
        insights.append({
            "type": "warning",
            "title": f"{len(stalled)} shortlisted job{'s' if len(stalled) != 1 else ''} with no application yet",
            "detail": "Shortlisted roles go stale fast. Generate an AI cover letter and apply — job posts typically close within 2-3 weeks.",
        })

    # Match trend last 14 days vs before
    recent = [j.match_score or 0 for j in jobs if (_naive(j.created_at) or now) >= now - timedelta(days=14)]
    older = [j.match_score or 0 for j in jobs if (_naive(j.created_at) or now) < now - timedelta(days=14)]
    if len(recent) >= 3 and len(older) >= 3:
        r_avg, o_avg = sum(recent) / len(recent), sum(older) / len(older)
        delta = round(r_avg - o_avg, 1)
        if abs(delta) >= 3:
            insights.append({
                "type": "trend" if delta > 0 else "warning",
                "title": f"Average match {'up' if delta > 0 else 'down'} {abs(delta)} pts in the last 2 weeks",
                "detail": (
                    "Your recent imports align better with your profile — keep sourcing from the same channels."
                    if delta > 0 else
                    "Recent imports match your profile less well. Revisit your search keywords or update your skills list."
                ),
            })

    # Most demanded skill the user already has
    have = {s.lower() for s in (user.skills or [])}
    demanded = Counter()
    for j in jobs:
        for s in (j.skills or []):
            if s.lower() in have:
                demanded[s] += 1
    if demanded:
        skill, n = demanded.most_common(1)[0]
        insights.append({
            "type": "trend",
            "title": f"Your {skill} skill appears in {n} tracked jobs",
            "detail": f"{skill} is your most marketable skill in this pool — lead with it in resumes and cover letters.",
        })

    return insights[:6]


async def _ai_insights(jobs: list[Job], user: User) -> list[dict] | None:
    """Ask Groq to narrate the aggregates. Returns None on any failure (caller falls back)."""
    from app.services.ai_service import _get_client
    from app.config import settings

    total = len(jobs)
    missing = Counter()
    demanded = Counter()
    for j in jobs:
        for s in (j.missing_skills or []):
            missing[s] += 1
        for s in (j.skills or []):
            demanded[s] += 1
    aggregates = {
        "total_jobs": total,
        "avg_match": round(sum((j.match_score or 0) for j in jobs) / total, 1),
        "strong_matches_80plus": sum(1 for j in jobs if (j.match_score or 0) >= 80),
        "remote_pct": round(sum(1 for j in jobs if j.location_type == "remote") / total * 100),
        "statuses": dict(Counter(j.status for j in jobs)),
        "top_demanded_skills": dict(demanded.most_common(8)),
        "top_missing_skills": dict(missing.most_common(5)),
        "candidate_skills": (user.skills or [])[:15],
        "candidate_experience_years": user.years_experience or 0,
    }

    prompt = f"""You are a career analytics engine. Based ONLY on this real data about a job seeker's tracked jobs, write 4-5 short insights.

DATA: {json.dumps(aggregates)}

Rules:
- Reference the actual numbers in the data. Never invent numbers.
- Each insight: type is one of "trend", "action", "warning", "win".
- title: max 10 words. detail: 1-2 sentences, specific and actionable.

Respond ONLY with a valid JSON array, no markdown:
[{{"type": "...", "title": "...", "detail": "..."}}]"""

    client = _get_client()
    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=700,
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
    data = json.loads(raw)
    if not isinstance(data, list) or not data:
        return None
    valid_types = {"trend", "action", "warning", "win"}
    out = []
    for item in data[:6]:
        if isinstance(item, dict) and item.get("title") and item.get("detail"):
            out.append({
                "type": item.get("type") if item.get("type") in valid_types else "trend",
                "title": str(item["title"]),
                "detail": str(item["detail"]),
            })
    return out or None


async def dashboard_insights(db: AsyncSession, user: User, refresh: bool = False) -> dict:
    cached = _INSIGHTS_CACHE.get(user.id)
    if cached and not refresh and time.time() - cached[0] < _INSIGHTS_TTL:
        return cached[1]

    jobs = await _user_jobs(db, user.id)
    payload = {
        "insights": _rule_insights(jobs, user),
        "generated_by": "rules",
        "generated_at": _utcnow().isoformat() + "Z",
    }

    if len(jobs) >= 3:  # only spend an AI call when there's real data to narrate
        try:
            ai = await _ai_insights(jobs, user)
            if ai:
                payload = {"insights": ai, "generated_by": "ai", "generated_at": _utcnow().isoformat() + "Z"}
        except Exception as e:
            print(f"[Insights] AI generation failed, using rule-based: {e}")

    _INSIGHTS_CACHE[user.id] = (time.time(), payload)
    return payload


# ---------------------------------------------------------------- admin platform analytics

async def admin_analytics(db: AsyncSession) -> dict:
    now = _utcnow()
    users = (await db.execute(select(User))).scalars().all()
    jobs = (await db.execute(select(Job))).scalars().all()
    resumes = (await db.execute(select(Resume))).scalars().all()
    activity = (await db.execute(select(ActivityLog.user_id, ActivityLog.created_at))).all()
    smtp_logs = (await db.execute(select(SmtpLog.status))).scalars().all()
    # status/ai_analysis are per-viewer now (UserJobMatch), not per-job — pull them
    # separately for the platform-wide funnel and AI-usage count below.
    match_statuses = (await db.execute(select(UserJobMatch.status))).scalars().all()
    match_ai_usage = (await db.execute(
        select(func.count(UserJobMatch.id)).where(UserJobMatch.ai_analysis.isnot(None))
    )).scalar() or 0

    # User growth by month (+cumulative)
    months = _month_keys(6)
    by_month: dict[str, int] = defaultdict(int)
    for u in users:
        dt = _naive(u.created_at)
        if dt:
            by_month[f"{dt.year:04d}-{dt.month:02d}"] += 1
    user_growth = []
    running = sum(v for k, v in by_month.items() if k < months[0][0])
    for key, label in months:
        added = by_month.get(key, 0)
        running += added
        user_growth.append({"month": label, "signups": added, "total": running})

    # Experience distribution of users
    exp_counter = Counter(_bucket_experience(u.years_experience or 0) for u in users if u.years_experience is not None)
    experience_distribution = [
        {"name": label, "value": exp_counter[label]}
        for label in EXP_BUCKET_ORDER if exp_counter[label] > 0
    ]

    # Top user skills
    skill_counter: Counter[str] = Counter()
    for u in users:
        for s in (u.skills or []):
            if s and s.strip():
                skill_counter[s.strip()] += 1
    top_skills = [{"skill": k, "count": v} for k, v in skill_counter.most_common(10)]

    # Preferred roles
    role_counter: Counter[str] = Counter()
    for u in users:
        for r in (u.preferred_roles or []):
            if r and r.strip():
                role_counter[r.strip()] += 1
    preferred_roles = [{"name": k, "value": v} for k, v in role_counter.most_common(8)]

    # Locations
    loc_counter = Counter((u.current_location or "").strip() for u in users if (u.current_location or "").strip())
    locations = [{"location": k, "count": v} for k, v in loc_counter.most_common(8)]

    # Activity-based engagement
    today = now.date()
    week_ago = now - timedelta(days=7)
    active_today = len({uid for uid, ts in activity if (_naive(ts) or now).date() == today})
    active_week = len({uid for uid, ts in activity if (_naive(ts) or now) >= week_ago})
    signups_today = sum(1 for u in users if (_naive(u.created_at) or now).date() == today)

    # Resume scores platform-wide
    score_counter = Counter(_bucket_score(r.ats_score or 0) for r in resumes if (r.ats_score or 0) > 0)
    resume_scores = [
        {"range": label, "count": score_counter[label]}
        for label in SCORE_BUCKET_ORDER
    ] if score_counter else []
    ats_values = [r.ats_score for r in resumes if (r.ats_score or 0) > 0]

    # SMTP platform health
    ok = sum(1 for s in smtp_logs if s == "success")
    bad = sum(1 for s in smtp_logs if s == "failed")
    smtp_performance = {"success": ok, "failed": bad, "rate": round(ok / (ok + bad) * 100, 1)} if (ok + bad) else None

    # Application funnel platform-wide — counts (user, job) match rows, not jobs,
    # since applied/shortlisted/archived is now a per-viewer relationship.
    statuses = Counter(match_statuses)
    applications = [] if not match_statuses else [
        {"stage": "Matched", "count": len(match_statuses)},
        {"stage": "Shortlisted", "count": statuses.get("shortlisted", 0)},
        {"stage": "Applied", "count": statuses.get("applied", 0)},
        {"stage": "Archived", "count": statuses.get("archived", 0)},
    ]

    ai_usage = sum(1 for j in jobs if j.ai_summary) + match_ai_usage

    # ── Prompt 3 additions: import trends, review funnel, job-side tops ──────
    from app.services.taxonomy import canonical_location, role_family

    def _jobs_on(day) -> int:
        return sum(1 for j in jobs if (_naive(j.created_at) or now).date() == day)

    imports_daily = [
        {"date": d.isoformat(), "day": d.strftime("%d %b"), "jobs": _jobs_on(d)}
        for d in ((now - timedelta(days=off)).date() for off in range(13, -1, -1))
    ]
    if not any(r["jobs"] for r in imports_daily):
        imports_daily = []

    week_start = (now - timedelta(days=now.weekday())).date()
    imports_weekly = []
    for off in range(7, -1, -1):
        start = week_start - timedelta(weeks=off)
        end = start + timedelta(days=7)
        count = sum(1 for j in jobs if start <= (_naive(j.created_at) or now).date() < end)
        imports_weekly.append({"week": f"W{start.isocalendar()[1]}", "jobs": count})
    if not any(r["jobs"] for r in imports_weekly):
        imports_weekly = []

    jm: dict[str, int] = defaultdict(int)
    for j in jobs:
        dt = _naive(j.created_at)
        if dt:
            jm[f"{dt.year:04d}-{dt.month:02d}"] += 1
    imports_monthly = [{"month": label, "jobs": jm.get(key, 0)} for key, label in _month_keys(6)]
    if not any(r["jobs"] for r in imports_monthly):
        imports_monthly = []

    rs = Counter(j.review_status for j in jobs if j.review_status)
    review_funnel = [] if not rs else [
        {"stage": "Imported", "count": sum(rs.values())},
        {"stage": "Pending", "count": rs.get("pending_review", 0)},
        {"stage": "Approved", "count": rs.get("approved", 0)},
        {"stage": "Rejected", "count": rs.get("rejected", 0)},
        {"stage": "Merged", "count": rs.get("merged", 0)},
    ]

    at_counter = Counter((j.application_type or "").strip() for j in jobs if j.application_type)
    application_types = [
        {"name": k.replace("_", " ").title(), "value": v} for k, v in at_counter.most_common()
    ]

    comp_counter = Counter(
        j.company.strip() for j in jobs
        if j.company and j.company.strip() and j.company != "Unknown Company"
    )
    top_companies = [{"company": k, "count": v} for k, v in comp_counter.most_common(8)]

    city_counter: Counter[str] = Counter()
    for j in jobs:
        loc = canonical_location(j.location)
        if loc:
            for city in loc.split("/"):
                city_counter[city.strip()] += 1
        elif j.location_type == "remote":
            city_counter["Remote"] += 1
    top_cities = [{"city": k, "count": v} for k, v in city_counter.most_common(8)]

    role_counter2 = Counter(role_family(j.title) or j.title for j in jobs if j.title)
    top_roles = [{"role": k, "count": v} for k, v in role_counter2.most_common(8)]

    # Applications / email delivery
    app_rows = (await db.execute(select(Application.status))).scalars().all()
    a = Counter(app_rows)
    apps_sent, apps_failed = a.get("sent", 0), a.get("failed", 0)
    email_stats = {
        "sent": apps_sent, "failed": apps_failed,
        "queued": a.get("queued", 0) + a.get("sending", 0),
        "success_rate": round(apps_sent / (apps_sent + apps_failed) * 100, 1) if (apps_sent + apps_failed) else None,
    }

    smtp_rows = (await db.execute(select(SmtpLog.status, SmtpLog.created_at))).all()
    smtp_daily = []
    for off in range(13, -1, -1):
        day = (now - timedelta(days=off)).date()
        ok_ = sum(1 for st, ts in smtp_rows if st == "success" and (_naive(ts) or now).date() == day)
        bad_ = sum(1 for st, ts in smtp_rows if st == "failed" and (_naive(ts) or now).date() == day)
        smtp_daily.append({"day": day.strftime("%d %b"), "success": ok_, "failed": bad_})
    if not any(r["success"] or r["failed"] for r in smtp_daily):
        smtp_daily = []

    # Activity heatmap: weekday × 3-hour buckets
    heat = [[0] * 8 for _ in range(7)]
    for _, ts in activity:
        t = _naive(ts)
        if t:
            heat[t.weekday()][t.hour // 3] += 1
    heat_max = max((c for row in heat for c in row), default=0)
    activity_heatmap = {
        "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "buckets": ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm"],
        "data": heat, "max": heat_max,
    } if heat_max else None

    imports_sessions = (await db.execute(
        select(func.count(ImportSession.id)))).scalar() or 0

    return {
        "imports_daily": imports_daily,
        "imports_weekly": imports_weekly,
        "imports_monthly": imports_monthly,
        "review_funnel": review_funnel,
        "application_types": application_types,
        "top_companies": top_companies,
        "top_cities": top_cities,
        "top_roles": top_roles,
        "email_stats": email_stats,
        "smtp_daily": smtp_daily,
        "activity_heatmap": activity_heatmap,
        "totals": {
            "users": len(users),
            "admins": sum(1 for u in users if u.role == "admin"),
            "onboarded": sum(1 for u in users if u.onboarding_complete),
            "signups_today": signups_today,
            "active_today": active_today,
            "active_week": active_week,
            "inactive": max(0, len(users) - active_week),
            "jobs": len(jobs),
            "jobs_pending": rs.get("pending_review", 0),
            "jobs_approved": rs.get("approved", 0),
            "jobs_rejected": rs.get("rejected", 0),
            "import_sessions": imports_sessions,
            "resumes": len(resumes),
            "avg_ats": round(sum(ats_values) / len(ats_values), 1) if ats_values else 0,
            "ai_usage": ai_usage,
        },
        "user_growth": user_growth if len(users) else [],
        "experience_distribution": experience_distribution,
        "top_skills": top_skills,
        "preferred_roles": preferred_roles,
        "locations": locations,
        "resume_scores": resume_scores,
        "smtp_performance": smtp_performance,
        "applications": applications,
    }
