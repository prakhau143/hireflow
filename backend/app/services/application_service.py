"""Application Preparation Agent.

One AI request per job produces the full application package: personalized
subject + body, company-specific intro, alignment summary, reply probability,
interview tips and a follow-up draft. Deterministic layers handle template
auto-selection, resume auto-selection, {{variable}} filling, recruiter
detection and the humanized email assembly — so a Groq outage still produces
a sendable (non-personalized) email.
"""
import json
import random
import re
from datetime import datetime

from app.config import settings

# ---------------------------------------------------------------- variables

def fill_variables(text: str, user, job, resume=None) -> str:
    """Replace {{variable}} placeholders with real profile/job data."""
    top_skills = ", ".join((user.skills or [])[:6])
    matched = ", ".join((job.matched_skills or [])[:5]) if job is not None else ""
    missing = ", ".join((job.missing_skills or [])[:3]) if job is not None else ""
    values = {
        "name": user.name or "",
        "email": user.email or "",
        "phone": user.phone or "",
        "role": (job.title if job is not None else "") or "",
        "company": (job.company if job is not None else "") or "",
        "location": (job.location if job is not None else "") or "",
        "skills": top_skills,
        "matched_skills": matched,
        "missing_skills": missing,
        "experience": f"{user.years_experience or 0} years",
        "portfolio": user.portfolio_url or "",
        "github": user.github_url or "",
        "linkedin": user.linkedin_url or "",
        "resume": (resume.name if resume is not None else "") or "resume",
        "current_company": user.current_role or "",
        "current_role": user.current_role or "",
        "today": datetime.now().strftime("%d %b %Y"),
        "job_summary": ((job.ai_summary or job.description or "")[:200] if job is not None else ""),
        "match_score": f"{round(job.match_score or 0)}%" if job is not None else "",
        "recruiter_name": (getattr(job, "hiring_manager", None) or "Hiring Team") if job is not None else "Hiring Team",
        "notice_period": "immediately available",
        "career_goal": ", ".join((user.preferred_roles or [])[:2]),
    }
    def _sub(m: re.Match) -> str:
        return str(values.get(m.group(1).strip().lower(), m.group(0)))
    return re.sub(r"\{\{\s*([a-zA-Z_]+)\s*\}\}", _sub, text or "")


# ---------------------------------------------------------------- pickers

def detect_recruiter(email: str | None) -> dict:
    """careers@ → generic team greeting; john@ → personal greeting."""
    if not email or "@" not in email:
        return {"kind": "generic", "greeting": "Dear Hiring Team"}
    local = email.split("@")[0].lower()
    generic_prefixes = ("career", "hr", "job", "talent", "recruit", "hiring", "apply",
                        "work", "cv", "resume", "placement", "info", "contact", "admin", "team")
    if any(local.startswith(p) for p in generic_prefixes):
        return {"kind": "generic", "greeting": "Dear Hiring Team"}
    name = re.sub(r"[._\-\d]+", " ", local).strip().title()
    return {"kind": "personal", "greeting": f"Hi {name.split()[0]}" if name else "Hi"}


def pick_template(job, templates: list) -> object | None:
    """Rule-based auto-selection: Internship job → Internship template, etc."""
    if not templates:
        return None
    etype = (job.employment_type or "").lower()
    tags = " ".join(job.smart_tags or []).lower()
    exp_min = job.experience_min or 0

    def by_cat(*cats):
        for c in cats:
            for t in templates:
                if (t.category or "").lower() == c.lower():
                    return t
        return None

    if "intern" in etype or "intern" in (job.title or "").lower():
        pick = by_cat("Internship")
    elif exp_min == 0 and (job.experience_max or 0) <= 1:
        pick = by_cat("Fresher")
    elif "startup" in tags:
        pick = by_cat("Startup")
    elif "mnc" in tags:
        pick = by_cat("MNC")
    elif job.location_type == "remote":
        pick = by_cat("Remote")
    elif exp_min >= 4:
        pick = by_cat("Experienced")
    else:
        pick = None
    return pick or by_cat("Resume Submission", "Cold Outreach") or templates[0]


def pick_resume(job, resumes: list) -> object | None:
    """AI Resume Picker (deterministic): highest skill-overlap with the job wins."""
    if not resumes:
        return None
    job_skills = {s.lower() for s in (job.skills or [])}
    if not job_skills:
        return resumes[0]
    def overlap(r) -> float:
        r_skills = {s.lower() for s in (r.strong_skills or [])}
        base = len(job_skills & r_skills) / max(len(job_skills), 1)
        return base + (r.ats_score or 0) / 1000.0  # tiny tiebreak on ATS quality
    return max(resumes, key=overlap)


# ---------------------------------------------------------------- assembly

_CLOSINGS = [
    "Best regards", "Kind regards", "Warm regards", "Sincerely", "Best",
]


def portfolio_footer(user) -> str:
    """Auto Portfolio Card — links pulled from the profile, never hand-typed."""
    lines = [user.name or "", user.phone or ""]
    if user.github_url:    lines.append(f"GitHub: {user.github_url}")
    if user.portfolio_url: lines.append(f"Portfolio: {user.portfolio_url}")
    if user.linkedin_url:  lines.append(f"LinkedIn: {user.linkedin_url}")
    return "\n".join(l for l in lines if l)


