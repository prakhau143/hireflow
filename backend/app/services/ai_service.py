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
    # LinkedIn reaction noise / engagement bait
    r"^(Like|Comment|Repost|Send|Share|Forward|React)[.,!\s❤️👍🔥]*$",
    r"^\d+\s+(connections?|followers?)\s*$",
    # ── Placement-office / Google Groups email dumps ─────────────────────────
    # Media & attachments
    r"^.*(image\d*\.(png|jpe?g|gif|webp)|IMG[_\-]?\d+\.(png|jpe?g)|<Media omitted>|photo omitted|video omitted|document omitted|\(file attached\)).*$",
    r"^\[?(image|photo|video|attachment|sticker|GIF)\]?$",
    # Link-only junk lines (YouTube, Google Groups, unsubscribe, tracking)
    r"^.*(youtube\.com|youtu\.be)\S*.*$",
    r"^.*groups\.google\.com\S*.*$",
    r"^.*(unsubscribe|to stop receiving|opt[ -]?out of these emails).*$",
    r"^.*view (this )?discussion (on the web)?.*$",
    r"^.*visit https?://groups\.google.*$",
    r"^.*you received this message because.*$",
    r"^.*received this (message|email).*$",
    # Email footers / signatures
    r"^(Thanks|Thank you|Thanks & Regards|Thanks and Regards|Regards|Warm Regards|Best Regards|Kind Regards|Best wishes|Sincerely|Cheers)[.,!\s]*$",
    r"^(With\s+)?(warm|best|kind)?\s*regards[.,!\s]*$",
    r"^--\s*$",
    r"^Sent from (my )?(iPhone|Android|Outlook|Gmail|Yahoo).*$",
    # Placement / training office footers
    r"^.*(Training\s*(&|and)?\s*Placement\s*(Office|Cell|Department)?|Placement\s+(Office|Cell|Officer|Coordinator|Department)|T\s*&\s*P\s*(Cell|Office)|TPO)\s*.*$",
    r"^(Department of .{1,60}|Office of .{1,60})$",
    # Blessings / motivational filler
    r"^.*(God bless( you| all)?|All the best|Good luck|Best of luck)[.!\s]*$",
    r"^(Good\s+(morning|afternoon|evening|day)|Greetings)(\s+(everyone|all|students|dear students))?[.,!\s]*$",
    r"^(Dear\s+(students?|all|everyone|candidates?))[.,!\s]*$",
    r"^.*(work hard|success is|never give up|believe in yourself|dream big).*$",
    # Forward / broadcast headers
    r"^(-+\s*)?Forwarded message(\s*-+)?$",
    r"^\*?(From|To|Cc|Subject|Date|Sent)\s*:.*@.*$",
    r"^(FYI|Please circulate|Kindly share|Share (with|to) (your )?(friends|juniors|batchmates).*)$",
    # Ads / promos / channel spam (Import Rules: reject list)
    r"^.*(advertisement|sponsored|promo code|use code|limited time offer).*$",
    r"^.*(join\s+(?:our\s+)?(?:telegram|whatsapp)\s+(?:channel|group|community)).*$",
    r"^.*(subscribe\s+(?:to\s+)?(?:our|the)\s+(?:channel|newsletter)|click here to join|dm to join).*$",
    r"^.*(enroll\s+now|limited\s+seats|certification\s+course|paid\s+(?:course|internship\s+program)|free\s+webinar|workshop\s+on).*$",
    r"^(#\S+)(\s+#\S+)*$",   # hashtag-only lines
    # Pure decorative filler: emoji clusters, pointer rows, star/arrow banners —
    # a line with zero letters and zero digits carries no job information.
    r"^[^A-Za-z0-9]{1,120}$",
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
    r"^\s*(?:🏢\s*)?[Cc]ompany\s*(?:[Nn]ame)?\s*:\s*\S",
    r"^\s*[Oo]rganization\s*:\s*\S",
    r"^\s*[Dd]esignation\s*:\s*\S",
    r"\bopening[s]?\s+for\b",
    r"\bwalk[\s\-]?in\s+(?:interview|drive)\b",
    r"\b(?:off|on)[\s\-]?campus\s+(?:drive|recruitment|hiring)\b",
    r"\brecruitment\s+drive\b",
    r"\binternship\s+(?:opportunity|opening|alert)\b",
    # Recruiter-writing-pattern intent words (Stage 2: Find Job Start)
    r"\b(?:we\s+)?need(?:ed)?\s*[:\-]?\s*(?:a\s+|an\s+)?(?:\w+\s+){0,2}(?:developer|engineer|designer|manager|analyst|intern|fresher|executive|lead|architect|consultant|specialist|tester|qa)\b",
    r"\bwanted\s*[:\-]?\s*(?:a\s+|an\s+)?(?:\w+\s+){0,2}(?:developer|engineer|designer|manager|analyst|intern|fresher|executive|lead|architect|consultant|specialist|tester|qa)\b",
    r"^\s*[Oo]pening\s*[:\-]",
    r"^\s*[Oo]pportunit(?:y|ies)\s*[:\-]",
    r"^\s*[Vv]acanc(?:y|ies)\s*[:\-]",
    # Numbered job lists: "1) Google — SDE Intern", "2. Zomato hiring backend dev"
    r"^\s*\d{1,2}[\).]\s+.{2,80}(hiring|developer|engineer|intern|analyst|designer|manager|executive|trainee|associate)",
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


