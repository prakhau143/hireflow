import json
import re
from groq import AsyncGroq
from app.config import settings

_client: AsyncGroq | None = None


def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        if not settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY not configured in environment")
        _client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        print("✓ Groq client initialized")
    return _client


# ─────────────────────────────────────────────────────────────────────────────
# RULE ENGINE — Step 1: Noise removal
# Handles WhatsApp exports, LinkedIn copy-paste, Telegram groups, manual text.
# ─────────────────────────────────────────────────────────────────────────────

_NOISE_LINE_PATTERNS = [
    # WhatsApp date headers
    r"^(Today|Yesterday)$",
    r"^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$",
    r"^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}$",
    r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s*(\d{1,2})?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\w*\s*(\d{4})?$",
    # Standalone timestamps
    r"^\d{1,2}:\d{2}\s*(AM|PM|am|pm)?$",
    # Unread / message counters
    r"^\d+\s+unread\s+messages?$",
    r"^\d+\s+new\s+messages?$",
    r"^\d+\s+messages?$",
    # WhatsApp system notices
    r"^.*(end-to-end encrypted|Messages and calls are encrypted).*$",
    r"^.*(Tap to turn (them|notifications?) on).*$",
    r"^.*(Message notifications? are off).*$",
    r"^(This message was deleted|You deleted this message|Message deleted)$",
    # Labels
    r"^Read\s*(M|m)ore$",
    r"^(Archived|Muted|Pinned|Starred)$",
    # WhatsApp group events
    r"^.{1,80}\s+(added|removed)\s+.{1,80}$",
    r"^.{1,80}\s+joined using this group.*$",
    r"^.{1,80}\s+left$",
    r"^.{1,80}\s+changed the (group|subject|icon|name|description|settings).*$",
    r"^(You were added|You joined using|You joined the group).*$",
    r"^.{1,80}\s+created group.*$",
    # WhatsApp/Platform labels
    r"^(WhatsApp Business|QR Code|WhatsApp Web)$",
    r"^(CFBR|Commented For Better Reach)$",
    r"^\d+\s+(likes?|comments?|reposts?|reactions?)$",
    r"^(Suggested|Sponsored|Promoted|Advertisement)\s+post$",
    # LinkedIn reaction noise
    r"^(Like|Comment|Repost|Send)$",
    r"^\d+\s+(connections?|followers?)\s*$",
]

_NOISE_RE = re.compile(
    "|".join(f"(?:{p})" for p in _NOISE_LINE_PATTERNS),
    re.IGNORECASE,
)

# ─────────────────────────────────────────────────────────────────────────────
# RULE ENGINE — Step 2: Job boundary detection
# Lines that match these patterns mark the START of a new job block.
# ─────────────────────────────────────────────────────────────────────────────

_BOUNDARY_RES = [re.compile(p, re.IGNORECASE) for p in [
    r"\bwe'?re\s+hiring\b",
    r"\bis\s+hiring\b",
    r"\bare\s+hiring\b",
    r"\bnow\s+hiring\b",
    r"\b(?:urgent|immediate)\s+hiring\b",
    r"\bhiring\s+(?:a\s+|an\s+|for\s+a?\s*)?(?:senior\s+|junior\s+|lead\s+)?(?:developer|engineer|designer|manager|analyst|intern|fresher|executive|lead|architect|consultant|specialist|tester|qa)\b",
    r"\bopen\s+position[s]?\b",
    r"\bjob\s+opening[s]?\b",
    r"\bjob\s+alert\b",
    r"\bjob\s+opportunit(?:y|ies)\b",
    r"\bjob\s+post(?:ing)?\b",
    r"\bvacancy\b|\bvacancies\b",
    r"\bapply\s+now\b",
    r"\binterested\s+candidates?\b",
    r"\bcareer\s+opportunit(?:y|ies)\b",
    r"\bposition\s+(?:is\s+)?open\b",
    r"\bpositions?\s+available\b",
    r"\blooking\s+for\s+(?:a\s+)?(?:\w+\s+)?(?:developer|engineer|designer|manager|analyst|intern|fresher|executive|lead|architect|consultant|specialist|tester|qa)\b",
    r"\bseeking\s+(?:a\s+)?(?:\w+\s+)?(?:developer|engineer|designer|manager|analyst|intern|fresher|executive|lead|architect|consultant|specialist|tester|qa)\b",
    r"\brequired\s*[:–\-]?\s*(?:\w+\s+)?(?:developer|engineer|designer|manager|analyst|intern|fresher|executive|lead|architect|consultant|specialist|tester|qa)\b",
    r"^\s*[Rr]ole\s*:\s*",
    r"^\s*[Pp]osition\s*:\s*",
    r"^\s*[Jj]ob\s+[Tt]itle\s*:\s*",
]]