def build_fallback_email(job, user, template, resume) -> tuple[str, str]:
    """Deterministic email when AI is unavailable: template + variables + humanized bits."""
    greeting = detect_recruiter(job.contact_email)["greeting"]
    subject = fill_variables(template.subject if template else "Application for {{role}} at {{company}}", user, job, resume)
    body_core = fill_variables(template.body if template else (
        "{{greeting}}\n\nI came across the {{role}} opening at {{company}} and it aligns closely with my "
        "experience in {{skills}}.\n\nPlease find my resume attached — I'd welcome the chance to discuss how I can contribute."
    ), user, job, resume)
    body_core = body_core.replace("{{greeting}}", greeting)
    if greeting.split()[0].lower() not in body_core[:60].lower():
        body_core = f"{greeting},\n\n{body_core}"
    closing = random.choice(_CLOSINGS)
    return subject, f"{body_core}\n\n{closing},\n{portfolio_footer(user)}"


# ---------------------------------------------------------------- the agent

async def prepare_package(job, user, template, resume) -> dict:
    """One AI request → complete application package (10 outputs)."""
    from app.services.ai_service import _get_client

    recruiter = detect_recruiter(job.contact_email)
    fallback_subject, fallback_body = build_fallback_email(job, user, template, resume)

    package = {
        "job_id": job.id,
        "to_email": job.contact_email,
        "subject": fallback_subject,
        "body": fallback_body,
        "intro": None,
        "alignment_summary": None,
        "reply_probability": None,
        "reply_reason": None,
        "interview_tips": [],
        "follow_up_draft": None,
        "cover_letter": None,
        "template_id": template.id if template else None,
        "template_name": template.name if template else None,
        "resume_id": resume.id if resume else None,
        "resume_name": resume.name if resume else None,
        "recruiter_kind": recruiter["kind"],
        "generated_by": "rules",
    }

    use_ai = (template.ai_personalization if template else True) and bool(settings.GROQ_API_KEY)
    if not use_ai:
        return package

    prompt = f"""You are an Application Preparation Agent. Craft a complete, unique job application package.

JOB: {job.title} at {job.company} ({job.location or 'N/A'}, {job.location_type})
Job skills: {', '.join(job.skills or [])}
Job summary: {(job.ai_summary or job.description or '')[:400]}
Match: {round(job.match_score or 0)}% | Matched: {', '.join((job.matched_skills or [])[:6])} | Missing: {', '.join((job.missing_skills or [])[:4])}

CANDIDATE: {user.name}, {user.years_experience or 0} yrs exp, {user.current_role or 'developer'}
Skills: {', '.join((user.skills or [])[:12])}
Resume strong points: {', '.join((resume.strong_skills or [])[:8]) if resume else 'not analyzed'}

RECIPIENT: {job.contact_email or 'unknown'} ({recruiter['kind']} — greet with "{recruiter['greeting']}")
BASE TEMPLATE STYLE (tone reference only, do NOT copy verbatim):
{fill_variables((template.body if template else '')[:500], user, job, resume)}

Write like a real human — vary sentence rhythm, no clichés ("I hope this finds you well"), no em-dash spam.
Reference something specific about the company/role. Mention 2-3 matched skills naturally. If a missing
skill is strategic, address it confidently (learning it / adjacent experience). 120-170 words for the body.
Do NOT include a signature block — it is appended automatically.

Return ONLY JSON:
{{
  "subject": "specific subject line (pick best style: role-first, skills-first, or name-first)",
  "body": "greeting + full email body, ends after the final sentence (no signature)",
  "intro": "3-line company-specific opening used in the body",
  "alignment_summary": "2 lines: why this candidate fits this exact role",
  "reply_probability": <0-100 int>,
  "reply_reason": "1 line: main factors driving that probability",
  "interview_tips": ["3 short role-specific prep tips"],
  "follow_up_draft": "polite 60-word follow-up email for 5 days later",
  "cover_letter": "3-paragraph cover letter"
}}"""

    try:
        resp = await _get_client().chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,          # humanization: every mail comes out different
            response_format={"type": "json_object"},
            max_tokens=1400,
        )
        ai = json.loads(resp.choices[0].message.content)
        body = (ai.get("body") or "").strip()
        if body:
            package["body"] = f"{body}\n\n{random.choice(_CLOSINGS)},\n{portfolio_footer(user)}"
        package["subject"] = (ai.get("subject") or fallback_subject).strip()
        for k in ("intro", "alignment_summary", "reply_reason", "follow_up_draft", "cover_letter"):
            package[k] = ai.get(k)
        package["interview_tips"] = ai.get("interview_tips") or []
        rp = ai.get("reply_probability")
        package["reply_probability"] = max(0, min(100, int(rp))) if isinstance(rp, (int, float)) else None
        package["generated_by"] = "ai"
    except Exception as e:
        print(f"[ApplyAgent] AI package failed, using fallback: {e}")

    return package