# Strong boundaries = unmistakable new-post headers → always start a new block.
# Weak boundaries (labels like "Company:", "looking for...") only split when the
# current block already looks like a complete job — otherwise "We're Hiring" +
# "Company: X" + "Role: Y" lines of the SAME post would get torn apart.
_STRONG_BOUNDARY_RES = [re.compile(p, re.IGNORECASE) for p in [
    r"^\s*\d{1,2}[\).]\s+.{0,90}(hiring|opening|vacancy|developer|engineer|intern|analyst|designer|manager|executive|trainee|associate|position|role)",
    r"\bwe'?re\s+hiring\b",
    r"\bis\s+hiring\b",
    r"\bare\s+hiring\b",
    r"\bnow\s+hiring\b",
    r"\b(?:urgent(?:ly)?|immediate)\s+hiring\b",
    r"\bjob\s+alert\b",
    r"\bwalk[\s\-]?in\s+(?:interview|drive)\b",
    r"\b(?:off|on)[\s\-]?campus\s+(?:drive|recruitment|hiring)\b",
    r"\brecruitment\s+drive\b",
]]

_CONTACT_SIGNAL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}|https?://\S+",
    re.IGNORECASE,
)


def _boundary_kind(stripped: str) -> str | None:
    """Classify a line: 'strong' | 'weak' | None."""
    if not stripped:
        return None
    # Explicit separator lines (---, ===, ***)
    if re.match(r"^[-=*~_]{3,}\s*$", stripped):
        return "strong"
    for pat in _STRONG_BOUNDARY_RES:
        if pat.search(stripped):
            return "strong"
    for pat in _BOUNDARY_RES:
        if pat.search(stripped):
            return "weak"
    # Short line with a job-specific email → possible new post header
    # (but not contact-detail rows like "Apply: hr@...")
    if _JOB_EMAIL_RE.search(stripped) and len(stripped) < 120 and not _CONTACT_LABEL_RE.match(stripped):
        return "weak"
    return None


