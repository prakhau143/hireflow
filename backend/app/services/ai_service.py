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
# RULE ENGINE — Step 0: WhatsApp metadata stripping (runs BEFORE noise removal)
# WhatsApp's own export prefix — Android "[1:21 pm, 25/7/2026] +91 92748 51755: "
# or iOS "25/7/2026, 1:21 pm - +91 92748 51755: " — must never reach the block
# splitter or the AI: the sender's own phone number is indistinguishable from a
# job contact phone, and would falsely trip _is_end_signal on every single line.
# ─────────────────────────────────────────────────────────────────────────────

_WA_TIME = r"\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?"
_WA_DATE = r"\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}"

_WA_METADATA_RES = [re.compile(p, re.IGNORECASE) for p in [
    # Android: "[1:21 pm, 25/7/2026] +91 92748 51755: " — sender may be a saved
    # contact name instead of a number, so match anything up to the next colon.
    rf"^\[{_WA_TIME}\s*,\s*{_WA_DATE}\]\s*[^:\n]{{1,60}}:\s*",
    # iOS: "25/7/2026, 1:21 pm - +91 92748 51755: "
    rf"^{_WA_DATE}\s*,\s*{_WA_TIME}\s*-\s*[^:\n]{{1,60}}:\s*",
]]


def _strip_whatsapp_metadata(text: str) -> str:
    """Strips the WhatsApp export timestamp/sender prefix from the front of every
    line, keeping whatever message content follows the colon on the same line."""
    out = []
    for line in text.splitlines():
        for rx in _WA_METADATA_RES:
            stripped = rx.sub("", line, count=1)
            if stripped != line:
                line = stripped
                break
        out.append(line)
    return "\n".join(out)


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
    # NEW: Additional start markers from spec
    r"\bhiring\s+alert\b",
    r"\bhiring\s*\|\s*",
    r"\blooking\s+for\b",
    r"\bopportunit(?:y|ies)\b",
]]


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


# Indian mobile numbers, with or without a +91/91 prefix, plus wa.me links —
# counts as an end signal alongside email/Google Form/LinkedIn/apply links.
_PHONE_RE = re.compile(r"(?:\+?91[\s\-]?)?[6-9]\d{9}\b|\bwa\.me/\d+", re.IGNORECASE)


def _is_strong_start_marker(stripped: str) -> bool:
    """Unambiguous new-post signals ('We're Hiring', 'Urgent Hiring', a numbered
    list entry, a bare --- separator, ...) — these never legitimately appear
    mid-post, so seeing one always force-closes whatever's being collected."""
    if not stripped:
        return False
    if re.match(r"^[-=*~_]{3,}\s*$", stripped):
        return True
    return any(pat.search(stripped) for pat in _STRONG_BOUNDARY_RES)


def _is_any_start_marker(stripped: str) -> bool:
    """Strong markers plus weaker labeled-field/CTA markers ('Role:', 'Position:',
    'Company:', 'Opening:', 'Join Us', ...). Weak markers can OPEN a new block
    from a cold state, but — unlike strong markers — never interrupt a block
    already being collected, since these routinely appear inside a single
    post's own body ('We're Hiring' + 'Company: X' + 'Join us!' must stay one
    job, not three)."""
    if _is_strong_start_marker(stripped):
        return True
    if re.search(r"\bjoin\s+us\b", stripped, re.IGNORECASE):
        return True
    return any(pat.search(stripped) for pat in _BOUNDARY_RES)


def _is_end_signal(stripped: str) -> bool:
    """A line that completes the job currently being collected: an email, a
    phone number, or any link (Google Form, LinkedIn apply, or a generic
    company apply link — all of them are just an http(s) URL). Also matches
    contact method keywords like 'Resume at', 'Send CV', 'Mail us', 'DM',
    'WhatsApp', 'Telegram'."""
    if not stripped:
        return False
    # Existing: email, phone, URL
    if bool(_CONTACT_SIGNAL_RE.search(stripped)) or bool(_PHONE_RE.search(stripped)):
        return True
    # NEW: Contact method keywords from spec
    end_keywords = [
        r"\bresume\s+at\b",
        r"\bsend\s+cv\b",
        r"\bsend\s+resume\b",
        r"\bmail\s+us\b",
        r"\bdm\b",
        r"\bwhatsapp\b",
        r"\btelegram\b",
    ]
    return any(re.search(kw, stripped, re.IGNORECASE) for kw in end_keywords)


