"""Skill / Role / Location taxonomies — canonical normalization for the import pipeline.

Phase 6/8: "ReactJS", "React.js", "React18" → "React"
Phase 9:   "Backend Engineer", "Python Developer" → family "Backend Developer"
Phase 10:  "Bangalore" → "Bengaluru", "Delhi NCR" → "Delhi"
"""
import re

# ---------------------------------------------------------------- skills

# canonical → aliases (all matching is lowercase, non-alphanumerics collapsed)
_SKILL_TAXONOMY: dict[str, list[str]] = {
    "React":            ["reactjs", "react js", "react.js", "react18", "react 18", "react developer"],
    "Node.js":          ["node", "nodejs", "node js"],
    "JavaScript":       ["js", "java script", "vanilla js", "es6", "ecmascript"],
    "TypeScript":       ["ts"],
    "Python":           ["python3", "python 3"],
    "Java":             ["core java", "java 8", "java8", "java11"],
    "Spring Boot":      ["springboot", "spring-boot", "spring"],
    "Angular":          ["angularjs", "angular js", "angular 2+"],
    "Vue.js":           ["vue", "vuejs", "vue js"],
    "Next.js":          ["next", "nextjs", "next js"],
    "Express.js":       ["express", "expressjs", "express js"],
    "FastAPI":          ["fast api", "fast-api"],
    "Django":           ["django rest framework", "drf"],
    "Flask":            [],
    "MongoDB":          ["mongo", "mongo db"],
    "PostgreSQL":       ["postgres", "postgre sql", "psql"],
    "MySQL":            ["my sql"],
    "SQL":              ["sql queries", "structured query language"],
    "Redis":            [],
    "AWS":              ["amazon web services", "aws cloud"],
    "GCP":              ["google cloud", "google cloud platform"],
    "Azure":            ["microsoft azure", "azure cloud"],
    "Docker":           ["dockers"],
    "Kubernetes":       ["k8s", "k8"],
    "CI/CD":            ["cicd", "ci cd", "ci-cd pipelines", "ci/cd pipelines"],
    "Git":              ["git/github", "version control"],
    "GitHub":           [],
    "HTML":             ["html5", "html 5"],
    "CSS":              ["css3", "css 3"],
    "Tailwind CSS":     ["tailwind", "tailwindcss"],
    "Bootstrap":        [],
    "Machine Learning": ["ml"],
    "Deep Learning":    ["dl"],
    "Artificial Intelligence": ["ai"],
    "Data Science":     [],
    "NLP":              ["natural language processing"],
    "TensorFlow":       ["tensor flow"],
    "PyTorch":          ["py torch"],
    "Pandas":           [],
    "NumPy":            ["numpy python"],
    "Power BI":         ["powerbi", "power-bi"],
    "Tableau":          [],
    "Excel":            ["ms excel", "microsoft excel", "advanced excel"],
    "REST API":         ["rest", "restful", "rest apis", "restful apis", "restful api", "api development", "rest api development"],
    "GraphQL":          ["graph ql"],
    "Microservices":    ["micro services", "micro-services", "microservices architecture"],
    "Selenium":         [],
    "Cypress":          [],
    "Playwright":       [],
    "Kafka":            ["apache kafka"],
    "Spark":            ["apache spark"],
    "PySpark":          ["py spark"],
    "Hadoop":           [],
    "Linux":            ["unix/linux", "linux/unix"],
    "C++":              ["cpp", "c plus plus"],
    "C#":               ["c sharp", "csharp"],
    ".NET":             ["dotnet", "dot net", "dot-net", ".net core", "net core"],
    "ASP.NET":          ["asp net", "aspnet"],
    "PHP":              [],
    "Laravel":          [],
    "Go":               ["golang", "go lang"],
    "Rust":             [],
    "Swift":            [],
    "Kotlin":           [],
    "Flutter":          ["flutter dart", "flutter/dart"],
    "React Native":     ["react-native", "reactnative"],
    "DSA":              ["data structures", "data structures and algorithms", "data structure", "algorithms"],
    "DevOps":           ["dev ops", "dev-ops"],
    "Jenkins":          [],
    "Terraform":        [],
    "Ansible":          [],
    "Figma":            [],
    "Adobe XD":         ["adobexd", "xd"],
    "SEO":              ["search engine optimization"],
    "Communication":    ["communication skills", "good communication", "excellent communication"],
}

def _norm_key(s: str) -> str:
    """Lowercase and collapse punctuation so 'React.JS' == 'react js' == 'reactjs'."""
    return re.sub(r"[^a-z0-9+#]+", " ", s.lower()).strip()

# Build reverse lookup: normalized alias/canonical → canonical
_SKILL_LOOKUP: dict[str, str] = {}
for canonical, aliases in _SKILL_TAXONOMY.items():
    _SKILL_LOOKUP[_norm_key(canonical)] = canonical
    # also match the fully-collapsed form ("nodejs" for "node js")
    _SKILL_LOOKUP[_norm_key(canonical).replace(" ", "")] = canonical
    for a in aliases:
        _SKILL_LOOKUP[_norm_key(a)] = canonical
        _SKILL_LOOKUP[_norm_key(a).replace(" ", "")] = canonical


