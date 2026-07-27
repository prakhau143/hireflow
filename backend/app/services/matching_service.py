"""Multi-factor AI Matching Engine (v3).

Experience is a HARD CAP, not an additive weight: the base score is computed from
Skills 40 · Resume/ATS 25 · Projects 15 · Role 10 · Location 5 · Salary 5, then the
final score is min(base, experience_cap) — no matter how high the base score is, a
job outside the candidate's experience range never reads higher than the experience
cap allows. Components without data are excluded and the base is normalized over
what's available, so missing data never punishes the candidate — only a real
experience mismatch does.

Experience cap table (candidate has N years; job needs exp_min-exp_max):
  within range, buffer>=1yr -> 100 · exactly at the floor -> 95
  under-qualified: gap=1->50, gap=2->40, gap=3->30, gap=4->20, gap>=5->10 (floor)
  over-qualified:  gap<=1->70, gap<=3->50, else->25

Recommended rule:  experience cap >= 85  AND  skills > 60  (matches the Jobs page's
Recommended / Need Learning / Future Fit buckets exactly).
Mandatory skills:  the first 2 job skills are must-haves — missing one caps the base at 70.
"""
from app.services.taxonomy import canonical_skills, role_family, canonical_location

BASE_WEIGHTS = {"skills": 40, "resume": 25, "projects": 15, "role": 10, "location": 5, "salary": 5}

TIERS = [(90, "Perfect Fit"), (80, "Strong Fit"), (70, "Good Fit"), (55, "Stretch Role"), (0, "Weak Fit")]

# Estimated learning time for common skill gaps (Smart Missing Skills)
LEARN_TIME = {
    "docker": "2 weeks", "redis": "1-2 weeks", "kubernetes": "4-6 weeks", "aws": "4 weeks",
    "gcp": "4 weeks", "azure": "4 weeks", "graphql": "1-2 weeks", "typescript": "2 weeks",
    "kafka": "3 weeks", "ci/cd": "1-2 weeks", "terraform": "3 weeks", "next.js": "2 weeks",
    "fastapi": "1-2 weeks", "django": "3 weeks", "react": "3-4 weeks", "node.js": "3 weeks",
    "mongodb": "1-2 weeks", "postgresql": "2 weeks", "spring boot": "4 weeks",
}


def tier_for(score: float) -> str:
    for threshold, label in TIERS:
        if score >= threshold:
            return label
    return TIERS[-1][1]


def _experience_score(user_years: int | None, exp_min: float, exp_max: float) -> tuple[float | None, str | None]:
    """Hard-cap table. Example (candidate has 2 yrs): job needs 0-2/1-3->100, 2-4->95,
    3+->50, 4+->40, 5+->30, 6+->20, 8+->10 — verified point-for-point against spec."""
    if user_years is None:
        return None, None
    if user_years >= exp_min:
        if user_years > exp_max:  # over-qualified
            gap = user_years - exp_max
            if gap <= 1:
                return 0.70, "Junior Friendly"
            if gap <= 3:
                return 0.50, "Junior Role for You"
            return 0.25, "Below Your Level"
        buffer = user_years - exp_min
        if buffer >= 1:
            return 1.00, "Perfect Experience Match"
        return 0.95, "Perfect Experience Match"  # exactly at the floor of the range
    gap = exp_min - user_years  # under-qualified
    pts = max(10, 50 - 10 * (gap - 1))
    return pts / 100.0, f"Needs {gap} more year{'s' if gap != 1 else ''} experience"


def _projects_score(job_skills: list[str], user_projects: list | None) -> float | None:
    """Fraction of job skills evidenced by the candidate's project tech stacks/descriptions."""
    if not user_projects or not job_skills:
        return None
    text = " ".join(
        " ".join(p.get("tech") or []) + " " + (p.get("description") or "")
        for p in user_projects if isinstance(p, dict)
    ).lower()
    if not text.strip():
        return None
    hits = sum(1 for s in job_skills if s.lower() in text)
    return hits / len(job_skills)


def _skills_score(job_skills: list[str], user_set: set[str]) -> tuple[float, list[str], list[str], bool]:
    """Linear descending weights (first-listed matter most: 5 skills → 33/27/20/13/7).
    First 2 skills are mandatory. Returns (frac, matched, missing, mandatory_missing)."""
    if not job_skills:
        return 0.0, [], [], False
    n = len(job_skills)
    weights = [float(n - i) for i in range(n)]
    total = sum(weights)
    earned, matched, missing = 0.0, [], []
    mandatory_missing = False
    for i, (skill, w) in enumerate(zip(job_skills, weights)):
        if skill.lower() in user_set:
            earned += w
            matched.append(skill)
        else:
            missing.append(skill)
            if i < min(2, n):
                mandatory_missing = True
    return earned / total, matched, missing, mandatory_missing