def _segment_blocks(text: str) -> list[str]:
    """Split cleaned text into job blocks using two-tier boundary detection."""
    lines = text.splitlines()
    blocks: list[list[str]] = []
    current: list[str] = []
    cur_words = 0
    cur_has_contact = False

    def _flush():
        chunk = "\n".join(current).strip()
        if len(chunk) > 25:
            blocks.append(chunk)

    for line in lines:
        stripped = line.strip()
        kind = _boundary_kind(stripped)
        split = False
        if kind and current:
            if kind == "strong":
                split = cur_words >= 8            # don't split off a bare header
            else:
                # weak boundary: only if current block already looks complete
                split = cur_words >= 40 or cur_has_contact
        if split:
            _flush()
            current = [line]
            cur_words = len(stripped.split())
            cur_has_contact = bool(_CONTACT_SIGNAL_RE.search(stripped))
        else:
            current.append(line)
            cur_words += len(stripped.split())
            if stripped and _CONTACT_SIGNAL_RE.search(stripped):
                cur_has_contact = True

    if current:
        _flush()

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
    prompt = f"""You are an enterprise ATS extraction engine. Extract structured job data from the text below.

Candidate skills for match scoring: {skills_ctx}

JOB TEXT:
---
{block[:3000]}
---

Return ONLY a JSON object. Be aggressive about extracting contact info (email / phone / apply URL).
Fields (use null if genuinely not present):
{{
  "role": "exact job title — e.g. 'Senior Python Developer'",
  "company": "company/org name or null",
  "experience": "e.g. '2-4 years' | 'Fresher' | 'Internship' | null",
  "location": "city/state or null  (NOT 'Remote' — put that in work_mode)",
  "work_mode": "Remote | Hybrid | Onsite | null",
  "skills": ["skill1", "skill2"],
  "salary": "e.g. '8-12 LPA' or null",
  "email": "any recruiter/HR/apply email found in text, or null",
  "phone": "any recruiter/HR phone number found in text, or null",
  "apply_link": "application URL (careers page, Google Form, lnkd.in, forms.gle...) or null",
  "recruiter": "recruiter/HR contact person name or null",
  "notice_period": "e.g. 'Immediate' | '30 days' | null",
  "description": "1-2 sentence role summary",
  "responsibilities": ["key responsibility"],
  "requirements": ["key requirement"],
  "employment_type": "Full Time | Internship | Contract | Part Time | null",
  "confidence_score": <0-100 int — your confidence this is a real, complete job post>,
  "is_valid": <true if this is a real actionable job post, false if noise/incomplete>
}}"""

    import asyncio
    for attempt in range(3):
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
            name = type(e).__name__
            # Per-minute rate limits recover fast — back off and retry
            if "RateLimit" in name and attempt < 2 and "per day" not in str(e).lower() and "tpd" not in str(e).lower():
                await asyncio.sleep(20 * (attempt + 1))
                continue
            print(f"  [AI] extraction error: {name}: {e}")
            return None
    return None


# ─────────────────────────────────────────────────────────────────────────────
# CONFIDENCE-SCORED VALIDATION
# A missing field costs points — it never disqualifies a job by itself.
# Only two things hard-reject: no role at all, or pure noise (too short).
# Weights: Company 20 · Role 20 · Experience 15 · Location 10
#          Apply/Contact 20 (email OR phone OR apply link) · Skills 10 · Salary 5
# ─────────────────────────────────────────────────────────────────────────────

_ANY_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_PHONE_RE     = re.compile(r"(?:\+?\d[\d\s\-().]{7,}\d)")
_URL_RE       = re.compile(r"https?://\S+", re.IGNORECASE)

_GENERIC_EMAIL_DOMAINS = {
    "gmail", "yahoo", "outlook", "hotmail", "rediffmail", "rediff", "protonmail",
    "icloud", "aol", "live", "msn", "zoho", "ymail", "googlemail",
}
_BLANK_VALUES = {"null", "n/a", "unknown", "none", "not mentioned", "not specified", ""}

REJECT_FLOOR = 40    # below this → rejected regardless of which fields are missing
VALID_CEILING = 90   # at/above this → valid; between floor and ceiling → needs_review


def _company_from_email(email: str | None) -> str | None:
    """Salvage a company name from a corporate email domain: hr@zomato.com → 'Zomato'."""
    if not email or "@" not in email:
        return None
    domain = email.split("@", 1)[1].lower()
    name = domain.split(".")[0]
    if name in _GENERIC_EMAIL_DOMAINS or len(name) < 3:
        return None
    return name.replace("-", " ").replace("_", " ").title()


def _find_apply_url(raw_block: str) -> str | None:
    """First non-noise URL in the block (noise cleaner already dropped youtube/groups lines)."""
    for url in _URL_RE.findall(raw_block):
        low = url.lower()
        if any(bad in low for bad in ("youtube.com", "youtu.be", "groups.google", "unsubscribe", "chat.whatsapp.com")):
            continue
        return url.rstrip(".,;)|]")
    return None


