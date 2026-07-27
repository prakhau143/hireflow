"""
AI Learning Service - Learning from Admin Corrections

This service tracks admin corrections to job data and provides
mechanisms to improve future AI extraction based on these corrections.

The learning approach:
1. Store corrections when admins modify job fields
2. Analyze patterns in corrections (e.g., company name normalization)
3. Suggest rule improvements based on correction patterns
4. Provide feedback for AI prompt refinement

Note: Full AI learning requires retraining/fine-tuning. This service
provides the data collection and analysis foundation.
"""
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.job import Job
from app.models.activity_log import ActivityLog
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
from collections import defaultdict
import json


async def log_correction(
    db: AsyncSession,
    job_id: str,
    field_name: str,
    old_value: str,
    new_value: str,
    admin_id: str,
    correction_type: str = "manual"
) -> None:
    """
    Log a correction made by an admin to a job field.
    
    This stores the correction in the ActivityLog for analysis.
    Future versions could use a dedicated CorrectionLog model.
    """
    description = (
        f"Admin corrected {field_name}: '{old_value}' → '{new_value}' "
        f"(type: {correction_type})"
    )
    
    log = ActivityLog(
        user_id=admin_id,
        action=f"Job Field Correction: {field_name}",
        description=description,
        # Store structured data for analysis
        # Note: ActivityLog doesn't have a JSON field, so we encode in description
        # Future: Add a dedicated CorrectionLog model with proper JSON storage
    )
    db.add(log)
    await db.commit()


async def get_correction_patterns(
    db: AsyncSession,
    days: int = 30,
    field_name: Optional[str] = None
) -> Dict[str, List[Dict]]:
    """
    Analyze correction patterns from recent admin activity.
    
    Returns patterns grouped by field, showing common corrections.
    This data can be used to:
    - Improve company name normalization rules
    - Add missing skill synonyms
    - Fix common extraction errors
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    # Query recent correction activities
    result = await db.execute(
        select(ActivityLog).where(
            ActivityLog.action.like("Job Field Correction%"),
            ActivityLog.created_at >= cutoff_date
        ).order_by(ActivityLog.created_at.desc())
    )
    logs = result.scalars().all()
    
    patterns = defaultdict(list)
    
    for log in logs:
        # Parse the description to extract field and values
        # Format: "Admin corrected {field}: '{old}' → '{new}' (type: {type})"
        desc = log.description
        if "corrected" in desc and "→" in desc:
            try:
                # Extract field name
                field_start = desc.find("corrected ") + len("corrected ")
                field_end = desc.find(":", field_start)
                field = desc[field_start:field_end].strip()
                
                if field_name and field != field_name:
                    continue
                
                # Extract old and new values
                values_start = field_end + 1
                values_part = desc[values_start:]
                arrow_pos = values_part.find("→")
                old_val = values_part[:arrow_pos].strip().strip("'\"")
                new_val = values_part[arrow_pos + 1:].split("(")[0].strip().strip("'\"")
                
                patterns[field].append({
                    "old_value": old_val,
                    "new_value": new_val,
                    "admin_id": log.user_id,
                    "timestamp": log.created_at.isoformat(),
                })
            except Exception as e:
                # Skip malformed entries
                continue
    
    return dict(patterns)


async def suggest_rule_improvements(
    db: AsyncSession,
    days: int = 30
) -> Dict[str, List[str]]:
    """
    Analyze correction patterns to suggest rule improvements.
    
    Returns suggestions grouped by category:
    - company_normalization: Company name patterns to add
    - skill_synonyms: Skill variations to map
    - extraction_rules: Patterns the AI is missing
    """
    patterns = await get_correction_patterns(db, days)
    suggestions = {
        "company_normalization": [],
        "skill_synonyms": [],
        "extraction_rules": [],
    }
    
    # Analyze company corrections
    if "company" in patterns:
        company_corrections = patterns["company"]
        # Look for patterns like removing prefixes/suffixes
        for corr in company_corrections[:50]:  # Limit to recent 50
            old = corr["old_value"].lower()
            new = corr["new_value"].lower()
            
            # Detect prefix removals (e.g., "At Zomato" → "Zomato")
            if old.startswith("at ") and new == old[3:]:
                suggestions["company_normalization"].append(
                    f"Remove 'At ' prefix: '{corr['old_value']}' → '{corr['new_value']}'"
                )
            
            # Detect suffix additions (e.g., "Zomato" → "Zomato Pvt Ltd")
            if old in new and "pvt" in new:
                suggestions["company_normalization"].append(
                    f"Add 'Pvt Ltd' suffix: '{corr['old_value']}' → '{corr['new_value']}'"
                )
    
    # Analyze skill corrections
    if "skills" in patterns:
        skill_corrections = patterns["skills"]
        for corr in skill_corrections[:50]:
            old_skills = corr["old_value"]
            new_skills = corr["new_value"]
            
            # If skills were added, they might be missing from extraction
            if len(new_skills) > len(old_skills):
                suggestions["extraction_rules"].append(
                    f"Skills may be missing: '{old_skills}' → '{new_skills}'"
                )
    
    # Remove duplicates
    for key in suggestions:
        suggestions[key] = list(set(suggestions[key]))
    
    return suggestions


async def get_learning_stats(db: AsyncSession, days: int = 30) -> Dict:
    """
    Get statistics about AI learning progress.
    
    Returns metrics like:
    - Total corrections made
    - Corrections by field
    - Most common corrections
    - Improvement rate (if tracking accuracy over time)
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    # Count total corrections
    result = await db.execute(
        select(func.count(ActivityLog.id)).where(
            ActivityLog.action.like("Job Field Correction%"),
            ActivityLog.created_at >= cutoff_date
        )
    )
    total_corrections = result.scalar() or 0
    
    # Get patterns for field breakdown
    patterns = await get_correction_patterns(db, days)
    
    field_counts = {field: len(corrections) for field, corrections in patterns.items()}
    
    return {
        "period_days": days,
        "total_corrections": total_corrections,
        "corrections_by_field": field_counts,
        "most_corrected_fields": sorted(field_counts.items(), key=lambda x: x[1], reverse=True)[:5],
    }


async def export_correction_data(db: AsyncSession, days: int = 30) -> str:
    """
    Export correction data in JSON format for external analysis or AI training.
    
    This can be used to:
    - Fine-tune AI models on correction data
    - Generate training datasets
    - Analyze trends over time
    """
    patterns = await get_correction_patterns(db, days)
    
    export_data = {
        "export_date": datetime.now(timezone.utc).isoformat(),
        "period_days": days,
        "total_corrections": sum(len(corrections) for corrections in patterns.values()),
        "corrections_by_field": patterns,
    }
    
    return json.dumps(export_data, indent=2)