def _location_score(job_location: str, work_mode: str, user) -> float | None:
    if (work_mode or "").lower() == "remote":
        return 1.0
    job_loc = canonical_location(job_location)
    if not job_loc:
        return None
    user_locs = {canonical_location(l) for l in (user.preferred_locations or []) if l}
    if user.current_location:
        user_locs.add(canonical_location(user.current_location))
    user_locs.discard("")
    if not user_locs:
        return None
    cities = {c.strip() for c in job_loc.split("/")}
    if cities & user_locs or "India (Any)" in cities:
        return 1.0
    return 0.4 if (work_mode or "").lower() == "hybrid" else 0.2


def _role_score(job_title: str, user) -> float | None:
    fam = role_family(job_title)
    if not fam:
        return None
    user_roles = list(user.preferred_roles or [])
    if user.current_role:
        user_roles.append(user.current_role)
    user_fams = {role_family(r) for r in user_roles if role_family(r)}
    if not user_fams:
        return None
    if fam in user_fams:
        return 1.0
    adjacent = {
        "Backend Developer": {"Full Stack Developer", "Software Engineer"},
        "Frontend Developer": {"Full Stack Developer", "Software Engineer"},
        "Full Stack Developer": {"Backend Developer", "Frontend Developer", "Software Engineer"},
        "Software Engineer": {"Backend Developer", "Frontend Developer", "Full Stack Developer"},
        "Data Scientist": {"Data Engineer", "Data Analyst"},
        "Data Engineer": {"Data Scientist", "Backend Developer"},
        "Data Analyst": {"Data Scientist"},
        "DevOps Engineer": {"Backend Developer", "Software Engineer"},
    }
    return 0.5 if user_fams & adjacent.get(fam, set()) else 0.1


def _base_score(components: dict[str, float | None], mandatory_missing: bool) -> tuple[int, list[dict], float, float]:
    """Skills+Resume+Projects+Role+Location+Salary only — experience never enters this
    sum, it's applied as an external cap by the caller."""
    labels = {"skills": "Skills Match", "resume": "Resume ATS Alignment", "projects": "Project Relevance",
              "role": "Role Alignment", "location": "Location Fit", "salary": "Salary Fit"}
    earned = available = 0.0
    breakdown = []
    for key, max_pts in BASE_WEIGHTS.items():
        frac = components[key]
        item = {"key": key, "label": labels[key], "max": max_pts,
                "available": frac is not None,
                "score": round((frac or 0) * max_pts, 1),
                "pct": round((frac or 0) * 100)}
        if frac is not None:
            earned += frac * max_pts
            available += max_pts
        breakdown.append(item)

    base = round(earned / available * 100) if available else 0
    if components["skills"] is None:
        base = min(base, 45)      # unmatchable job — never looks perfect
    if mandatory_missing:
        base = min(base, 70)      # must-have skill missing → hard cap
    return base, breakdown, earned, available


def compute_match(job: dict, user, resume=None) -> dict:
    """Score one job against the user. Experience is a HARD CAP applied after the
    base (Skills+Resume+Projects+Role+Location+Salary) score — a job outside the
    candidate's experience range can never read higher than the experience cap,
    no matter how strong the rest of the match is. Returns score, tier, recommended
    flag, experience badge, per-component breakdown and improvement suggestions."""
    job_skills = canonical_skills(job.get("skills"))
    user_set = {s.lower() for s in canonical_skills(list(user.skills or []))}

    exp_frac, exp_badge = _experience_score(
        user.years_experience,
        float(job.get("experience_min") or 0),
        float(job.get("experience_max") or 5),
    )
    skills_frac, matched, missing, mandatory_missing = _skills_score(job_skills, user_set)
    projects_frac = _projects_score(job_skills, user.projects)

    resume_frac = None
    if resume is not None and (resume.ats_score or 0) > 0:
        ats = (resume.ats_score or 0) / 100.0
        strong = {s.lower() for s in canonical_skills(list(resume.strong_skills or []))}
        overlap = (sum(1 for s in job_skills if s.lower() in strong) / len(job_skills)) if job_skills else ats
        resume_frac = min(1.0, 0.6 * ats + 0.4 * overlap)

    components: dict[str, float | None] = {
        "skills": skills_frac if job_skills else None,
        "resume": resume_frac,
        "projects": projects_frac,
        "role": _role_score(job.get("role") or "", user),
        "location": _location_score(job.get("location") or "", job.get("work_mode") or "", user),
        "salary": None,  # needs expected-CTC preference (future profile field)
    }
    base_score, breakdown, earned, available = _base_score(components, mandatory_missing)

    exp_pct = round((exp_frac or 0) * 100) if exp_frac is not None else None
    exp_cap = exp_pct if exp_frac is not None else 100
    score = min(base_score, exp_cap)  # the hard cap — "no matter what"

    # Experience shown first in the breakdown for display, but — unlike every other
    # row — it was never summed into base_score; it only ever caps the final number.
    # max=100/score=pct keeps the same score/max=fraction invariant every other row
    # has (frac*max/max=frac), so the frontend's progress-bar math needs no special case.
    breakdown.insert(0, {
        "key": "experience", "label": "Experience Fit", "max": 100, "is_cap": True,
        "available": exp_frac is not None,
        "score": exp_pct or 0,
        "pct": exp_pct or 0,
    })

    skill_pct = round(skills_frac * 100) if job_skills else None
    recommended = bool((exp_cap >= 85) and skill_pct is not None and skill_pct > 60)

    # Every missing skill gets a learning-time estimate (not just the top score-improvers
    # below) so the UI can show "Redis: 1-2 weeks" style chips for the full gap list.
    missing_skills_detail = [
        {"skill": skill, "learn_time": LEARN_TIME.get(skill.lower(), "2-4 weeks")}
        for skill in missing
    ]

    # Simple, clearly-labeled estimate (not a real ML prediction) — dampens the raw
    # score so it reads as a probability rather than a duplicate of the match score.
    apply_probability = max(5, min(92, round(score * 0.85 + 5)))

    # Smart suggestions: projected score + learning time + priority
    suggestions = []
    if missing and job_skills and available:
        for skill in missing[:3]:
            new_frac, _, _, new_mand = _skills_score(job_skills, user_set | {skill.lower()})
            new_earned = earned - (components["skills"] or 0) * BASE_WEIGHTS["skills"] + new_frac * BASE_WEIGHTS["skills"]
            new_base = round(new_earned / available * 100)
            if new_mand:
                new_base = min(new_base, 70)
            projected = min(new_base, exp_cap)  # learning a skill still can't beat the experience cap
            if projected > score:
                suggestions.append({
                    "skill": skill, "projected": projected, "gain": projected - score,
                    "learn_time": LEARN_TIME.get(skill.lower(), "2-4 weeks"),
                    "priority": "high" if (projected - score) >= 8 or skill in missing[:2] else "medium",
                })
        suggestions.sort(key=lambda s: -s["gain"])

    return {
        "score": score,
        "tier": tier_for(score),
        "recommended": recommended,
        "experience_badge": exp_badge,
        "breakdown": breakdown,
        "matched_skills": matched,
        "missing_skills": missing,
        "missing_skills_detail": missing_skills_detail,
        "apply_probability": apply_probability,
        "suggestions": suggestions[:3],
    }


