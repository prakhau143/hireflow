"""Profile Intelligence: deterministic health score (free, instant) + AI career
insights (one cached Groq call) + portfolio link verification (real HTTP checks)."""
import json
import re
from datetime import datetime, timezone

import httpx

from app.models.user import User

# ---------------------------------------------------------------- health score

_SECTION_WEIGHTS = {
    "basic_info": 15, "skills": 15, "resume": 20, "projects": 15,
    "experience": 10, "socials": 15, "certifications": 10,
}


def compute_health_score(user: User, best_resume_ats: int | None) -> dict:
    """100-point deterministic profile completeness score. No AI — always instant."""
    scores: dict[str, float] = {}

    basic_fields = [user.phone, user.current_location, user.current_role, user.years_experience is not None]
    scores["basic_info"] = sum(1 for f in basic_fields if f) / len(basic_fields)

    n_skills = len(user.skills or [])
    scores["skills"] = min(1.0, n_skills / 10)

    scores["resume"] = min(1.0, (best_resume_ats or 0) / 100) if best_resume_ats is not None else 0.0

    n_projects = len(user.projects or [])
    scores["projects"] = min(1.0, n_projects / 3)

    n_exp = len(user.experience_timeline or [])
    scores["experience"] = min(1.0, n_exp / 2)

    socials = [user.github_url, user.portfolio_url, user.linkedin_url]
    scores["socials"] = sum(1 for s in socials if s) / len(socials)

    n_certs = len(user.certifications or [])
    scores["certifications"] = min(1.0, n_certs / 2)

    breakdown = []
    total = 0.0
    for key, weight in _SECTION_WEIGHTS.items():
        pct = round(scores[key] * 100)
        pts = scores[key] * weight
        total += pts
        breakdown.append({
            "key": key,
            "label": key.replace("_", " ").title(),
            "percent": pct,
            "points": round(pts, 1),
            "max_points": weight,
        })

    suggestions = []
    if not user.portfolio_url:
        suggestions.append({"action": "Add Portfolio link", "gain": round(_SECTION_WEIGHTS["socials"] / 3)})
    if not user.github_url:
        suggestions.append({"action": "Add GitHub link", "gain": round(_SECTION_WEIGHTS["socials"] / 3)})
    if not user.linkedin_url:
        suggestions.append({"action": "Add LinkedIn link", "gain": round(_SECTION_WEIGHTS["socials"] / 3)})
    if n_projects < 3:
        suggestions.append({"action": f"Add {3 - n_projects} more project{'s' if 3 - n_projects != 1 else ''}",
                            "gain": round(_SECTION_WEIGHTS["projects"] / 3 * (3 - n_projects))})
    if not user.phone:
        suggestions.append({"action": "Verify phone number", "gain": round(_SECTION_WEIGHTS["basic_info"] / 4)})
    if n_skills < 10:
        suggestions.append({"action": f"Add {min(10 - n_skills, 5)} more skills", "gain": round(_SECTION_WEIGHTS["skills"] / 10 * min(10 - n_skills, 5))})
    if n_certs < 2:
        suggestions.append({"action": "Add a certification", "gain": round(_SECTION_WEIGHTS["certifications"] / 2)})
    if best_resume_ats is None:
        suggestions.append({"action": "Upload a resume", "gain": _SECTION_WEIGHTS["resume"]})
    suggestions.sort(key=lambda s: -s["gain"])

    return {
        "score": round(total),
        "breakdown": breakdown,
        "suggestions": suggestions[:5],
    }


# ---------------------------------------------------------------- AI career insights

async def generate_career_insights(user: User, best_resume_ats: int | None, health_score: int) -> dict:
    """One Groq call → career path, interview readiness, recruiter-view preview.
    Caller is responsible for caching the result on user.ai_career_insights."""
    from app.services.ai_service import _get_client
    from app.config import settings

    prompt = f"""You are an elite career strategist AI. Analyze this candidate profile.

PROFILE:
Current role: {user.current_role or 'Not specified'} | Experience: {user.years_experience or 0} years
Skills: {', '.join((user.skills or [])[:20]) or 'None listed'}
Projects: {len(user.projects or [])} | Certifications: {', '.join(c.get('name','') for c in (user.certifications or []))[:200] or 'None'}
Preferred domains: {', '.join(user.preferred_domains or []) or 'Not specified'}
Dream companies: {', '.join(user.dream_companies or []) or 'Not specified'}
Resume ATS score: {best_resume_ats if best_resume_ats is not None else 'No resume uploaded'}
Profile completeness: {health_score}/100

Respond ONLY with valid JSON, no markdown:
{{
  "career_path": [
    {{"stage": "current", "title": "their current likely level+track", "skills_needed": []}},
    {{"stage": "next", "title": "next logical role (e.g. 'AI Backend Engineer')", "skills_needed": ["2-3 skills to learn"]}},
    {{"stage": "future", "title": "role 3-5 years out (e.g. 'ML Infrastructure Lead')", "skills_needed": ["2-3 skills to learn"]}}
  ],
  "interview_readiness": {{
    "score": <0-100>,
    "missing_topics": ["2-4 topics they should prepare"],
    "strong_topics": ["2-3 topics they're already strong in"]
  }},
  "recruiter_view": {{
    "first_impression": "one honest sentence — what a recruiter notices in the first 6 seconds",
    "top_highlights": ["2-3 things that stand out most on this profile"],
    "biggest_gap": "one sentence — the single thing most likely to cause a recruiter to pass"
  }}
}}"""

    client = _get_client()
    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        response_format={"type": "json_object"},
        max_tokens=1200,
    )
    data = json.loads(response.choices[0].message.content)
    data["generated_at"] = datetime.now(timezone.utc).isoformat()
    return data


# ---------------------------------------------------------------- portfolio health check

_GITHUB_URL_RE = re.compile(r"github\.com/([A-Za-z0-9\-]+)/?$")


async def check_portfolio_health(user: User) -> dict:
    """Real HTTP reachability checks for GitHub/portfolio/LinkedIn — no mocked status."""
    results = []
    async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
        for label, url in [("GitHub", user.github_url), ("Portfolio", user.portfolio_url), ("LinkedIn", user.linkedin_url)]:
            if not url:
                results.append({"label": label, "url": None, "status": "not_set"})
                continue
            try:
                resp = await client.head(url)
                if resp.status_code >= 400:
                    resp = await client.get(url)  # some sites reject HEAD
                ok = resp.status_code < 400
                results.append({
                    "label": label, "url": url, "status": "reachable" if ok else "broken",
                    "status_code": resp.status_code,
                })
            except Exception as e:
                results.append({"label": label, "url": url, "status": "unreachable", "error": type(e).__name__})

        # GitHub activity check via public API (no auth — subject to public rate limits)
        gh_activity = None
        m = _GITHUB_URL_RE.search(user.github_url or "")
        if m:
            try:
                resp = await client.get(f"https://api.github.com/users/{m.group(1)}")
                if resp.status_code == 200:
                    d = resp.json()
                    gh_activity = {
                        "username": m.group(1),
                        "public_repos": d.get("public_repos"),
                        "followers": d.get("followers"),
                        "updated_at": d.get("updated_at"),
                    }
            except Exception:
                pass

    return {"checks": results, "github_activity": gh_activity,
            "checked_at": datetime.now(timezone.utc).isoformat()}