# Job-specific email prefix → treat that line as a boundary too
_JOB_EMAIL_RE = re.compile(
    r"(?:career|hr|jobs?|talent|recruit|hiring|apply|work|cvs?|resumes?|placement)"
    r"[a-zA-Z0-9._+\-]*@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    re.IGNORECASE,
)
# Lines that are contact-detail rows — should NOT start a new boundary
_CONTACT_LABEL_RE = re.compile(
    r"^\s*(?:contact|apply|send|cv|resume|email|mail|reach|connect|share)\s*[:–\-]",
    re.IGNORECASE,
)


def _clean_noise(text: str) -> str:
    """Remove WhatsApp/LinkedIn/Telegram noise lines. Preserve job content."""
    lines = text.splitlines()
    out = []
    for line in lines:
        stripped = line.strip()
        if stripped and _NOISE_RE.fullmatch(stripped):
            out.append("")          # blank instead of delete — preserves block structure
        else:
            out.append(line)

    # Collapse 3+ consecutive blank lines → 1
    result, blanks = [], 0
    for ln in out:
        if not ln.strip():
            blanks += 1
            if blanks <= 1:
                result.append("")
        else:
            blanks = 0
            result.append(ln)
    return "\n".join(result).strip()


def _is_boundary(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    for pat in _BOUNDARY_RES:
        if pat.search(stripped):
            return True
    # Short line with a job-specific email → likely new post header
    # BUT exclude lines that are clearly contact-detail rows ("Contact: hr@...", "Apply: hr@...")
    if _JOB_EMAIL_RE.search(stripped) and len(stripped) < 120 and not _CONTACT_LABEL_RE.match(stripped):
        return True
    # Explicit separator lines (---, ===, ***)
    if re.match(r"^[-=*~]{3,}\s*$", stripped):
        return True
    return False


def _segment_blocks(text: str) -> list[str]:
    """Split cleaned text into individual job blocks by boundary detection."""
    lines = text.splitlines()
    blocks: list[list[str]] = []
    current: list[str] = []

    for line in lines:
        if _is_boundary(line) and current:
            chunk = "\n".join(current).strip()
            if len(chunk) > 25:
                blocks.append(chunk)
            current = [line]
        else:
            current.append(line)

    if current:
        chunk = "\n".join(current).strip()
        if len(chunk) > 25:
            blocks.append(chunk)

    # Fallback: no boundaries found → treat whole text as one block
    return blocks if blocks else ([text.strip()] if text.strip() else [])


def _detect_source(raw: str) -> str:
    lower = raw.lower()
    if any(k in lower for k in ("end-to-end encrypted", "message deleted", "whatsapp")):
        return "whatsapp"
    if any(k in lower for k in ("linkedin.com", "· linkedin", "· 1st", "· 2nd")):
        return "linkedin"
    if any(k in lower for k in ("t.me/", "telegram")):
        return "telegram"
    return "text"


def _parse_experience(exp: str | None) -> tuple[int, int]:
    if not exp:
        return 0, 5
    low = exp.lower()
    if any(k in low for k in ("fresher", "intern", "0 year", "no exp")):
        return 0, 0
    nums = list(map(int, re.findall(r"\d+", exp)))
    if len(nums) >= 2:
        return nums[0], nums[1]
    if len(nums) == 1:
        n = nums[0]
        return max(0, n - 1), n + 2
    return 0, 5


# ─────────────────────────────────────────────────────────────────────────────
# AI STEP — Single-block structured extraction
# AI only does JSON conversion; detection/splitting is done by the Rule Engine.
# ─────────────────────────────────────────────────────────────────────────────

async def _extract_job_ai(block: str, user_skills: list[str]) -> dict | None:
    skills_ctx = ", ".join(user_skills) if user_skills else "not provided"
    prompt = f"""Extract structured job data from the job post below.

Candidate skills (for match scoring): {skills_ctx}

JOB TEXT:
---
{block[:3000]}
---

Return a JSON object with these exact fields (null for anything not found):
{{
  "role": "exact job title",
  "company": "company name or null",
  "experience": "e.g. '2-4 years' | 'Fresher' | 'Internship' | null",
  "location": "city or null",
  "work_mode": "Remote | Hybrid | Onsite | null",
  "skills": ["skill1", "skill2"],
  "salary": "e.g. '8-12 LPA' or null",
  "email": "recruiter email or null",
  "phone": "recruiter phone or null",
  "apply_link": "URL or null",
  "description": "1-2 sentence role summary",
  "requirements": ["req1", "req2"],
  "employment_type": "Full Time | Internship | Contract | Part Time | null",
  "match_score": <0-100 integer based on candidate vs job skills>,
  "matched_skills": ["matching skill"],
  "missing_skills": ["important missing skill"],
  "confidence_score": <0-100 extraction confidence>,
  "is_valid": <true if this is a real job post, false otherwise>
}}

Return ONLY the JSON object."""

    try:
        resp = await _get_client().chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.05,
            response_format={"type": "json_object"},
            max_tokens=1000,
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        print(f"  [AI] extraction error: {type(e).__name__}: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# MAIN PIPELINE
# ─────────────────────────────────────────────────────────────────────────────

async def parse_linkedin_posts(raw_text: str, user_skills: list[str]) -> list[dict]:
    """
    Hybrid Rule-Based + AI pipeline:
      1. Detect source (WhatsApp / LinkedIn / Telegram / text)
      2. Remove noise lines (Rule Engine)
      3. Segment into job blocks (boundary detection)
      4. Extract each block via AI (JSON conversion only)
      5. Validate and tag results

    Returns all blocks (valid + invalid) so the API can surface stats.
    """
    print(f"\n[Pipeline] Input: {len(raw_text)} chars")

    source = _detect_source(raw_text)
    print(f"[Pipeline] Source: {source}")

    cleaned = _clean_noise(raw_text)
    print(f"[Pipeline] After noise removal: {len(cleaned)} chars")

    blocks = _segment_blocks(cleaned)
    print(f"[Pipeline] Blocks segmented: {len(blocks)}")

    results: list[dict] = []

    for i, block in enumerate(blocks):
        print(f"[Pipeline] Block {i + 1}/{len(blocks)} ({len(block)} chars)")
        job = await _extract_job_ai(block, user_skills)

        if job is None:
            results.append({
                "is_valid": False,
                "validation_reason": "AI extraction failed",
                "role": None,
                "_source": source,
                "_raw": block[:300],
            })
            continue

        role = (job.get("role") or "").strip()
        if not role or role.lower() in ("null", "n/a", "unknown", ""):
            job["is_valid"] = False
            job["validation_reason"] = "No role found"
        elif not job.get("is_valid", True):
            job["is_valid"] = False
            job["validation_reason"] = "Not a job post"
        else:
            job["is_valid"] = True
            job["validation_reason"] = None

        job["_source"] = source
        job["_raw"] = block[:300]
        results.append(job)

    valid = sum(1 for j in results if j.get("is_valid"))
    print(f"[Pipeline] Done — {valid}/{len(results)} valid")
    return results


async def analyze_resume(resume_text: str, user_skills: list[str]) -> dict:
    """Analyze a resume and return comprehensive ATS insights."""
    _get_client()

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

    response = await _get_client().chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        response_format={"type": "json_object"},
        max_tokens=2000,
    )

    return json.loads(response.choices[0].message.content)


async def generate_email(job_title: str, company: str, resume_text: str, template_body: str = "") -> dict:
    _get_client()

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

    response = await _get_client().chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        response_format={"type": "json_object"},
        max_tokens=1500,
    )

    return json.loads(response.choices[0].message.content)


