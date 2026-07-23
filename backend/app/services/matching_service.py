"""Multi-factor AI Matching Engine (v2).

Weighted formula:  Experience 25 · Skills 35 · Resume ATS 20 · Role 10 · Location 5 · Salary 5
Experience is a primary eligibility factor: far-outside-range jobs score ~10 and are
excluded from Recommended. Components without data are excluded and the total is
normalized, so missing data never punishes the candidate.

Recommended rule:  experience > 75  AND  skills > 65  AND  overall > 80.
Mandatory skills:  the first 2 job skills are must-haves — missing one caps overall at 70.
"""
from app.services.taxonomy import canonical_skills, role_family, canonical_location

WEIGHTS = {"experience": 25, "skills": 35, "resume": 20, "role": 10, "location": 5, "salary": 5}

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


def _experience_score(user_years: int | None, exp_min: int, exp_max: int) -> tuple[float | None, str | None]:
    """The hard-rule curve: 3yr vs 3-5→100, 2-4→95, 1-3→90, 0-5→85, 4-6→55, 6-9→10."""
    if user_years is None:
        return None, None
    if exp_min <= user_years <= exp_max:
        pts = max(85, 100 - 5 * (user_years - exp_min))
        return pts / 100.0, "Perfect Experience Match"
    if user_years < exp_min:  # under-qualified
        gap = exp_min - user_years
        if gap <= 1:
            return 0.55, "Slightly Senior Role"
        if gap <= 2:
            return 0.30, f"Growth Opportunity — {gap} yrs short"
        return 0.10, f"Senior Role — {gap} yrs short"
    gap = user_years - exp_max  # over-qualified
    if gap <= 1:
        return 0.70, "Junior Friendly"
    if gap <= 3:
        return 0.50, "Junior Role for You"
    return 0.25, "Below Your Level"


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


def compute_match(job: dict, user, resume=None) -> dict:
    """Score one job against the user. Returns score, tier, recommended flag,
    experience badge, per-component breakdown and improvement suggestions."""
    job_skills = canonical_skills(job.get("skills"))
    user_set = {s.lower() for s in canonical_skills(list(user.skills or []))}

    exp_frac, exp_badge = _experience_score(
        user.years_experience,
        int(job.get("experience_min") or 0),
        int(job.get("experience_max") or 5),
    )
    skills_frac, matched, missing, mandatory_missing = _skills_score(job_skills, user_set)

    resume_frac = None
    if resume is not None and (resume.ats_score or 0) > 0:
        ats = (resume.ats_score or 0) / 100.0
        strong = {s.lower() for s in canonical_skills(list(resume.strong_skills or []))}
        overlap = (sum(1 for s in job_skills if s.lower() in strong) / len(job_skills)) if job_skills else ats
        resume_frac = min(1.0, 0.6 * ats + 0.4 * overlap)

    components: dict[str, float | None] = {
        "experience": exp_frac,
        "skills": skills_frac if job_skills else None,
        "resume": resume_frac,
        "role": _role_score(job.get("role") or "", user),
        "location": _location_score(job.get("location") or "", job.get("work_mode") or "", user),
        "salary": None,  # needs expected-CTC preference (future profile field)
    }
    labels = {"experience": "Experience Fit", "skills": "Skills Match", "resume": "Resume ATS Alignment",
              "role": "Role Alignment", "location": "Location Fit", "salary": "Salary Fit"}

    earned = available = 0.0
    breakdown = []
    for key, max_pts in WEIGHTS.items():
        frac = components[key]
        item = {"key": key, "label": labels[key], "max": max_pts,
                "available": frac is not None,
                "score": round((frac or 0) * max_pts, 1),
                "pct": round((frac or 0) * 100)}
        if frac is not None:
            earned += frac * max_pts
            available += max_pts
        breakdown.append(item)

    score = round(earned / available * 100) if available else 0
    if components["skills"] is None:
        score = min(score, 45)                      # unmatchable job — never looks perfect
    if mandatory_missing:
        score = min(score, 70)                      # must-have skill missing → hard cap
    if exp_frac is not None and exp_frac < 0.85:
        score = min(score, 60)                      # outside experience range → overall never above 60

    exp_pct = round((exp_frac or 0) * 100) if exp_frac is not None else None
    skill_pct = round(skills_frac * 100) if job_skills else None
    recommended = bool(
        exp_pct is not None and exp_pct > 75
        and skill_pct is not None and skill_pct > 65
        and score > 80
    )

    # Smart suggestions: projected score + learning time + priority
    suggestions = []
    if missing and job_skills and available:
        for skill in missing[:3]:
            new_frac, _, _, new_mand = _skills_score(job_skills, user_set | {skill.lower()})
            new_earned = earned - (components["skills"] or 0) * WEIGHTS["skills"] + new_frac * WEIGHTS["skills"]
            projected = round(new_earned / available * 100)
            if new_mand:
                projected = min(projected, 70)
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
        "suggestions": suggestions[:3],
    }