def canonical_skill(skill: str | None) -> str | None:
    if not skill or not skill.strip():
        return None
    raw = skill.strip().strip(".,;:")
    key = _norm_key(raw)
    hit = _SKILL_LOOKUP.get(key) or _SKILL_LOOKUP.get(key.replace(" ", ""))
    if hit:
        return hit
    # Unknown skill — keep it, tidied (title-case single words, preserve given casing otherwise)
    return raw if any(c.isupper() for c in raw) else raw.title()


def canonical_skills(skills: list | None) -> list[str]:
    """Normalize a skill list: canonical names, deduped, order preserved."""
    out: list[str] = []
    seen: set[str] = set()
    for s in (skills or []):
        c = canonical_skill(str(s)) if s is not None else None
        if c and c.lower() not in seen:
            seen.add(c.lower())
            out.append(c)
    return out


# ---------------------------------------------------------------- roles

# Order matters: most specific families first, generic "Software Engineer" last.
_ROLE_FAMILIES: list[tuple[str, list[str]]] = [
    ("Full Stack Developer", ["full stack", "fullstack", "full-stack", "mern", "mean stack"]),
    ("Mobile Developer",     ["android", "ios developer", "flutter", "react native", "mobile developer", "mobile app"]),
    ("Data Scientist",       ["data scientist", "machine learning", "ml engineer", "ai engineer", "deep learning", "nlp engineer", "genai", "gen ai"]),
    ("Data Engineer",        ["data engineer", "etl", "big data", "spark", "hadoop", "data pipeline"]),
    ("Data Analyst",         ["data analyst", "business analyst", "analytics", "power bi", "tableau", "mis executive"]),
    ("DevOps Engineer",      ["devops", "sre", "site reliability", "cloud engineer", "platform engineer", "infrastructure engineer"]),
    ("QA Engineer",          ["qa ", "quality assurance", "test engineer", "sdet", "automation test", "manual test", "tester"]),
    ("UI/UX Designer",       ["ui/ux", "ux designer", "ui designer", "product designer", "graphic designer", "figma"]),
    ("Frontend Developer",   ["frontend", "front end", "front-end", "react developer", "angular developer", "vue developer", "web designer", "ui developer"]),
    ("Backend Developer",    ["backend", "back end", "back-end", "python developer", "java developer", "node developer", "nodejs developer",
                              "django developer", "fastapi", "spring developer", "php developer", "golang developer", ".net developer", "api developer"]),
    ("Product Manager",      ["product manager", "product owner", "project manager", "scrum master"]),
    ("Software Engineer",    ["software engineer", "software developer", "sde", "programmer", "web developer", "developer", "engineer"]),
]


def role_family(title: str | None) -> str | None:
    if not title:
        return None
    low = " " + title.lower() + " "
    for family, keywords in _ROLE_FAMILIES:
        for kw in keywords:
            if kw in low:
                return family
    return None


# ---------------------------------------------------------------- locations

_LOCATION_MAP: dict[str, str] = {
    "bangalore": "Bengaluru", "bengaluru": "Bengaluru", "blr": "Bengaluru", "banglore": "Bengaluru",
    "new delhi": "Delhi", "delhi ncr": "Delhi", "ncr": "Delhi", "delhi": "Delhi",
    "gurgaon": "Gurugram", "gurugram": "Gurugram",
    "bombay": "Mumbai", "mumbai": "Mumbai", "navi mumbai": "Navi Mumbai",
    "noida": "Noida", "greater noida": "Noida",
    "hyderabad": "Hyderabad", "hyd": "Hyderabad", "secunderabad": "Hyderabad",
    "pune": "Pune",
    "chennai": "Chennai", "madras": "Chennai",
    "kolkata": "Kolkata", "calcutta": "Kolkata",
    "ahmedabad": "Ahmedabad", "jaipur": "Jaipur", "indore": "Indore",
    "kochi": "Kochi", "cochin": "Kochi", "ernakulam": "Kochi",
    "trivandrum": "Thiruvananthapuram", "thiruvananthapuram": "Thiruvananthapuram",
    "chandigarh": "Chandigarh", "mohali": "Chandigarh",
    "coimbatore": "Coimbatore", "lucknow": "Lucknow", "bhopal": "Bhopal", "nagpur": "Nagpur",
    "mysore": "Mysuru", "mysuru": "Mysuru",
    "vizag": "Visakhapatnam", "visakhapatnam": "Visakhapatnam",
    "remote": "Remote", "wfh": "Remote", "work from home": "Remote", "anywhere": "Remote",
    "pan india": "India (Any)", "anywhere in india": "India (Any)", "across india": "India (Any)",
}


def canonical_location(loc: str | None) -> str:
    if not loc or not loc.strip():
        return ""
    cleaned = loc.strip().strip(".,")
    low = re.sub(r"\s+", " ", cleaned.lower())
    low = re.sub(r",?\s*india$", "", low).strip()
    if low in _LOCATION_MAP:
        return _LOCATION_MAP[low]
    # multi-city strings: "Bangalore / Pune" or "Bangalore, Pune"
    parts = re.split(r"[,/|]| or | and ", low)
    mapped = [_LOCATION_MAP[p.strip()] for p in parts if p.strip() in _LOCATION_MAP]
    if mapped:
        seen, uniq = set(), []
        for m in mapped:
            if m not in seen:
                seen.add(m)
                uniq.append(m)
        return " / ".join(uniq)
    return cleaned.title() if cleaned.islower() else cleaned