def _job_to_match_dict(job) -> dict:
    """Job ORM row → the plain dict compute_match() expects."""
    return {
        "role": job.title,
        "company": job.company,
        "skills": job.skills,
        "experience_min": job.experience_min,
        "experience_max": job.experience_max,
        "location": job.location,
        "work_mode": job.location_type,
    }


async def sync_user_job_match(db, job, user, resume=None):
    """Compute (or refresh) one user's personalized match for one global job.
    Only sets the initial status/archive_reason when the row is first created —
    never overwrites a status the user has since changed (applied/shortlisted/...)."""
    from sqlalchemy import select
    from app.models.user_job_match import UserJobMatch

    match = compute_match(_job_to_match_dict(job), user, resume)
    existing = (await db.execute(
        select(UserJobMatch).where(UserJobMatch.user_id == user.id, UserJobMatch.job_id == job.id)
    )).scalar_one_or_none()

    if existing is None:
        status = "archived" if match["score"] < 40 else "new"
        archive_reason = "low_match" if status == "archived" else None
        existing = UserJobMatch(user_id=user.id, job_id=job.id, status=status, archive_reason=archive_reason)
        db.add(existing)

    existing.match_score = match["score"]
    existing.match_tier = match["tier"]
    existing.is_recommended = match["recommended"]
    existing.experience_badge = match["experience_badge"]
    existing.match_breakdown = match["breakdown"]
    existing.matched_skills = match["matched_skills"]
    existing.missing_skills = match["missing_skills"]
    existing.missing_skills_detail = match["missing_skills_detail"]
    existing.apply_probability = match["apply_probability"]
    existing.score_suggestions = match["suggestions"]
    return existing


async def backfill_matches_for_new_job(db, job) -> int:
    """A job just got approved — compute every existing user's personalized match for it."""
    from sqlalchemy import select
    from app.models.user import User
    from app.models.resume import Resume

    users = (await db.execute(select(User))).scalars().all()
    for u in users:
        resume = (await db.execute(
            select(Resume).where(Resume.user_id == u.id).order_by(Resume.created_at.desc()).limit(1)
        )).scalars().first()
        await sync_user_job_match(db, job, u, resume)
    await db.commit()
    return len(users)


async def backfill_matches_for_user(db, user, resume=None) -> int:
    """A user just finished onboarding (or updated their profile) — compute their
    personalized match against every currently-approved job."""
    from sqlalchemy import select
    from app.models.job import Job
    from app.models.resume import Resume

    if resume is None:
        resume = (await db.execute(
            select(Resume).where(Resume.user_id == user.id).order_by(Resume.created_at.desc()).limit(1)
        )).scalars().first()

    jobs = (await db.execute(select(Job).where(Job.review_status == "approved"))).scalars().all()
    for j in jobs:
        await sync_user_job_match(db, j, user, resume)
    await db.commit()
    return len(jobs)