async def summarize_job(description: str) -> dict:
    _get_client()
    prompt = f"""Summarize this job description in 2-3 sentences and extract key requirements.

JOB DESCRIPTION:
{description[:4000]}

Return JSON:
{{
  "summary": "2-3 sentence summary",
  "key_requirements": ["requirement 1", "requirement 2"],
  "ideal_candidate": "one sentence about ideal candidate"
}}"""
    response = await _get_client().chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        response_format={"type": "json_object"},
        max_tokens=500,
    )
    return json.loads(response.choices[0].message.content)


async def improve_resume(resume_text: str, target_job: str = "") -> dict:
    _get_client()
    prompt = f"""Improve this resume for better ATS scores and readability.

RESUME:
{resume_text[:4000]}

TARGET JOB: {target_job or 'General software engineering roles'}

Return JSON:
{{
  "improved_sections": {{"Experience": "improved text", "Skills": "improved text"}},
  "keywords_to_add": ["keyword1", "keyword2"],
  "formatting_tips": ["tip1", "tip2"],
  "overall_score": 75
}}"""
    response = await _get_client().chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        response_format={"type": "json_object"},
        max_tokens=1000,
    )
    return json.loads(response.choices[0].message.content)


async def generate_learning_path(missing_skills: list[str]) -> list[dict]:
    _get_client()

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

    response = await _get_client().chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        response_format={"type": "json_object"},
        max_tokens=1500,
    )

    result = json.loads(response.choices[0].message.content)
    return result.get("path", [])