# ─────────────────────────────────────────────────────────────────────────────
# RULE ENGINE — Step 2.5: Multi-job detection within single message
# Some messages list multiple jobs under technology/role headings:
# "HIRING\nPython Developer\n...\nReact Developer\n...\nNode Developer\n..."
# These need to be split into separate job blocks before AI extraction.
# ─────────────────────────────────────────────────────────────────────────────

_MULTI_JOB_HEADING_RE = re.compile(
    r"^(?:technology|role|position|stack|tech\s*stack|skills?)\s*[:\-]?\s*",
    re.IGNORECASE,
)

_TECHNOLOGY_ROLES = [
    "python", "java", "javascript", "react", "node", "angular", "vue", "flutter",
    "android", "ios", "swift", "kotlin", "golang", "rust", "php", "dotnet", ".net",
    "c\+\+", "c#", "ruby", "scala", "typescript", "frontend", "backend", "fullstack",
    "devops", "data science", "machine learning", "ai", "ml", "blockchain", "cloud",
    "aws", "azure", "gcp", "docker", "kubernetes", "linux", "security", "testing",
]

def _detect_multi_job_pattern(block: str) -> bool:
    """Check if a block contains multiple jobs separated by role/technology headings."""
    lines = block.splitlines()
    tech_headings = 0
    for line in lines:
        stripped = line.strip().lower()
        # Check for explicit "Technology:" or "Role:" headings
        if _MULTI_JOB_HEADING_RE.match(stripped):
            tech_headings += 1
        # Check for standalone technology/role keywords that look like headings
        elif stripped in _TECHNOLOGY_ROLES or any(tech in stripped for tech in _TECHNOLOGY_ROLES):
            # Only count if it's on its own line or followed by a colon/dash
            if len(stripped.split()) <= 3 and (stripped.endswith(":") or stripped.endswith("-")):
                tech_headings += 1
    return tech_headings >= 2

def _split_multi_job_block(block: str) -> list[str]:
    """Split a multi-job block into separate job blocks based on role/technology headings."""
    lines = block.splitlines()
    jobs: list[list[str]] = []
    current: list[str] = []
    
    for line in lines:
        stripped = line.strip()
        # Check if this line is a role/technology heading
        is_heading = False
        if _MULTI_JOB_HEADING_RE.match(stripped):
            is_heading = True
        else:
            lower = stripped.lower()
            for tech in _TECHNOLOGY_ROLES:
                if tech in lower and len(lower.split()) <= 3:
                    is_heading = True
                    break
        
        if is_heading and current:
            # Save previous job and start new one
            jobs.append(current)
            current = [line]
        else:
            current.append(line)
    
    if current:
        jobs.append(current)
    
    # Filter out empty or too-short blocks
    return ["\n".join(job).strip() for job in jobs if len("\n".join(job).strip()) > 25]


def _segment_blocks(text: str) -> list[str]:
    """Marker-based state machine, not "email found → split": find a start
    marker, collect every line — blank lines included, never a split point —
    until an end signal (email/phone/Google Form/LinkedIn apply/company apply
    link) closes the job, then look for the next marker. A strong marker seen
    mid-collection force-closes the current (contact-less) post rather than
    losing it or merging it into the next one.
    
    After initial segmentation, checks for multi-job patterns within blocks
    and splits them further before AI extraction."""
    lines = text.splitlines()
    blocks: list[str] = []
    current: list[str] = []
    collecting = False

    def _flush():
        chunk = "\n".join(current).strip()
        if len(chunk) > 25:
            blocks.append(chunk)

    for line in lines:
        stripped = line.strip()

        if collecting and current and _is_strong_start_marker(stripped):
            _flush()
            current, collecting = [line], True
            continue

        if not collecting:
            if _is_any_start_marker(stripped):
                current, collecting = [line], True
            continue  # discard anything before the first marker — not part of any job

        current.append(line)
        if _is_end_signal(stripped):
            _flush()
            current, collecting = [], False

    if current:
        _flush()

    # Fallback: no markers ever matched → treat the whole text as one block
    initial_blocks = blocks if blocks else ([text.strip()] if text.strip() else [])
    
    # Step 2.5: Split multi-job blocks
    final_blocks: list[str] = []
    for block in initial_blocks:
        if _detect_multi_job_pattern(block):
            final_blocks.extend(_split_multi_job_block(block))
        else:
            final_blocks.append(block)
    
    return final_blocks