def _validate_enterprise(job: dict, raw_block: str) -> tuple[bool, str, str]:
    """
    Returns (is_valid, status, reason). status: 'valid' | 'needs_review' | 'rejected'.

    Missing company, missing email, missing salary — none of these reject a job
    on their own; they just lower the confidence score. A recruiter who forgets
    to name their company is still a real job post and belongs in Needs Review,
    not the trash.
    """
    role   = (job.get("role") or "").strip()
    email  = job.get("email") or ""
    phone  = job.get("phone") or ""
    loc    = (job.get("location") or "").strip()
    mode   = (job.get("work_mode") or "").lower()
    skills = job.get("skills") or []
    exp    = job.get("experience")
    comp   = (job.get("company") or "").strip()
    salary = job.get("salary")

    # ── Absolute floor #1 — pure noise / not enough text to be a real post ───
    word_count = len(raw_block.split())
    if word_count < 12:
        return False, "rejected", "Too short to be a real job post (< 12 words)"

    # ── Absolute floor #2 — no role means there's nothing to import ─────────
    if not role or role.lower() in _BLANK_VALUES:
        return False, "rejected", "No job title identified"

    # Company: try direct extraction, then salvage from an email domain.
    # A miss here only costs points below — it is never a reject reason.
    if comp.lower() in _BLANK_VALUES:
        salvage = _company_from_email(email) or _company_from_email(
            (_ANY_EMAIL_RE.findall(raw_block) or [None])[0]
        )
        comp = salvage or ""
        job["company"] = comp or None

    # Scan the raw block for contact/apply info the AI might have missed
    raw_emails = _ANY_EMAIL_RE.findall(raw_block)
    raw_phones = _PHONE_RE.findall(raw_block)
    raw_url    = _find_apply_url(raw_block)
    if not email and raw_emails:
        job["email"] = email = raw_emails[0]
    if not phone and raw_phones:
        job["phone"] = phone = raw_phones[0]
    if not job.get("apply_link") and raw_url:
        job["apply_link"] = raw_url
    apply_link = job.get("apply_link") or ""

    job["application_type"] = _classify_application_type(job, raw_block)

    has_location = bool(loc) or "remote" in mode
    has_apply    = bool(email) or bool(apply_link) or bool(phone)

    # ── Weighted confidence score (100 pts total) ────────────────────────────
    score = 0
    if comp:          score += 20
    score += 20       # role — always true past the floor #2 check above
    if exp:           score += 15
    if has_location:  score += 10
    if has_apply:     score += 20
    if skills:        score += 10
    if salary:        score += 5

    ai_conf = int(job.get("confidence_score") or 0)
    blended = round(score * 0.75 + ai_conf * 0.25)   # deterministic score dominates
    job["confidence_score"] = blended

    missing = []
    if not comp:          missing.append("company")
    if not exp:           missing.append("experience")
    if not has_location:  missing.append("location")
    if not has_apply:     missing.append("contact/apply method")
    if not skills:        missing.append("skills")
    if not salary:        missing.append("salary")

    if blended < REJECT_FLOOR:
        return False, "rejected", f"Confidence too low ({blended}%) — missing: {', '.join(missing)}"

    if blended >= VALID_CEILING:
        return True, "valid", None

    reason = f"Confidence {blended}%" + (f" — missing: {', '.join(missing)}" if missing else "")
    return True, "needs_review", reason


# ─────────────────────────────────────────────────────────────────────────────
# MAIN PIPELINE
# ─────────────────────────────────────────────────────────────────────────────

def _dedupe_key(job: dict) -> str:
    """Fingerprint: title + company + location + email — not title alone."""
    parts = [
        (job.get("role") or "").lower().strip(),
        (job.get("company") or "").lower().strip(),
        (job.get("location") or "").lower().strip(),
        (job.get("email") or "").lower().strip(),
    ]
    return re.sub(r"[^a-z0-9 @]", "", " | ".join(parts))


_GFORM_RE = re.compile(
    r"forms\.gle|docs\.google\.com/forms|google\s+forms?|registration\s+form|fill\s+(?:the\s+|this\s+)?form",
    re.IGNORECASE,
)


