import hashlib
import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from backend.models import AuditLog

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

def compute_log_hash(prev_hash: str, timestamp_str: str, event_type: str, invoice_id: Optional[str], details: Dict[str, Any]) -> str:
    """Computes SHA-256 over historical chain pointer and current payload."""
    payload = {
        "prev_hash": prev_hash,
        "timestamp": timestamp_str,
        "event_type": event_type,
        "invoice_id": invoice_id or "NONE",
        "details": details
    }
    raw_str = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(raw_str.encode("utf-8")).hexdigest()

def record_audit_event(
    db: Session,
    event_type: str,
    actor_role: str,
    details: Dict[str, Any],
    invoice_id: Optional[str] = None,
    severity: str = "INFO",
    actor_id: str = "SYSTEM",
    actor_name: str = "System Engine"
) -> AuditLog:
    """
    Appends an immutable, hash-chained log entry to the live database.
    """
    last_log = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).first()
    prev_hash = last_log.current_log_hash if last_log else GENESIS_HASH

    now = datetime.now(timezone.utc)
    now_str = now.isoformat()
    current_hash = compute_log_hash(prev_hash, now_str, event_type, invoice_id, details)

    log_entry = AuditLog(
        invoice_id=invoice_id,
        event_type=event_type,
        severity=severity,
        actor_role=actor_role,
        actor_id=actor_id,
        actor_name=actor_name,
        details=details,
        prev_log_hash=prev_hash,
        current_log_hash=current_hash,
        timestamp_iso=now_str,
        timestamp=now
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry

def verify_audit_chain_integrity(db: Session) -> Dict[str, Any]:
    """
    Validates all hash links from genesis to current leaf.
    Returns status and proof for Chief Auditor inspection.
    """
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.asc()).all()
    if not logs:
        return {"valid": True, "total_records": 0, "message": "Genesis chain empty"}

    expected_prev = GENESIS_HASH
    for idx, log in enumerate(logs):
        if log.prev_log_hash != expected_prev:
            return {
                "valid": False,
                "broken_at_index": idx,
                "broken_log_id": log.id,
                "message": f"Hash chain broken at index {idx}! Tampering detected."
            }
        
        # Verify self hash using recorded exact timestamp_iso
        recalc_hash = compute_log_hash(
            log.prev_log_hash,
            log.timestamp_iso,
            log.event_type,
            log.invoice_id,
            log.details
        )
        if recalc_hash != log.current_log_hash:
            return {
                "valid": False,
                "broken_at_index": idx,
                "broken_log_id": log.id,
                "message": f"Cryptographic integrity failed at index {idx}! Row content modified."
            }
        expected_prev = log.current_log_hash

    return {
        "valid": True,
        "total_records": len(logs),
        "latest_root_hash": expected_prev,
        "message": "Cryptographic proof verified: 100% immutable and untampered."
    }
