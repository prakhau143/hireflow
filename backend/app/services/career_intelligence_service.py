"""Career Intelligence — Career Health, Recruiter Visibility, Market Demand and
Salary Prediction. Everything here is deterministic and computed from data the
user already has (profile completeness, resume ATS, their own imported job pool,
applications sent) — no new AI calls, no invented numbers.

Does NOT touch the job-matching engine (matching_service.py) — that stays frozen."""
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone

_SALARY_RANGE_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*(lpa|lakhs?|l\b)", re.IGNORECASE
)
_SALARY_SINGLE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(lpa|lakhs?|l\b)", re.IGNORECASE)
_SALARY_MONTHLY_RE = re.compile(r"(\d+(?:,\d{3})*)\s*(?:/|per)?\s*month", re.IGNORECASE)


def parse_salary_lpa(salary: str | None) -> tuple[float, float] | None:
    """'8-12 LPA' -> (8.0, 12.0), '6 LPA' -> (6.0, 6.0), '50,000/month' -> (6.0, 6.0)."""
    if not salary:
        return None
    s = salary.strip()
    m = _SALARY_RANGE_RE.search(s)
    if m:
        lo, hi = float(m.group(1)), float(m.group(2))
        return (lo, hi) if lo <= hi else (hi, lo)
    m = _SALARY_SINGLE_RE.search(s)
    if m:
        v = float(m.group(1))
        return (v, v)
    m = _SALARY_MONTHLY_RE.search(s)
    if m:
        monthly = float(m.group(1).replace(",", ""))
        annual_lakhs = round(monthly * 12 / 100000, 1)
        return (annual_lakhs, annual_lakhs)
    return None


def compute_salary_prediction(user, jobs: list) -> dict | None:
    """Current = market median for jobs at the user's experience level (from their
    own imported pool). Expected = their stated expected/target salary. Market =
    overall median across every imported job with a parseable salary."""
    all_ranges = []
    same_level_ranges = []
    user_exp = user.years_experience if user.years_experience is not None else None

    for j in jobs:
        r = parse_salary_lpa(j.salary)
        if not r:
            continue
        mid = (r[0] + r[1]) / 2
        all_ranges.append(mid)
        if user_exp is not None and (j.experience_min or 0) <= user_exp <= (j.experience_max or 99):
            same_level_ranges.append(mid)

    if not all_ranges:
        return None

    def _median(vals: list[float]) -> float:
        s = sorted(vals)
        n = len(s)
        mid = n // 2
        return round(s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2, 1)

    market = _median(all_ranges)
    current = _median(same_level_ranges) if same_level_ranges else market

    expected_str = user.expected_salary or user.target_salary
    expected = None
    if expected_str:
        r = parse_salary_lpa(expected_str)
        expected = round((r[0] + r[1]) / 2, 1) if r else None

    return {
        "current": current,
        "expected": expected,
        "market": market,
        "sample_size": len(all_ranges),
        "unit": "LPA",
    }