def _detect_source(raw: str) -> str:
    lower = raw.lower()
    if any(k in lower for k in ("end-to-end encrypted", "message deleted", "whatsapp")):
        return "whatsapp"
    if any(k in lower for k in ("linkedin.com", "· linkedin", "· 1st", "· 2nd")):
        return "linkedin"
    if any(k in lower for k in ("t.me/", "telegram")):
        return "telegram"
    return "text"


_EXP_NO_UPPER = 99.0  # sentinel for "N+ years" — avoids float('inf'), which isn't valid JSON
_EXP_UNIT = r"(?:month|mon|yr|year)s?"
_EXP_RANGE_SHARED_UNIT_RE = re.compile(
    rf"(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*\+?\s*({_EXP_UNIT})\b")
_EXP_PAIR_RE = re.compile(rf"(\d+(?:\.\d+)?)\s*\+?\s*({_EXP_UNIT})\b")


def _exp_to_years(value: float, unit: str) -> float:
    return round(value / 12, 2) if unit.startswith("month") or unit.startswith("mon") else value


def _parse_experience(exp: str | None) -> tuple[float, float]:
    """Unit-aware experience parser. The old version extracted every digit in the
    string with no unit awareness, so 're.findall(r"\\d+", "6 Months – 2 Year")'
    returned [6, 2] and was stored as experience_min=6, experience_max=2 — a
    backwards YEAR range instead of 0.5-2. Every branch below is verified against
    the full spec test matrix (months, mixed-unit ranges, shared-unit ranges,
    open-ended "N+", and bare unitless numbers)."""
    if not exp:
        return 0.0, 5.0
    low = exp.lower().strip()
    if any(k in low for k in ("fresher", "intern", "0 year", "no exp")):
        return 0.0, 0.0

    # 1) Range sharing ONE trailing unit: "0-2 Years", "6-10 Yrs"
    m = _EXP_RANGE_SHARED_UNIT_RE.search(low)
    if m:
        lo, hi, unit = float(m.group(1)), float(m.group(2)), m.group(3)
        lo, hi = _exp_to_years(lo, unit), _exp_to_years(hi, unit)
        return (lo, hi) if lo <= hi else (hi, lo)

    # 2) Range with a unit on EACH side: "6 Months – 2 Year"
    pairs = _EXP_PAIR_RE.findall(low)
    if len(pairs) >= 2:
        (lo_v, lo_u), (hi_v, hi_u) = pairs[0], pairs[1]
        lo, hi = _exp_to_years(float(lo_v), lo_u), _exp_to_years(float(hi_v), hi_u)
        return (lo, hi) if lo <= hi else (hi, lo)

    # 3) A single "<number> <unit>" figure: "6 Months", "24 Months", "2+ Years"
    if len(pairs) == 1:
        val, unit = pairs[0]
        years = _exp_to_years(float(val), unit)
        if "+" in low:
            return years, _EXP_NO_UPPER
        return years, years

    # 4) No unit words at all — bare numbers: "3-5", "2+", "3"
    nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", low)]
    if len(nums) >= 2:
        lo, hi = nums[0], nums[1]
        return (lo, hi) if lo <= hi else (hi, lo)
    if len(nums) == 1:
        n = nums[0]
        if "+" in low:
            return n, _EXP_NO_UPPER
        return max(0.0, n - 1), n + 2
    return 0.0, 5.0


