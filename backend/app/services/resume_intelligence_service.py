"""Resume Intelligence Engine — deterministic post-processing that sits on top of
the AI extraction: experience-duration arithmetic (no AI, exact), skill-taxonomy
normalization (shared with the job pipeline so resume/job skills always match),
resume health reasoning, and resume-vs-profile gap suggestions."""
import re
from datetime import datetime

SECTION_KEYS = [
    ("keyword_density", "Keyword Density"),
    ("experience_quality", "Experience Quality"),
    ("achievement_score", "Achievements"),
    ("project_score", "Projects"),
    ("certification_score", "Certifications"),
    ("formatting", "Formatting"),
    ("readability", "Readability"),
]

SKILL_CATEGORIES = ["Programming", "Framework", "Cloud", "AI/ML", "Tool", "Soft Skill"]

_MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
_PRESENT_WORDS = {"present", "current", "currently", "now", "ongoing", "till date", "till now", "date"}


def _parse_month_year(s: str | None) -> tuple[int, int] | None:
    """Loose date parser: 'Feb 2025', 'February 2025', '2022', 'Present' -> (year, month)."""
    if not s:
        return None
    low = s.strip().lower()
    if low in _PRESENT_WORDS:
        now = datetime.now()
        return (now.year, now.month)
    m = re.search(r"([a-z]{3,9})\.?\s+(\d{4})", low)
    if m and m.group(1)[:3] in _MONTH_MAP:
        return (int(m.group(2)), _MONTH_MAP[m.group(1)[:3]])
    m2 = re.search(r"\b(\d{4})\b", low)
    if m2:
        return (int(m2.group(1)), 1)
    return None


def compute_duration(start: str | None, end: str | None) -> str | None:
    """'Feb 2025' -> 'Present' becomes '1 Year 5 Months' — pure arithmetic, never AI-estimated."""
    sp = _parse_month_year(start)
    if not sp:
        return None
    ep = _parse_month_year(end) or _parse_month_year("present")
    total_months = (ep[0] - sp[0]) * 12 + (ep[1] - sp[1])
    if total_months < 0:
        return None
    years, months = divmod(total_months, 12)
    parts = []
    if years:
        parts.append(f"{years} Year{'s' if years != 1 else ''}")
    if months or not years:
        parts.append(f"{months} Month{'s' if months != 1 else ''}")
    return " ".join(parts)


def _duration_months(duration: str | None) -> int:
    if not duration:
        return 0
    y = re.search(r"(\d+)\s+Year", duration)
    m = re.search(r"(\d+)\s+Month", duration)
    return (int(y.group(1)) if y else 0) * 12 + (int(m.group(1)) if m else 0)


def enrich_experience_entries(entries: list | None) -> tuple[list, str | None]:
    """Compute a duration for every entry (deterministic) + total career length."""
    if not entries:
        return [], None
    out = []
    total_months = 0
    for e in entries:
        if not isinstance(e, dict):
            continue
        duration = compute_duration(e.get("start"), e.get("end") if not e.get("current") else "present")
        row = {**e, "duration": duration}
        out.append(row)
        total_months += _duration_months(duration)
    years, months = divmod(total_months, 12)
    total = None
    if total_months > 0:
        parts = []
        if years: parts.append(f"{years} Year{'s' if years != 1 else ''}")
        if months or not years: parts.append(f"{months} Month{'s' if months != 1 else ''}")
        total = " ".join(parts)
    return out, total


_GITHUB_RE = re.compile(r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_\-]+/?", re.IGNORECASE)
_LINKEDIN_RE = re.compile(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9_\-]+/?", re.IGNORECASE)
_URL_RE = re.compile(r"https?://[^\s,;)]+", re.IGNORECASE)


def detect_links(raw_text: str) -> tuple[str | None, str | None, str | None]:
    """Regex safety net for GitHub/LinkedIn/portfolio links the AI might miss or mis-format."""
    gh = _GITHUB_RE.search(raw_text or "")
    github = gh.group(0) if gh else None
    li = _LINKEDIN_RE.search(raw_text or "")
    linkedin = li.group(0) if li else None
    portfolio = None
    for url in _URL_RE.findall(raw_text or ""):
        low = url.lower()
        if "github.com" in low or "linkedin.com" in low or "gmail.com" in low:
            continue
        portfolio = url.rstrip(".,;)")
        break
    return github, linkedin, portfolio