def compute_market_demand(jobs: list, user_skills: list[str], days: int = 90) -> list[dict]:
    """For each of the user's skills, count how often it appears in their imported
    job pool, split into a recent window vs the window before it, to get a
    directional trend (↑ growing / ↓ shrinking / → stable) grounded in real data."""
    now = datetime.now(timezone.utc)
    recent_cutoff = now - timedelta(days=days // 2)
    older_cutoff = now - timedelta(days=days)

    def _naive(dt):
        return dt.replace(tzinfo=None) if dt and dt.tzinfo else dt
    now_n, recent_n, older_n = _naive(now), _naive(recent_cutoff), _naive(older_cutoff)

    recent_counter: Counter[str] = Counter()
    older_counter: Counter[str] = Counter()
    recent_total = older_total = 0

    for j in jobs:
        created = _naive(j.created_at)
        if not created or created < older_n:
            continue
        bucket = recent_counter if created >= recent_n else older_counter
        if created >= recent_n:
            recent_total += 1
        else:
            older_total += 1
        for s in (j.skills or []):
            bucket[s.lower()] += 1

    results = []
    user_set = {s.lower(): s for s in (user_skills or [])}
    for low, original in user_set.items():
        recent_pct = (recent_counter.get(low, 0) / recent_total * 100) if recent_total else 0
        older_pct = (older_counter.get(low, 0) / older_total * 100) if older_total else 0
        delta = recent_pct - older_pct
        if recent_counter.get(low, 0) == 0 and older_counter.get(low, 0) == 0:
            continue
        trend = "up" if delta >= 3 else "down" if delta <= -3 else "stable"
        results.append({
            "skill": original, "trend": trend,
            "recent_demand_pct": round(recent_pct, 1),
            "mentions": recent_counter.get(low, 0) + older_counter.get(low, 0),
        })
    results.sort(key=lambda r: -r["mentions"])
    return results[:10]


def compute_recruiter_visibility(user, health_score: int, resume_ats: int | None, market_demand: list[dict]) -> dict:
    """How discoverable/attractive this profile would look to a recruiter scanning it."""
    score = 0.0
    reasons = []

    score += min(1.0, health_score / 100) * 35
    if resume_ats is not None:
        score += min(1.0, resume_ats / 100) * 30
    else:
        reasons.append("No resume uploaded — recruiters can't verify your skills")

    socials = sum(1 for s in (user.github_url, user.portfolio_url, user.linkedin_url) if s)
    score += (socials / 3) * 15
    if socials < 2:
        reasons.append("Add more social/portfolio links — profiles with 2+ links get noticed more")

    n_projects = len(user.projects or [])
    score += min(1.0, n_projects / 3) * 10
    if n_projects == 0:
        reasons.append("No projects listed — recruiters want to see applied work")

    trending_up = sum(1 for m in market_demand if m["trend"] == "up")
    score += min(1.0, trending_up / 3) * 10
    if trending_up:
        reasons.append(f"{trending_up} of your skills are trending up in demand")

    return {"score": round(score), "reasons": reasons[:4]}


def compute_career_health(profile_score: int, resume_ats: int | None, recruiter_visibility: int, applications_sent_30d: int) -> dict:
    """Single composite number — the "how is my job search actually going" score."""
    ats = resume_ats if resume_ats is not None else 0
    activity = min(1.0, applications_sent_30d / 15) * 100  # 15+ applications/month = full marks

    weighted = profile_score * 0.30 + ats * 0.30 + recruiter_visibility * 0.25 + activity * 0.15
    score = round(weighted)

    breakdown = [
        {"label": "Profile Completeness", "value": profile_score, "weight": 30},
        {"label": "Resume ATS", "value": ats, "weight": 30},
        {"label": "Recruiter Visibility", "value": recruiter_visibility, "weight": 25},
        {"label": "Application Activity", "value": round(activity), "weight": 15},
    ]
    return {"score": score, "breakdown": breakdown}


# ---------------------------------------------------------------- weekly goals

def _iso_week_start(d: datetime) -> date:
    day = d.date() if isinstance(d, datetime) else d
    return day - timedelta(days=day.weekday())  # Monday


def default_goals_for_week(user, resume_ats: int | None) -> list[dict]:
    """Sensible starting goals if the user hasn't set any this week yet."""
    goals = [{"goal_type": "apply_jobs", "label": "Apply to 15 Jobs", "target": 15, "skill": None}]
    if resume_ats is not None and resume_ats < 90:
        goals.append({"goal_type": "improve_ats", "label": f"Improve ATS Score above {min(95, resume_ats + 5)}", "target": min(95, resume_ats + 5), "skill": None})
    return goals


def compute_goal_progress(goal, user, applications_this_week: int, ats_at_week_start: int | None, ats_now: int | None) -> dict:
    if goal.goal_type == "apply_jobs":
        current = applications_this_week
        target = goal.target or 1
        return {"current": current, "target": target, "percent": min(100, round(current / target * 100)), "done": current >= target}
    if goal.goal_type == "learn_skill":
        have = goal.skill and any(goal.skill.lower() == s.lower() for s in (user.skills or []))
        return {"current": 1 if have else 0, "target": 1, "percent": 100 if have else 0, "done": bool(have)}
    if goal.goal_type == "improve_ats":
        base = ats_at_week_start if ats_at_week_start is not None else 0
        now = ats_now if ats_now is not None else base
        target = goal.target or 100
        percent = 100 if now >= target else round(max(0, now - base) / max(1, target - base) * 100)
        return {"current": now, "target": target, "percent": min(100, percent), "done": now >= target}
    # custom — manual toggle
    return {"current": 1 if goal.completed else 0, "target": 1, "percent": 100 if goal.completed else 0, "done": goal.completed}