def format_experience_range(exp_min: float | None, exp_max: float | None) -> str:
    """Generates the human display string FROM the stored numeric fields — per spec,
    display text like '6 Months – 2 Years' must never be stored redundantly as its
    own string, only derived from experience_min/experience_max on read."""
    if exp_min is None and exp_max is None:
        return "Not specified"
    lo = exp_min if exp_min is not None else 0.0
    hi = exp_max if exp_max is not None else lo

    def parts(v: float) -> tuple[str, str]:
        if 0 < v < 1:
            months = round(v * 12)
            return str(months), "Month" if months == 1 else "Months"
        if v == int(v):
            years = int(v)
            return str(years), "Year" if years == 1 else "Years"
        return f"{v:g}", "Years"

    if lo == hi:
        n, unit = parts(lo)
        return f"{n} {unit}"
    if hi >= _EXP_NO_UPPER:
        n, unit = parts(lo)
        return f"{n}+ {unit}"
    lo_n, lo_unit = parts(lo)
    hi_n, hi_unit = parts(hi)
    if lo_unit == hi_unit:
        return f"{lo_n}–{hi_n} {hi_unit}"
    return f"{lo_n} {lo_unit} – {hi_n} {hi_unit}"


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


# ─────────────────────────────────────────────────────────────────────────────
# SKILL NORMALIZATION — Synonym mapping to canonical forms
# Normalizes variations to standard forms before AI extraction
# ─────────────────────────────────────────────────────────────────────────────

_SKILL_SYNONYMS = {
    # REST API variations
    "rest api": "REST API",
    "rest apis": "REST API",
    "restful api": "REST API",
    "restful apis": "REST API",
    "rest": "REST API",
    "restful": "REST API",
    
    # Node.js variations
    "node": "Node.js",
    "nodejs": "Node.js",
    "node js": "Node.js",
    "node-js": "Node.js",
    
    # React variations
    "reactjs": "React",
    "react js": "React",
    "react-js": "React",
    "react.js": "React",
    
    # JavaScript variations
    "javascript": "JavaScript",
    "js": "JavaScript",
    "java script": "JavaScript",
    
    # Python variations
    "python": "Python",
    "py": "Python",
    
    # Java variations
    "java": "Java",
    
    # TypeScript variations
    "typescript": "TypeScript",
    "ts": "TypeScript",
    "type script": "TypeScript",
    
    # Angular variations
    "angular": "Angular",
    "angularjs": "Angular",
    "angular js": "Angular",
    
    # Vue variations
    "vue": "Vue",
    "vuejs": "Vue",
    "vue js": "Vue",
    
    # Database variations
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "mongo": "MongoDB",
    "mongodb": "MongoDB",
    "mysql": "MySQL",
    "sql": "SQL",
    
    # Cloud variations
    "aws": "AWS",
    "amazon web services": "AWS",
    "azure": "Azure",
    "microsoft azure": "Azure",
    "gcp": "GCP",
    "google cloud": "GCP",
    
    # DevOps variations
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "k8s": "Kubernetes",
    "ci/cd": "CI/CD",
    "cicd": "CI/CD",
    
    # Framework variations
    "django": "Django",
    "flask": "Flask",
    "fastapi": "FastAPI",
    "spring boot": "Spring Boot",
    "springboot": "Spring Boot",
    "express": "Express",
    "express.js": "Express",
    "nextjs": "Next.js",
    "next js": "Next.js",
    "nuxt": "Nuxt",
    "nuxtjs": "Nuxt",
    
    # Mobile variations
    "android": "Android",
    "ios": "iOS",
    "swift": "Swift",
    "kotlin": "Kotlin",
    "flutter": "Flutter",
    "react native": "React Native",
    "reactnative": "React Native",
}

def _normalize_skill(skill: str) -> str:
    """Normalize a single skill to its canonical form."""
    if not skill:
        return skill
    normalized = skill.strip().lower()
    return _SKILL_SYNONYMS.get(normalized, skill.strip())