def _classify_application_type(job: dict, raw_block: str) -> str:
    """email > google_form > linkedin > portal > phone > none (drives Apply All routing)."""
    link = (job.get("apply_link") or "").lower()
    if job.get("email"):
        return "email"
    if _GFORM_RE.search(link) or _GFORM_RE.search(raw_block):
        return "google_form"
    if "linkedin.com" in link:
        return "linkedin"
    if link:
        return "portal"
    if job.get("phone"):
        return "phone"
    return "none"


def _normalize_job(job: dict, user, resume) -> None:
    """Phases 6/8/9/10 + matching engine: taxonomies, canonical location, 100-pt score."""
    from app.services.taxonomy import canonical_skills, canonical_location, role_family
    from app.services.matching_service import compute_match

    job["skills"] = canonical_skills(job.get("skills"))
    if job.get("location"):
        job["location"] = canonical_location(job["location"])
        if job["location"] == "Remote":
            job["location"], job["work_mode"] = "", "Remote"
    job["role_family"] = role_family(job.get("role"))

    exp_min, exp_max = _parse_experience(job.get("experience"))
    job["experience_min"], job["experience_max"] = exp_min, exp_max

    match = compute_match(job, user, resume)
    job["match_score"]       = match["score"]
    job["match_tier"]        = match["tier"]
    job["is_recommended"]    = match["recommended"]
    job["experience_badge"]  = match["experience_badge"]
    job["match_breakdown"]   = match["breakdown"]
    job["matched_skills"]    = match["matched_skills"]
    job["missing_skills"]    = match["missing_skills"]
    job["score_suggestions"] = match["suggestions"]