async def generate_job_recommendations(resume_text: str, user_skills: list[str]) -> list[dict]:
    """Generate AI-powered job recommendations based on resume."""
    _get_client()
    
    prompt = f"""You are an expert career advisor and job matching AI.

Analyze this resume and recommend the top 6 job roles that would be the best fit.

RESUME TEXT:
{resume_text[:5000]}

USER'S STATED SKILLS: {', '.join(user_skills) if user_skills else 'None the'}

For each recommended job, provide:
- title: exact job title
- match_score: 0-100 score of how well this role matches the resume
- matched_skills: skills from resume that align with this role
- missing_skills: important skills for this role that are missing from resume
- reason: one sentence explaining why this role is a good fit
- priority: "high" | "medium" | "low"

Return JSON:
{{
  "recommendations": [
    {{
      "title": "Senior Python Backend Developer",
      "match_score": 96,
      "matched_skills": ["Python", "FastAPI", "Docker", "PostgreSQL"],
      "missing_skills": ["Redis", "Kubernetes"],
      "reason": "Strong backend experience with Python and modern frameworks",
      "priority": "high"
    }}
  ]
}}

Focus on roles that are realistic matches based on experience level and skills."""

    response = await _get_client().chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        response_format={"type": "json_object"},
        max_tokens=2000,
    )
    
    result = json.loads(response.choices[0].message.content)
    return result.get("recommendations", [])


async def analyze_resume_for_job(resume_text: str, job_title: str, user_skills: list[str]) -> dict:
    """Analyze resume specifically for a target job role."""
    _get_client()
    
    prompt = f"""You are an expert ATS analyzer and career coach.

Analyze this resume specifically for the target job role.

RESUME TEXT:
{resume_text[:5000]}

TARGET JOB: {job_title}

USER'S STATED SKILLS: {', '.join(user_skills) if user_skills else 'None provided'}

Provide job-specific analysis with these scores (0-100):
- ats_score: Overall ATS score for this specific job
- keyword_score: How well keywords match this job
- project_score: Project relevance to this job
- formatting_score: Resume formatting quality
- readability_score: How easy to read
- impact_score: Quantified achievements
- grammar_score: Grammar and language quality
- overall_health: Weighted average of all scores

Also provide:
- matched_skills: Skills from resume that match this job
- missing_skills: Important skills for this job that are missing
- project_relevance: Which projects are relevant and which to add
- experience_match: How well experience matches requirements
- education_match: Education fit for this role
- summary_quality: Resume summary quality for this job
- achievements_quality: Achievement quality for this role
- recruiter_readability: How quickly a recruiter can scan
- interview_readiness: How prepared for interviews
- suggestions: Prioritized suggestions (high/medium/low priority)

Return JSON:
{{
  "ats_score": 92,
  "keyword_score": 88,
  "project_score": 84,
  "formatting_score": 96,
  "readability_score": 90,
  "impact_score": 75,
  "grammar_score": 94,
  "overall_health": 88,
  "matched_skills": ["Python", "FastAPI", "Docker"],
  "missing_skills": ["Redis", "Kubernetes"],
  "project_relevance": {{
    "relevant": ["E-commerce API", "Resume Parser"],
    "suggested": ["Real-time Chat App", "Microservices Architecture"]
  }},
  "experience_match": "Strong match with 3+ years backend experience",
  "education_match": "Good fit - Computer Science degree",
  "summary_quality": "Strong - highlights key backend technologies",
  "achievements_quality": "Needs improvement - only 2 quantified achievements",
  "recruiter_readability": "Good - clear structure and formatting",
  "interview_readiness": "High - strong technical foundation",
  "suggestions": [
    {{"priority": "high", "text": "Add Redis caching project"}},
    {{"priority": "medium", "text": "Improve summary with specific achievements"}},
    {{"priority": "low", "text": "Add GitHub links to all projects"}}
  ]
}}"""

    response = await _get_client().chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        response_format={"type": "json_object"},
        max_tokens=2500,
    )
    
    return json.loads(response.choices[0].message.content)