def _normalize_skills(skills: list[str]) -> list[str]:
    """Normalize a list of skills to canonical forms, deduplicating."""
    if not skills:
        return []
    normalized = set()
    for skill in skills:
        canonical = _normalize_skill(skill)
        if canonical:
            normalized.add(canonical)
    return sorted(list(normalized))


# ─────────────────────────────────────────────────────────────────────────────
# COMPANY DETECTION — Priority-based extraction with normalization
# Priority: Explicit company name > Email domain > Website URL
# Normalizes suffixes: "Enerlogs Analytics" → "Enerlogs Analytics Pvt Ltd"
# Removes prefixes: "At Connectiqo" → "Connectiqo"
# ─────────────────────────────────────────────────────────────────────────────

_COMPANY_SUFFIXES = [
    "pvt ltd", "pvt. ltd.", "private limited", "pvt limited",
    "ltd", "ltd.", "limited",
    "inc", "inc.", "incorporated",
    "llc", "llc.",
    "corp", "corp.", "corporation",
    "solutions", "technologies", "technology", "systems", "software",
    "analytics", "labs", "innovations", "global", "india", "services",
]

_COMPANY_PREFIXES = [
    "at ", "at", "for ", "for", "with ", "with",
]

def _normalize_company_name(name: str) -> str:
    """Normalize company name by adding standard suffixes and removing prefixes."""
    if not name:
        return name
    
    # Remove prefixes like "At Connectiqo" → "Connectiqo"
    for prefix in _COMPANY_PREFIXES:
        if name.lower().startswith(prefix):
            name = name[len(prefix):].strip()
            break
    
    # Capitalize properly
    name = name.strip().title()
    
    # Check if already has a suffix
    lower = name.lower()
    has_suffix = any(suffix in lower for suffix in _COMPANY_SUFFIXES)
    
    # If no suffix and name is reasonably long, add "Pvt Ltd"
    if not has_suffix and len(name) >= 3:
        # Don't add suffix to very short or generic names
        if name not in ("It", "Hr", "Admin", "Team"):
            name = f"{name} Pvt Ltd"
    
    return name


def _extract_company_from_text(raw_block: str) -> str | None:
    """Extract company name from raw text using common patterns."""
    lines = raw_block.splitlines()
    for line in lines:
        stripped = line.strip()
        # Look for "Company:" or "Organization:" patterns
        if re.match(r"^(?:🏢\s*)?[Cc]ompany\s*(?:[Nn]ame)?\s*[:\-]\s*", stripped, re.IGNORECASE):
            parts = re.split(r"[:\-]", stripped, 1)
            if len(parts) == 2:
                company = parts[1].strip()
                if company and company.lower() not in _BLANK_VALUES:
                    return _normalize_company_name(company)
        # Look for "Organization:" pattern
        if re.match(r"^[Oo]rganization\s*[:\-]\s*", stripped, re.IGNORECASE):
            parts = re.split(r"[:\-]", stripped, 1)
            if len(parts) == 2:
                company = parts[1].strip()
                if company and company.lower() not in _BLANK_VALUES:
                    return _normalize_company_name(company)
    return None


def _company_from_email(email: str | None) -> str | None:
    """Salvage a company name from a corporate email domain: hr@zomato.com → 'Zomato Pvt Ltd'."""
    if not email or "@" not in email:
        return None
    domain = email.split("@", 1)[1].lower()
    name = domain.split(".")[0]
    if name in _GENERIC_EMAIL_DOMAINS or len(name) < 3:
        return None
    return _normalize_company_name(name)


def _company_from_url(url: str | None) -> str | None:
    """Extract company name from website URL: https://zomato.com/careers → 'Zomato Pvt Ltd'."""
    if not url:
        return None
    # Remove protocol and path
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url)
        domain = parsed.netloc
        # Remove www. and get main domain
        domain = domain.replace("www.", "")
        parts = domain.split(".")
        if len(parts) >= 2:
            name = parts[0]
            if name and len(name) >= 3 and name not in _GENERIC_EMAIL_DOMAINS:
                return _normalize_company_name(name)
    except Exception:
        pass
    return None