def normalize_skill_intelligence(items: list | None) -> list[dict]:
    """Run each extracted skill's name through the shared job-skill taxonomy so
    resume skills ('ReactJS') and job skills ('React.js') always compare equal."""
    from app.services.taxonomy import canonical_skill
    out = []
    seen = set()
    for it in (items or []):
        if not isinstance(it, dict) or not it.get("skill"):
            continue
        canon = canonical_skill(it["skill"])
        if not canon or canon.lower() in seen:
            continue
        seen.add(canon.lower())
        category = it.get("category") if it.get("category") in SKILL_CATEGORIES else "Tool"
        out.append({
            "skill": canon,
            "category": category,
            "years": it.get("years"),
            "confidence": it.get("confidence"),
            "last_used": it.get("last_used"),
        })
    return out


def resume_health_reason(section_scores: dict | None) -> str:
    """Plain-language explanation of the ATS score — which sections are dragging it down."""
    if not section_scores:
        return "Run an analysis to see section-level health"
    weak = [label for key, label in SECTION_KEYS if (section_scores.get(key) if section_scores.get(key) is not None else 100) < 70]
    if not weak:
        return "Strong across all sections"
    return "Missing or weak: " + ", ".join(weak)


def profile_gap_suggestions(user, resume) -> list[dict]:
    """Resume-vs-profile diff — skills/links/projects/certs present in the resume
    but missing from the profile, as one-click-apply suggestions.

    Skills are capped separately from social/project/cert suggestions so a resume
    with a long skill list can't crowd out the (often higher-impact) other kinds."""
    suggestions = []

    resume_skills = [s.get("skill") for s in (resume.skill_intelligence or []) if isinstance(s, dict) and s.get("skill")]
    profile_skills = {s.lower() for s in (user.skills or [])}
    skill_suggestions = [
        {
            "type": "skill", "field": "skills",
            "label": f"Your resume mentions {skill} — add it to your profile skills?",
            "value": skill,
        }
        for skill in resume_skills if skill.lower() not in profile_skills
    ][:5]
    suggestions.extend(skill_suggestions)

    if resume.github_detected and not user.github_url:
        suggestions.append({
            "type": "social", "field": "github_url",
            "label": "GitHub link found in your resume — add it to your profile?",
            "value": resume.github_detected,
        })
    if resume.portfolio_detected and not user.portfolio_url:
        suggestions.append({
            "type": "social", "field": "portfolio_url",
            "label": "Portfolio link found in your resume — add it to your profile?",
            "value": resume.portfolio_detected,
        })

    existing_projects = {(p.get("name") or "").lower() for p in (user.projects or []) if isinstance(p, dict)}
    project_suggestions = [
        {
            "type": "project", "field": "projects",
            "label": f"Add project \"{p['name']}\" from your resume to your profile?",
            "value": {"name": p.get("name"), "description": p.get("description"),
                      "tech": p.get("tech") or [], "github": p.get("github"), "demo": p.get("live")},
        }
        for p in (resume.projects_extracted or [])
        if isinstance(p, dict) and p.get("name") and p["name"].lower() not in existing_projects
    ][:4]
    suggestions.extend(project_suggestions)

    existing_certs = {(c.get("name") or "").lower() for c in (user.certifications or []) if isinstance(c, dict)}
    cert_suggestions = [
        {
            "type": "certification", "field": "certifications",
            "label": f"Add certification \"{c['name']}\" from your resume to your profile?",
            "value": {"name": c.get("name"), "issuer": c.get("issuer")},
        }
        for c in (resume.certificates_extracted or [])
        if isinstance(c, dict) and c.get("name") and c["name"].lower() not in existing_certs
    ][:4]
    suggestions.extend(cert_suggestions)

    return suggestions
