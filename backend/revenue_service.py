import os
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models import RevenueTransaction, Invoice, User
from backend.audit_trail import record_audit_event

DEFAULT_AUDIT_PRICE_INR = 5.0
DEFAULT_CURRENCY = "INR"

def get_audit_price_inr() -> float:
    """Reads configured price from server environment variable AUDIT_PRICE_INR."""
    try:
        raw_val = os.getenv("AUDIT_PRICE_INR", "5")
        price = float(raw_val)
        return price if price > 0 else DEFAULT_AUDIT_PRICE_INR
    except (ValueError, TypeError):
        return DEFAULT_AUDIT_PRICE_INR

def record_revenue_for_audit(
    db: Session,
    invoice: Invoice,
    user: Optional[User] = None
) -> RevenueTransaction:
    """
    Idempotent billing logic for invoice audits.
    Guarantees exactly ONE completed revenue transaction per audited invoice.
    Double-billing is prevented both programmatically and via database unique constraint.
    """
    # 1. Check if a revenue transaction already exists for this invoice
    existing_txn = db.query(RevenueTransaction).filter(
        RevenueTransaction.invoice_id == invoice.id
    ).first()
    if existing_txn:
        return existing_txn

    # 2. Determine price server-side
    price = get_audit_price_inr()
    reference_id = f"TXN-{uuid.uuid4().hex[:10].upper()}"
    audit_id = f"AUDIT-{invoice.id[:8].upper()}"
    now = datetime.now(timezone.utc)

    customer_name = "Veritas Enterprise Client"
    if invoice.vendor and invoice.vendor.name:
        customer_name = f"{invoice.vendor.name} (Audited Account)"

    # 3. Create persistent RevenueTransaction
    txn = RevenueTransaction(
        invoice_id=invoice.id,
        audit_id=audit_id,
        user_id=user.id if user else invoice.uploaded_by_user_id,
        organization_id="ORG-VERITAS-GLOBAL",
        customer_name=customer_name,
        transaction_type="AUDIT",
        amount=price,
        currency=DEFAULT_CURRENCY,
        status="COMPLETED",
        description=f"Automated forensic audit fee for invoice #{invoice.invoice_number}",
        reference_id=reference_id,
        created_at=now,
        completed_at=now
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    # 4. Record tamper-evident SHA-256 audit log
    record_audit_event(
        db=db,
        event_type="REVENUE_TRANSACTION_RECORDED",
        actor_role="SYSTEM",
        actor_id=user.id if user else "SYSTEM",
        actor_name=user.full_name if user else "Veritas Billing Engine",
        details={
            "transaction_id": txn.id,
            "reference_id": txn.reference_id,
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "audit_fee": price,
            "currency": DEFAULT_CURRENCY,
            "status": "COMPLETED"
        },
        invoice_id=invoice.id,
        severity="INFO"
    )

    return txn

def get_revenue_summary(db: Session) -> Dict[str, Any]:
    """Dynamically calculates revenue metrics from live database records."""
    total_rev = db.query(func.sum(RevenueTransaction.amount)).filter(
        RevenueTransaction.status == "COMPLETED"
    ).scalar() or 0.0

    total_audited = db.query(Invoice).count()
    billable_count = db.query(RevenueTransaction).filter(
        RevenueTransaction.status == "COMPLETED"
    ).count()

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    today_rev = db.query(func.sum(RevenueTransaction.amount)).filter(
        RevenueTransaction.status == "COMPLETED",
        RevenueTransaction.completed_at >= today_start
    ).scalar() or 0.0

    month_rev = db.query(func.sum(RevenueTransaction.amount)).filter(
        RevenueTransaction.status == "COMPLETED",
        RevenueTransaction.completed_at >= month_start
    ).scalar() or 0.0

    avg_rev = (total_rev / billable_count) if billable_count > 0 else 0.0
    current_price = get_audit_price_inr()

    return {
        "total_revenue": round(float(total_rev), 2),
        "today_revenue": round(float(today_rev), 2),
        "this_month_revenue": round(float(month_rev), 2),
        "total_audited_invoices": total_audited,
        "billable_invoices": billable_count,
        "free_audits": max(0, total_audited - billable_count),
        "average_revenue_per_invoice": round(float(avg_rev), 2),
        "current_price_per_audit": current_price,
        "currency": DEFAULT_CURRENCY
    }

def get_revenue_transactions_list(
    db: Session,
    search: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """Fetches real revenue transactions joined with invoice numbers."""
    query = db.query(RevenueTransaction).order_by(RevenueTransaction.completed_at.desc())

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (RevenueTransaction.reference_id.ilike(s)) |
            (RevenueTransaction.customer_name.ilike(s)) |
            (RevenueTransaction.audit_id.ilike(s))
        )

    txns = query.limit(limit).all()
    out = []
    for t in txns:
        inv_num = t.invoice.invoice_number if t.invoice else "N/A"
        out.append({
            "id": t.id,
            "invoice_id": t.invoice_id,
            "invoice_number": inv_num,
            "audit_id": t.audit_id,
            "user_id": t.user_id,
            "customer_name": t.customer_name,
            "transaction_type": t.transaction_type,
            "amount": t.amount,
            "currency": t.currency,
            "status": t.status,
            "description": t.description,
            "reference_id": t.reference_id,
            "created_at": t.created_at.isoformat() if t.created_at else "",
            "completed_at": t.completed_at.isoformat() if t.completed_at else ""
        })
    return out

def get_revenue_chart_data(db: Session) -> List[Dict[str, Any]]:
    """Aggregates revenue transactions by date for live charting."""
    txns = db.query(RevenueTransaction).filter(
        RevenueTransaction.status == "COMPLETED"
    ).order_by(RevenueTransaction.completed_at.asc()).all()

    buckets: Dict[str, Dict[str, Any]] = {}
    for t in txns:
        if t.completed_at:
            date_str = t.completed_at.strftime("%Y-%m-%d")
        elif t.created_at:
            date_str = t.created_at.strftime("%Y-%m-%d")
        else:
            date_str = "Recent"

        if date_str not in buckets:
            buckets[date_str] = {
                "date": date_str,
                "amount": 0.0,
                "audit_count": 0
            }
        buckets[date_str]["amount"] += t.amount
        buckets[date_str]["audit_count"] += 1

    result = list(buckets.values())
    result.sort(key=lambda x: x["date"])
    return result