def _detect_company(job: dict, raw_block: str) -> str:
    """Priority-based company detection: explicit > email domain > website URL."""
    # Priority 1: Explicit company name from AI extraction
    explicit = (job.get("company") or "").strip()
    if explicit and explicit.lower() not in _BLANK_VALUES:
        return _normalize_company_name(explicit)
    
    # Priority 2: Extract from text patterns (Company:, Organization:)
    from_text = _extract_company_from_text(raw_block)
    if from_text:
        return from_text
    
    # Priority 3: Extract from email domain
    email = job.get("email") or ""
    from_email = _company_from_email(email)
    if from_email:
        return from_email
    
    # Priority 4: Extract from apply link/website URL
    url = job.get("apply_link") or ""
    from_url = _company_from_url(url)
    if from_url:
        return from_url
    
    return None


# ─────────────────────────────────────────────────────────────────────────────
# DUPLICATE DETECTION — Fuzzy matching based on key fields
# Uses company, role, location, email, and experience to detect duplicates
# ─────────────────────────────────────────────────────────────────────────────

def _create_job_fingerprint(job: dict) -> str:
    """Create a normalized fingerprint for duplicate detection."""
    role = (job.get("role") or "").lower().strip()
    company = (job.get("company") or "").lower().strip()
    location = (job.get("location") or "").lower().strip()
    email = (job.get("email") or "").lower().strip()
    exp_min = job.get("experience_min")
    exp_max = job.get("experience_max")
    
    # Normalize experience to ranges
    if exp_min is None and exp_max is None:
        exp_range = "any"
    elif exp_max is None or exp_max >= 99:  # No upper bound
        exp_range = f"{exp_min}+"
    else:
        exp_range = f"{exp_min}-{exp_max}"
    
    # Create fingerprint string
    parts = [
        role,
        company,
        location,
        email,
        exp_range,
    ]
    # Remove empty parts and join
    fingerprint = "|".join(p for p in parts if p)
    return re.sub(r"[^a-z0-9|+\-]", "", fingerprint)


def _is_duplicate_job(new_job: dict, existing_jobs: list[dict]) -> tuple[bool, str | None]:
    """Check if a job is a duplicate of existing jobs using fuzzy matching.
    
    Returns (is_duplicate, duplicate_job_id).
    """
    new_fingerprint = _create_job_fingerprint(new_job)
    
    for existing in existing_jobs:
        existing_fingerprint = _create_job_fingerprint(existing)
        
        # Exact fingerprint match
        if new_fingerprint == existing_fingerprint:
            return True, existing.get("id")
        
        # Fuzzy match: same role + company + location (email may differ)
        new_role = (new_job.get("role") or "").lower().strip()
        new_company = (new_job.get("company") or "").lower().strip()
        new_location = (new_job.get("location") or "").lower().strip()
        
        existing_role = (existing.get("role") or "").lower().strip()
        existing_company = (existing.get("company") or "").lower().strip()
        existing_location = (existing.get("location") or "").lower().strip()
        
        # Match if role, company, and location are the same
        if (new_role == existing_role and 
            new_company == existing_company and 
            new_location == existing_location and
            new_role and new_company):  # Must have role and company
            return True, existing.get("id")
        
        # Match if same email (strong signal)
        new_email = (new_job.get("email") or "").lower().strip()
        existing_email = (existing.get("email") or "").lower().strip()
        if new_email and new_email == existing_email:
            return True, existing.get("id")
    
    return False, None


def _find_apply_url(raw_block: str) -> str | None:
    """First non-noise URL in the block (noise cleaner already dropped youtube/groups lines)."""
    for url in _URL_RE.findall(raw_block):
        low = url.lower()
        if any(bad in low for bad in ("youtube.com", "youtu.be", "groups.google", "unsubscribe", "chat.whatsapp.com")):
            continue
        return url.rstrip(".,;)|]")
    return None