async def parse_linkedin_posts(raw_text: str, user, resume=None) -> tuple[list[dict], dict]:
    """
    Enterprise Hybrid Rule-Based + AI pipeline.

    Paste Text → Noise Cleaner → Block Splitter → AI Extraction → Validation
    → Duplicate Checker → Skill/Role/Location Standardization → 100-pt Matching.

    `user` is the User ORM object (skills, experience, locations, roles used for
    matching); `resume` is the user's latest Resume row or None.
    Returns (results, pipeline_stats).
    """
    from difflib import SequenceMatcher

    print(f"\n[Pipeline] Input: {len(raw_text)} chars")

    user_skills = list(user.skills or [])
    raw_lines   = raw_text.splitlines()
    total_lines = len(raw_lines)

    source  = _detect_source(raw_text)
    cleaned = _clean_noise(raw_text)

    cleaned_lines = cleaned.splitlines()
    noise_removed = total_lines - sum(1 for l in cleaned_lines if l.strip())

    blocks = _segment_blocks(cleaned)
    print(f"[Pipeline] Source={source} | lines={total_lines} | noise≈{noise_removed} | blocks={len(blocks)}")

    results:       list[dict] = []
    validated_cnt  = 0
    rejected_cnt   = 0
    needs_review   = 0
    duplicate_cnt  = 0
    seen_keys:     list[tuple[str, str]] = []   # (dedupe_key, role label)

    for i, block in enumerate(blocks):
        print(f"[Pipeline] Block {i + 1}/{len(blocks)} ({len(block.split())} words)")
        job = await _extract_job_ai(block, user_skills)

        if job is None:
            results.append({
                "is_valid": False,
                "review_status": "rejected",
                "validation_reason": "AI extraction failed",
                "role": None, "skills": [], "matched_skills": [],
                "missing_skills": [], "match_score": 0,
                "confidence_score": 0,
                "_source": source, "_raw": block[:400],
            })
            rejected_cnt += 1
            continue

        # Confidence-scored validation — missing fields cost points, they don't reject
        is_valid, status, reason = _validate_enterprise(job, block)

        # Fuzzy duplicate detection within this import (≥90% similar fingerprint)
        if is_valid:
            key = _dedupe_key(job)
            dup_of = None
            for prev_key, prev_label in seen_keys:
                if SequenceMatcher(None, key, prev_key).ratio() >= 0.9:
                    dup_of = prev_label
                    break
            if dup_of:
                is_valid, status = False, "rejected"
                reason = f"Duplicate of '{dup_of}' in this import"
                duplicate_cnt += 1
            else:
                seen_keys.append((key, f"{job.get('role')} @ {job.get('company')}"))

        # Standardize + score every job that survived extraction
        try:
            _normalize_job(job, user, resume)
        except Exception as e:
            print(f"  [Pipeline] normalize/match error: {e}")

        job["is_valid"]          = is_valid
        job["review_status"]     = status
        job["validation_reason"] = reason
        job["_source"]           = source
        job["_raw"]              = block[:400]

        if is_valid:
            if status == "needs_review":
                needs_review += 1
            else:
                validated_cnt += 1
        else:
            rejected_cnt += 1

        results.append(job)

    stats = {
        "source":         source,
        "raw_lines":      total_lines,
        "noise_removed":  noise_removed,
        "blocks_found":   len(blocks),
        "validated":      validated_cnt,
        "needs_review":   needs_review,
        "rejected":       rejected_cnt,
        "duplicates":     duplicate_cnt,
        "valid":          validated_cnt + needs_review,
        "invalid":        rejected_cnt,
    }
    print(f"[Pipeline] Done — validated={validated_cnt} needs_review={needs_review} "
          f"rejected={rejected_cnt} (dups={duplicate_cnt})")
    return results, stats


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
  ],
  "section_scores": {{
    "keyword_density": <0-100 — how well ATS keywords are represented>,
    "experience_quality": <0-100 — depth/relevance of experience descriptions>,
    "achievement_score": <0-100 — quantified, impact-focused achievements>,
    "project_score": <0-100 — quality and relevance of projects>,
    "certification_score": <0-100 — certifications present vs expected for this profile>,
    "formatting": <0-100 — ATS-friendly structure and layout>,
    "readability": <0-100 — how quickly a recruiter can scan it>
  }},
  "role_recommendations": [
    {{"role": "Backend Developer", "match": <0-100>, "reason": "one sentence"}},
    {{"role": "...", "match": <0-100>, "reason": "..."}}
  ],
  "contact_info": {{"name": "full name or null", "phone": "phone or null", "email": "email or null", "location": "city/state or null"}},
  "education": [
    {{"college": "institution name", "degree": "e.g. B.Tech Computer Science", "cgpa": "e.g. 8.4 or 85% or null", "year": "passing year or null"}}
  ],
  "experience_entries": [
    {{"company": "company name", "role": "job title", "start": "e.g. 'Feb 2025' — month+year if available",
      "end": "e.g. 'Present' or 'Jun 2024'", "current": true or false,
      "responsibilities": ["1-2 key responsibilities, terse"]}}
  ],
  "projects_extracted": [
    {{"name": "project title", "description": "1 sentence", "tech": ["tech1", "tech2"], "github": "url or null", "live": "url or null"}}
  ],
  "certificates_extracted": [
    {{"name": "e.g. AWS Certified Solutions Architect", "issuer": "e.g. AWS, Coursera, Udemy, or null"}}
  ],
  "skill_intelligence": [
    {{"skill": "exact skill name as written", "category": "Programming | Framework | Cloud | AI/ML | Tool | Soft Skill",
      "years": <estimated years used, integer or null>, "confidence": <0-100 int — how sure you are this skill genuinely appears>,
      "last_used": "<estimated year this was last used, based on the most recent experience/project mentioning it, or null>"}}
  ]
}}

Classify EVERY skill you find into exactly one category:
- Programming: Python, Java, JavaScript, C++, Go, etc. (languages)
- Framework: React, Next.js, Node.js, Django, Spring Boot, etc.
- Cloud: AWS, Azure, GCP, Firebase, etc.
- AI/ML: LangChain, OpenAI, Claude, n8n, RAG, TensorFlow, PyTorch, etc.
- Tool: Git, Docker, Linux, Postman, Figma, etc.
- Soft Skill: Leadership, Communication, Teamwork, Problem Solving, etc.

Focus on:
1. Technical skills that are in demand but missing
2. Project suggestions that would fill skill gaps
3. Keywords that ATS systems look for
4. Sections that need improvement
5. Honest section scores grounded in the actual resume text
6. 3-4 realistic role recommendations based on the resume's strongest signals
7. Extract education/experience/projects/certificates exactly as written — do not invent data not present in the resume
8. For experience "start"/"end", extract the date text as-is (e.g. "Feb 2025", "2022") — duration is computed separately, do not calculate it yourself"""

    response = await _get_client().chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        response_format={"type": "json_object"},
        max_tokens=3200,
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
