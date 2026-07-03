import json
from groq import AsyncGroq
from app.config import settings

client = AsyncGroq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY else None


def _require_client():
    if not client:
        raise RuntimeError("GROQ_API_KEY not configured")


async def parse_linkedin_posts(text: str, user_skills: list[str]) -> list[dict]:
    """Parse one or more LinkedIn job posts and return structured JSON array."""
    _require_client()

    prompt = f"""You are an expert at parsing LinkedIn job posts.

Parse the following text and extract ALL job postings found. The text may contain one or multiple job posts.

User skills for context: {', '.join(user_skills) if user_skills else 'Not specified'}

For EACH job found, extract:
- title: exact job title
- company: company name
- hiring_manager: name of person who posted (if found)
- location: city/country
- location_type: "remote" | "hybrid" | "onsite"
- experience_min: minimum years required (integer, 0 if fresher)
- experience_max: maximum years required (integer)
- skills: array of required technical skills
- description: 2-3 sentence summary of the role
- contact_email: email address if found (null if not)
- contact_phone: phone number if found (null if not)
- match_score: 0-100 score based on user skills vs required skills
- matched_skills: skills from user's list that match job requirements
- missing_skills: important skills required but user doesn't have
- ai_summary: one sentence elevator pitch of why this role is interesting
- ai_analysis: one sentence about how well the user matches
- smart_tags: array of applicable tags from ["Remote", "Hybrid", "Onsite", "Urgent Hiring", "Startup", "MNC", "Internship", "Full Time", "Contract", "Fresher"]
- is_duplicate: false
- freshness_score: days since posted (0 if unknown)

TEXT TO PARSE:
---
{text[:8000]}
---

Return ONLY a valid JSON object with key "jobs" containing an array. Example:
{{"jobs": [{{"title": "Senior Python Developer", "company": "Acme Inc", ...}}]}}

If no valid job posts are found, return {{"jobs": []}}."""

    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        response_format={"type": "json_object"},
        max_tokens=4000,
    )

    result = json.loads(response.choices[0].message.content)
    return result.get("jobs", [])


async def analyze_resume(resume_text: str, user_skills: list[str]) -> dict:
    """Analyze a resume and return comprehensive ATS insights."""
    _require_client()

    prompt = f"""You are an expert ATS (Applicant Tracking System) analyzer and career coach.

Analyze this resume and provide comprehensive feedback.

RESUME TEXT:
{resume_text[:5000]}

USER'S STATED SKILLS: {', '.join(user_skills) if user_skills else 'None provided'}

Return a JSON object with these exact keys:
{{
  "ats_score": <integer 0-100>,
  "strong_skills": ["skill1", "skill2"],
  "missing_keywords": ["keyword1", "keyword2"],
  "weak_sections": ["section1"],
  "missing_projects": [
    {{"project": "Project name", "description": "Why this would help", "skills_covered": ["Docker", "Redis"]}}
  ],
  "missing_certifications": ["AWS Solutions Architect", "Google Cloud Professional"],
  "skill_gaps": [
    {{"skill": "Kubernetes", "importance": "high", "reason": "Most cloud deployments require K8s"}}
  ],
  "suggestions": [
    "Add quantifiable achievements (e.g., 'Reduced API response time by 40%')",
    "Include GitHub links to your projects"
  ]
}}

Focus on:
1. Technical skills that are in demand but missing
2. Project suggestions that would fill skill gaps
3. Keywords that ATS systems look for
4. Sections that need improvement"""

    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        response_format={"type": "json_object"},
        max_tokens=2000,
    )

    return json.loads(response.choices[0].message.content)


async def generate_email(job_title: str, company: str, resume_text: str, template_body: str = "") -> dict:
    _require_client()

    prompt = f"""Generate a personalized job application email.

JOB: {job_title} at {company}
RESUME HIGHLIGHTS: {resume_text[:1500]}
STYLE: {template_body[:500] if template_body else "Professional, concise, enthusiastic"}

Return JSON:
{{
  "subject": "email subject line",
  "body": "full professional email body",
  "highlights": ["key strength 1", "key strength 2", "key strength 3"]
}}"""

    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        response_format={"type": "json_object"},
        max_tokens=1500,
    )

    return json.loads(response.choices[0].message.content)


async def generate_learning_path(missing_skills: list[str]) -> list[dict]:
    _require_client()

    prompt = f"""Create a practical learning roadmap for these skills: {', '.join(missing_skills)}

Return JSON:
{{
  "path": [
    {{
      "skill": "skill name",
      "resource": "best free/paid resource",
      "duration": "estimated time",
      "project_idea": "hands-on project to build"
    }}
  ]
}}"""

    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        response_format={"type": "json_object"},
        max_tokens=1500,
    )

    result = json.loads(response.choices[0].message.content)
    return result.get("path", [])