def _validate_enterprise(job: dict, raw_block: str) -> tuple[bool, str, str, list[str]]:
    """
    Returns (is_valid, status, reason, confidence_reasons). status: 'valid' | 'needs_review' | 'rejected'.
    
    confidence_reasons is a list of strings explaining why the confidence score is what it is.
    This helps admins understand what's missing or what's good about a job in the review queue.

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
        return False, "rejected", "Too short to be a real job post (< 12 words)", ["Insufficient text content"]

    # ── Absolute floor #2 — no role means there's nothing to import ─────────
    if not role or role.lower() in _BLANK_VALUES:
        return False, "rejected", "No job title identified", ["Missing job title"]

    # Company: try direct extraction, then salvage from an email domain.
    # A miss here only costs points below — it is never a reject reason.
    if comp.lower() in _BLANK_VALUES:
        detected = _detect_company(job, raw_block)
        comp = detected or ""
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

    # ── Weighted confidence score (100 pts total) with detailed reasons ───────
    score = 0
    confidence_reasons = []
    
    # Role (20 pts)
    score += 20
    confidence_reasons.append(f"✓ Job title identified: {role}")
    
    # Company (20 pts)
    if comp:
        score += 20
        confidence_reasons.append(f"✓ Company detected: {comp}")
    else:
        confidence_reasons.append("✗ Company name missing")
    
    # Experience (15 pts)
    if exp:
        score += 15
        confidence_reasons.append(f"✓ Experience specified: {exp}")
    else:
        confidence_reasons.append("✗ Experience requirement missing")
    
    # Location (10 pts)
    if has_location:
        score += 10
        loc_display = loc if loc else mode
        confidence_reasons.append(f"✓ Location: {loc_display}")
    else:
        confidence_reasons.append("✗ Location missing")
    
    # Apply/Contact (20 pts)
    if has_apply:
        score += 20
        contact_methods = []
        if email: contact_methods.append("email")
        if phone: contact_methods.append("phone")
        if apply_link: contact_methods.append("apply link")
        confidence_reasons.append(f"✓ Contact method: {', '.join(contact_methods)}")
    else:
        confidence_reasons.append("✗ No contact or apply method found")
    
    # Skills (10 pts)
    if skills:
        score += 10
        skill_count = len(skills)
        confidence_reasons.append(f"✓ {skill_count} skill(s) identified")
    else:
        confidence_reasons.append("✗ No skills listed")
    
    # Salary (5 pts)
    if salary:
        score += 5
        confidence_reasons.append(f"✓ Salary info: {salary}")
    else:
        confidence_reasons.append("✗ Salary information missing")

    ai_conf = int(job.get("confidence_score") or 0)
    blended = round(score * 0.75 + ai_conf * 0.25)   # deterministic score dominates
    job["confidence_score"] = blended
    job["confidence_reasons"] = confidence_reasons

    missing = []
    if not comp:          missing.append("company")
    if not exp:           missing.append("experience")
    if not has_location:  missing.append("location")
    if not has_apply:     missing.append("contact/apply method")
    if not skills:        missing.append("skills")
    if not salary:        missing.append("salary")

    if blended < REJECT_FLOOR:
        return False, "rejected", f"Confidence too low ({blended}%) — missing: {', '.join(missing)}", confidence_reasons

    if blended >= VALID_CEILING:
        return True, "valid", None, confidence_reasons

    reason = f"Confidence {blended}%" + (f" — missing: {', '.join(missing)}" if missing else "")
    return True, "needs_review", reason, confidence_reasons


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


def _normalize_job(job: dict, user=None, resume=None) -> None:
    """Phases 6/8/9/10: taxonomies, canonical location, experience parsing.
    No longer scores against a user here — jobs are now globally-shared, so
    matching happens per-viewer at review-approval / onboarding time instead
    (see matching_service.sync_user_job_match). `user`/`resume` are accepted
    but unused, kept so existing call sites don't need to change."""
    from app.services.taxonomy import canonical_skills, canonical_location, role_family

    # Normalize skills using synonym mapping first, then taxonomy
    job["skills"] = _normalize_skills(job.get("skills"))
    job["skills"] = canonical_skills(job["skills"])
    
    if job.get("location"):
        job["location"] = canonical_location(job["location"])
        if job["location"] == "Remote":
            job["location"], job["work_mode"] = "", "Remote"
    job["role_family"] = role_family(job.get("role"))

    exp_min, exp_max = _parse_experience(job.get("experience"))
    job["experience_min"], job["experience_max"] = exp_min, exp_max


async def parse_linkedin_posts(raw_text: str, user, resume=None, existing_jobs: list[dict] = None) -> tuple[list[dict], dict]:
    """
    Enterprise Hybrid Rule-Based + AI pipeline.

    Paste Text → Noise Cleaner → Block Splitter → AI Extraction → Validation
    → Duplicate Checker → Skill/Role/Location Standardization → 100-pt Matching.

    `user` is the User ORM object (skills, experience, locations, roles used for
    matching); `resume` is the user's latest Resume row or None.
    `existing_jobs` is a list of existing job dicts from the database for duplicate checking.
    Returns (results, pipeline_stats).
    """
    from difflib import SequenceMatcher

    print(f"\n[Pipeline] Input: {len(raw_text)} chars")

    user_skills = list(user.skills or [])
    raw_lines   = raw_text.splitlines()
    total_lines = len(raw_lines)

    source  = _detect_source(raw_text)
    cleaned = _clean_noise(_strip_whatsapp_metadata(raw_text))

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
    
    # Use provided existing jobs or empty list
    existing_jobs = existing_jobs or []

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
        is_valid, status, reason, confidence_reasons = _validate_enterprise(job, block)

        # Smart duplicate detection: first check against database, then within this import
        if is_valid:
            # Check against existing jobs in database
            is_db_dup, dup_job_id = _is_duplicate_job(job, existing_jobs)
            if is_db_dup:
                is_valid, status = False, "duplicate"
                reason = f"Duplicate of existing job (ID: {dup_job_id})"
                duplicate_cnt += 1
            else:
                # Check for duplicates within this import (≥90% similar fingerprint)
                key = _dedupe_key(job)
                dup_of = None
                for prev_key, prev_label in seen_keys:
                    if SequenceMatcher(None, key, prev_key).ratio() >= 0.9:
                        dup_of = prev_label
                        break
                if dup_of:
                    is_valid, status = False, "duplicate"
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
        job["confidence_reasons"] = confidence_reasons
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
  ],
  "achievements": ["quantified accomplishment bullets extracted verbatim, e.g. 'Reduced API latency by 40%'"],
  "languages_spoken": ["spoken/written languages the candidate lists, e.g. English, Hindi — not programming languages"],
  "onboarding_fields": {{
    "current_role": {{"value": "most recent job title or null", "confidence": <0-100 int>}},
    "current_company": {{"value": "most recent employer or null", "confidence": <0-100 int>}},
    "years_experience": {{"value": <integer total years of professional experience, or null>, "confidence": <0-100 int>}},
    "current_location": {{"value": "city/state or null", "confidence": <0-100 int>}},
    "phone": {{"value": "the exact phone number if printed, otherwise null", "confidence": <0-100 int>}},
    "linkedin_url": {{"value": "the exact LinkedIn profile URL if printed in the resume, otherwise null", "confidence": <0-100 int>}},
    "github_url": {{"value": "the exact GitHub profile URL if printed in the resume, otherwise null", "confidence": <0-100 int>}},
    "portfolio_url": {{"value": "the exact personal website URL if printed in the resume, otherwise null", "confidence": <0-100 int>}}
  }}
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
8. For experience "start"/"end", extract the date text as-is (e.g. "Feb 2025", "2022") — duration is computed separately, do not calculate it yourself
9. Confidence calibration for skill_intelligence and onboarding_fields: 90-100 = stated explicitly and unambiguously (e.g. a labeled "Phone:" line, a role title header), 60-89 = present but requires minor inference (e.g. inferring current_company from the most recent, undated experience entry), 30-59 = a weak guess from indirect context
10. CRITICAL: if an onboarding_fields value is genuinely absent from the resume text (e.g. no LinkedIn URL is printed anywhere), its "value" MUST be the JSON literal null and confidence MUST be 0 — never echo back a placeholder, example, or template string from these instructions as if it were real data"""

    response = await _get_client().chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        response_format={"type": "json_object"},
        max_tokens=3800,
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
