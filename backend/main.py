import os
import shutil
import hashlib
import json
import base64
import tempfile
import asyncio
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Header, Response, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db, engine, Base, SessionLocal
from backend.models import Vendor, Invoice, InvoiceItem, DuplicateDetection, AuditLog, User, RevenueTransaction
from backend.schemas import (
    LoginRequest, AuthResponse, UserResponse, VendorResponse, VendorCreateRequest, VendorUpdateRequest, DashboardStatsResponse,
    ApproveBlockRequest, AuditLogResponse, LineItemExtracted,
    RevenueSummaryResponse, RevenueTransactionResponse, InvoiceBillingDetail
)
from backend.revenue_service import (
    record_revenue_for_audit, get_revenue_summary, get_revenue_transactions_list,
    get_revenue_chart_data, get_audit_price_inr
)
from backend.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_finance_operator, require_chief_auditor,
    ROLE_FINANCE_OPERATOR, ROLE_CHIEF_AUDITOR
)
from backend.extractor import extract_invoice
from backend.audit_engine import AuditEngine, normalize_key
from backend.audit_trail import record_audit_event, verify_audit_chain_integrity
from backend.export_service import generate_audit_csv, generate_forensic_pdf
from backend.seed_data import seed_database, generate_pdf_invoice

# Initialize database schema
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Veritas AP Audit Gateway API",
    description="Automated enterprise accounts payable audit gateway with multimodal extraction, duplicate detection, and tamper-evident audit trails.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def ensure_baseline_seeded():
    """Guarantees master vendors, users, and historical records are seeded in any cloud DB."""
    try:
        db = SessionLocal()
        if db.query(User).count() == 0 or db.query(Vendor).count() == 0:
            seed_database()
        elif db.query(RevenueTransaction).count() == 0 and db.query(Invoice).count() > 0:
            for inv in db.query(Invoice).all():
                record_revenue_for_audit(db, inv)
        db.close()
    except Exception as e:
        print(f"Startup database seeding notification: {e}")

@app.on_event("startup")
def on_startup():
    ensure_baseline_seeded()

@app.get("/api/health")
def health_check():
    ensure_baseline_seeded()
    return {"status": "ok", "service": "Veritas AP Gateway", "version": "1.0.0"}

# ====================================================================
# 1. AUTHENTICATION ENDPOINTS
# ====================================================================

@app.post("/api/auth/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    ensure_baseline_seeded()
    email_clean = req.email.strip().lower()
    user = db.query(User).filter(
        (func.lower(User.email) == email_clean) | (func.lower(User.username) == email_clean)
    ).first()

    if not user or not verify_password(req.password, user.salt, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please verify credentials."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended. Contact system administrator."
        )

    token = create_access_token(user.id, user.email, user.role)
    
    record_audit_event(
        db=db,
        event_type="USER_AUTHENTICATED",
        actor_role=user.role,
        actor_id=user.id,
        actor_name=user.full_name,
        details={"email": user.email, "role": user.role},
        severity="INFO"
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }

@app.get("/api/auth/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/api/auth/logout")
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record_audit_event(
        db=db,
        event_type="USER_LOGGED_OUT",
        actor_role=current_user.role,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        details={"email": current_user.email},
        severity="INFO"
    )
    return {"status": "success", "message": "Logged out successfully."}

# ====================================================================
# 2. DASHBOARD LIVE STATISTICS ENDPOINT
# ====================================================================

@app.get("/api/dashboard/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)):
    ensure_baseline_seeded()
    invoices = db.query(Invoice).all()

    total_invoices = len(invoices)
    high_risk_invoices = sum(1 for inv in invoices if inv.risk_score >= 60)
    pending_approvals = sum(1 for inv in invoices if inv.approval_status == "PENDING")
    approved_invoices = sum(1 for inv in invoices if inv.approval_status == "APPROVED")
    blocked_invoices = sum(1 for inv in invoices if inv.approval_status == "BLOCKED")
    
    # Duplicate invoices count
    duplicate_count = db.query(DuplicateDetection).count()
    if duplicate_count == 0:
        duplicate_count = sum(1 for inv in invoices if "DUPLICATE" in str(inv.fraud_findings or ""))

    # Total volume of approved invoices
    total_volume = sum(inv.total_amount for inv in invoices if inv.approval_status == "APPROVED")

    # Risk Distribution
    risk_distribution = {
        "LOW": sum(1 for inv in invoices if inv.risk_score < 30),
        "MEDIUM": sum(1 for inv in invoices if 30 <= inv.risk_score < 60),
        "HIGH": sum(1 for inv in invoices if 60 <= inv.risk_score < 80),
        "CRITICAL": sum(1 for inv in invoices if inv.risk_score >= 80)
    }

    # Status Distribution
    status_distribution = {
        "PENDING": pending_approvals,
        "APPROVED": approved_invoices,
        "BLOCKED": blocked_invoices
    }

    # Recent 5 invoices
    recent = (
        db.query(Invoice)
        .order_by(Invoice.created_at.desc())
        .limit(5)
        .all()
    )
    recent_list = [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "vendor_name": inv.vendor.name if inv.vendor else "Unverified Vendor",
            "total_amount": inv.total_amount,
            "risk_score": inv.risk_score,
            "risk_level": inv.risk_level,
            "approval_status": inv.approval_status,
            "created_at": inv.created_at.isoformat()
        }
        for inv in recent
    ]

    return {
        "total_invoices": total_invoices,
        "high_risk_invoices": high_risk_invoices,
        "duplicate_invoices": duplicate_count,
        "pending_approvals": pending_approvals,
        "approved_invoices": approved_invoices,
        "blocked_invoices": blocked_invoices,
        "total_volume_usd": round(total_volume, 2),
        "risk_distribution": risk_distribution,
        "status_distribution": status_distribution,
        "recent_invoices": recent_list
    }

# ====================================================================
# 3. VENDOR DATABASE ENDPOINTS
# ====================================================================

@app.get("/api/vendors", response_model=List[VendorResponse])
def get_vendors(db: Session = Depends(get_db)):
    ensure_baseline_seeded()
    return db.query(Vendor).all()

@app.post("/api/vendors", response_model=VendorResponse)
def create_vendor(
    req: VendorCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ensure_baseline_seeded()
    norm_name = normalize_key(req.name)
    tax_clean = req.tax_id.strip()

    # Check for existing vendor with same tax ID or normalized name
    existing = db.query(Vendor).filter((Vendor.tax_id == tax_clean) | (Vendor.normalized_name == norm_name)).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Vendor already registered with Tax ID '{existing.tax_id}' or Name '{existing.name}'."
        )

    # Normalize tax rate: if user entered e.g. 18 or 18.0, convert to 0.18
    tax_rate = float(req.default_tax_rate)
    if tax_rate > 1.0:
        tax_rate = tax_rate / 100.0

    new_vendor = Vendor(
        name=req.name.strip(),
        normalized_name=norm_name,
        tax_id=tax_clean,
        risk_tier=req.risk_tier.upper(),
        default_tax_rate=tax_rate,
        status=req.status.upper(),
        avg_invoice_amount=float(req.avg_invoice_amount or 0.0),
        max_invoice_amount=float(req.max_invoice_amount or 0.0)
    )
    db.add(new_vendor)
    db.commit()
    db.refresh(new_vendor)

    record_audit_event(
        db=db,
        event_type="VENDOR_REGISTERED",
        actor_role=current_user.role,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        details={
            "vendor_id": new_vendor.id,
            "vendor_name": new_vendor.name,
            "tax_id": new_vendor.tax_id,
            "default_tax_rate": new_vendor.default_tax_rate,
            "risk_tier": new_vendor.risk_tier,
            "registered_by": current_user.username
        },
        severity="INFO"
    )

    return new_vendor

@app.get("/api/vendors/template.csv")
def download_vendor_csv_template():
    csv_content = (
        "name,tax_id,default_tax_rate,risk_tier,avg_invoice_amount,max_invoice_amount\n"
        "Global Freight Logistics Inc,US-EIN-9921443,18.0,LOW,15000,50000\n"
        "Delta Precision Instruments,IN-GST-29AABCD1122K1Z8,12.0,MEDIUM,8500,25000\n"
        "Apex Steelworks Ltd,US-EIN-7729104,18.0,LOW,35000,100000\n"
        "CyberSecure Cloud Host,US-EIN-4419208,5.0,LOW,2200,10000\n"
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="veritas_vendor_import_template.csv"'}
    )

@app.post("/api/vendors/import-csv")
async def import_vendors_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ensure_baseline_seeded()
    import csv
    import io

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    created_count = 0
    updated_count = 0

    for row in reader:
        # Normalize keys
        row_norm = {k.strip().lower(): v.strip() for k, v in row.items() if k}
        name = row_norm.get("name") or row_norm.get("vendor_name")
        tax_id = row_norm.get("tax_id") or row_norm.get("ein") or row_norm.get("gstin")
        if not name or not tax_id:
            continue

        raw_rate = row_norm.get("default_tax_rate") or row_norm.get("tax_rate") or "18.0"
        try:
            rate_val = float(raw_rate.replace("%", "").strip())
            if rate_val > 1.0:
                rate_val = rate_val / 100.0
        except ValueError:
            rate_val = 0.18

        risk_tier = (row_norm.get("risk_tier") or "LOW").upper()
        if risk_tier not in ["LOW", "MEDIUM", "HIGH"]:
            risk_tier = "LOW"

        try:
            avg_amt = float(row_norm.get("avg_invoice_amount") or 0.0)
        except ValueError:
            avg_amt = 0.0

        try:
            max_amt = float(row_norm.get("max_invoice_amount") or 0.0)
        except ValueError:
            max_amt = 0.0

        norm_name = normalize_key(name)
        existing = db.query(Vendor).filter((Vendor.tax_id == tax_id) | (Vendor.normalized_name == norm_name)).first()

        if existing:
            existing.default_tax_rate = rate_val
            existing.risk_tier = risk_tier
            if avg_amt > 0: existing.avg_invoice_amount = avg_amt
            if max_amt > 0: existing.max_invoice_amount = max_amt
            updated_count += 1
        else:
            new_v = Vendor(
                name=name,
                normalized_name=norm_name,
                tax_id=tax_id,
                default_tax_rate=rate_val,
                risk_tier=risk_tier,
                status="ACTIVE",
                avg_invoice_amount=avg_amt,
                max_invoice_amount=max_amt
            )
            db.add(new_v)
            created_count += 1

    db.commit()

    record_audit_event(
        db=db,
        event_type="VENDORS_BULK_IMPORTED",
        actor_role=current_user.role,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        details={
            "file_name": file.filename,
            "created_count": created_count,
            "updated_count": updated_count,
            "imported_by": current_user.username
        },
        severity="INFO"
    )

    return {
        "status": "success",
        "created_count": created_count,
        "updated_count": updated_count,
        "message": f"Successfully imported {created_count} new vendors and updated {updated_count} existing vendors."
    }

@app.get("/api/vendors/{vendor_id}")
def get_vendor_detail(vendor_id: str, db: Session = Depends(get_db)):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor record not found.")

    vendor_invoices = db.query(Invoice).filter(Invoice.vendor_id == vendor_id).order_by(Invoice.created_at.desc()).all()
    return {
        "vendor": {
            "id": vendor.id,
            "name": vendor.name,
            "tax_id": vendor.tax_id,
            "risk_tier": vendor.risk_tier,
            "default_tax_rate": vendor.default_tax_rate,
            "status": vendor.status,
            "historical_invoice_count": vendor.historical_invoice_count,
            "historical_total_spent": vendor.historical_total_spent,
            "avg_invoice_amount": vendor.avg_invoice_amount,
            "max_invoice_amount": vendor.max_invoice_amount,
            "last_transaction_date": vendor.last_transaction_date
        },
        "invoices": [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "invoice_date": inv.invoice_date,
                "total_amount": inv.total_amount,
                "risk_score": inv.risk_score,
                "approval_status": inv.approval_status
            }
            for inv in vendor_invoices
        ]
    }

@app.post("/api/vendors/{vendor_id}/status")
def update_vendor_status(
    vendor_id: str,
    status: str = Query(..., pattern="^(ACTIVE|UNDER_REVIEW|BLOCKED)$"),
    current_user: User = Depends(require_chief_auditor),
    db: Session = Depends(get_db)
):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found.")

    old_status = vendor.status
    vendor.status = status.upper()
    db.commit()

    record_audit_event(
        db=db,
        event_type="VENDOR_STATUS_ALTERED",
        actor_role=current_user.role,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        details={"vendor_id": vendor_id, "vendor_name": vendor.name, "old_status": old_status, "new_status": vendor.status},
        severity="WARNING"
    )
    return {"status": "success", "vendor_id": vendor_id, "new_status": vendor.status}

@app.put("/api/vendors/{vendor_id}", response_model=VendorResponse)
def update_vendor(
    vendor_id: str,
    req: VendorUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor record not found.")

    old_tax_rate = vendor.default_tax_rate
    old_status = vendor.status

    if req.default_tax_rate is not None:
        rate = float(req.default_tax_rate)
        if rate > 1.0:
            rate = rate / 100.0
        vendor.default_tax_rate = rate

    if req.risk_tier:
        vendor.risk_tier = req.risk_tier.upper()

    if req.status:
        vendor.status = req.status.upper()

    if req.avg_invoice_amount is not None:
        vendor.avg_invoice_amount = float(req.avg_invoice_amount)

    if req.max_invoice_amount is not None:
        vendor.max_invoice_amount = float(req.max_invoice_amount)

    db.commit()
    db.refresh(vendor)

    record_audit_event(
        db=db,
        event_type="VENDOR_CONTRACT_RATE_UPDATED",
        actor_role=current_user.role,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        details={
            "vendor_id": vendor.id,
            "vendor_name": vendor.name,
            "old_tax_rate": old_tax_rate,
            "new_tax_rate": vendor.default_tax_rate,
            "risk_tier": vendor.risk_tier,
            "status": vendor.status,
            "reason": req.reason or "Contractual statutory tax rate updated directly via UI."
        },
        severity="INFO"
    )

    return vendor

# ====================================================================
# 4. INVOICES INTAKE, EXTRACTION & INSPECTION
# ====================================================================

@app.get("/api/invoices")
def list_invoices(
    status_filter: Optional[str] = Query(None, alias="status"),
    risk_filter: Optional[str] = Query(None, alias="risk"),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ensure_baseline_seeded()
    query = db.query(Invoice)

    if status_filter and status_filter.upper() != "ALL":
        query = query.filter(Invoice.approval_status == status_filter.upper())
    
    if risk_filter and risk_filter.upper() != "ALL":
        query = query.filter(Invoice.risk_level == risk_filter.upper())

    if search:
        search_norm = f"%{search.strip()}%"
        query = query.filter(
            (Invoice.invoice_number.ilike(search_norm)) |
            (Invoice.file_name.ilike(search_norm))
        )

    invoices = query.order_by(Invoice.created_at.desc()).all()
    out = []
    for inv in invoices:
        out.append({
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "vendor_name": inv.vendor.name if inv.vendor else "Unverified Vendor",
            "vendor_tax_id": inv.vendor.tax_id if inv.vendor else None,
            "file_name": inv.file_name,
            "invoice_date": inv.invoice_date,
            "subtotal": inv.subtotal,
            "claimed_tax_rate": inv.claimed_tax_rate,
            "claimed_tax_amount": inv.claimed_tax_amount,
            "calculated_tax_amount": inv.calculated_tax_amount,
            "total_amount": inv.total_amount,
            "currency": inv.currency,
            "approval_status": inv.approval_status,
            "risk_score": inv.risk_score,
            "risk_level": inv.risk_level,
            "created_at": inv.created_at.isoformat()
        })
    return out

@app.get("/api/invoices/{invoice_id}/file")
def get_invoice_file(invoice_id: str, db: Session = Depends(get_db)):
    """Streams document binary directly from cloud database base64 storage."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv or not inv.file_base64:
        if inv and inv.file_path and os.path.exists(inv.file_path):
            return FileResponse(inv.file_path, media_type=inv.file_mime or "application/pdf")
        raise HTTPException(status_code=404, detail="Invoice document content not found.")

    raw_data = base64.b64decode(inv.file_base64)
    return Response(content=raw_data, media_type=inv.file_mime or "application/pdf")

@app.get("/api/invoices/{invoice_id}")
def get_invoice_detail(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    line_items = [
        {
            "line_index": item.line_index,
            "description": item.description,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "claimed_total": item.claimed_total,
            "calculated_total": item.calculated_total,
            "discrepancy_flag": item.discrepancy_flag,
            "discrepancy_reason": item.discrepancy_reason
        }
        for item in inv.line_items
    ]

    matched_invoice = None
    dup = db.query(DuplicateDetection).filter(DuplicateDetection.current_invoice_id == inv.id).first()
    if dup:
        matched_inv = db.query(Invoice).filter(Invoice.id == dup.matched_invoice_id).first()
        if matched_inv:
            matched_invoice = {
                "id": matched_inv.id,
                "invoice_number": matched_inv.invoice_number,
                "invoice_date": matched_inv.invoice_date,
                "subtotal": matched_inv.subtotal,
                "tax_amount": matched_inv.claimed_tax_amount,
                "total_amount": matched_inv.total_amount,
                "approval_status": matched_inv.approval_status,
                "file_name": matched_inv.file_name,
                "file_path": f"/api/invoices/{matched_inv.id}/file",
                "match_type": dup.match_type,
                "evidence": dup.evidence
            }

    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "vendor": {
            "id": inv.vendor.id,
            "name": inv.vendor.name,
            "tax_id": inv.vendor.tax_id,
            "default_tax_rate": inv.vendor.default_tax_rate,
            "status": inv.vendor.status,
            "historical_invoice_count": inv.vendor.historical_invoice_count,
            "historical_total_spent": inv.vendor.historical_total_spent
        } if inv.vendor else None,
        "uploaded_by_user": {
            "id": inv.uploaded_by_user.id,
            "full_name": inv.uploaded_by_user.full_name,
            "email": inv.uploaded_by_user.email,
            "role": inv.uploaded_by_user.role
        } if inv.uploaded_by_user else None,
        "file_name": inv.file_name,
        "file_url": f"/api/invoices/{inv.id}/file",
        "file_hash_sha256": inv.file_hash_sha256,
        "invoice_date": inv.invoice_date,
        "due_date": inv.due_date,
        "subtotal": inv.subtotal,
        "claimed_tax_rate": inv.claimed_tax_rate,
        "claimed_tax_amount": inv.claimed_tax_amount,
        "calculated_tax_amount": inv.calculated_tax_amount,
        "total_amount": inv.total_amount,
        "currency": inv.currency,
        "approval_status": inv.approval_status,
        "risk_score": inv.risk_score,
        "risk_level": inv.risk_level,
        "risk_breakdown": inv.risk_breakdown or [],
        "fraud_findings": inv.fraud_findings or [],
        "ai_explanation": inv.ai_explanation,
        "adjudication_notes": inv.adjudication_notes,
        "adjudicated_by": inv.adjudicated_by,
        "adjudicated_at": inv.adjudicated_at.isoformat() if inv.adjudicated_at else None,
        "line_items": line_items,
        "matched_duplicate": matched_invoice,
        "created_at": inv.created_at.isoformat(),
        "billing": {
            "audit_status": "COMPLETED",
            "audit_fee": inv.revenue_transaction.amount if inv.revenue_transaction else get_audit_price_inr(),
            "currency": inv.revenue_transaction.currency if inv.revenue_transaction else "INR",
            "billing_status": inv.revenue_transaction.status if inv.revenue_transaction else "COMPLETED",
            "transaction_id": inv.revenue_transaction.reference_id if inv.revenue_transaction else f"TXN-{inv.id[:8].upper()}",
            "reference_id": inv.revenue_transaction.reference_id if inv.revenue_transaction else f"TXN-{inv.id[:8].upper()}",
            "completed_at": inv.revenue_transaction.completed_at.isoformat() if (inv.revenue_transaction and inv.revenue_transaction.completed_at) else inv.created_at.isoformat()
        } if inv.revenue_transaction or inv.approval_status in ["APPROVED", "BLOCKED", "PENDING"] else None
    }

@app.post("/api/invoices/upload")
async def upload_invoice(
    file: UploadFile = File(...),
    current_user: User = Depends(require_finance_operator),
    db: Session = Depends(get_db)
):
    safe_filename = os.path.basename(file.filename or "invoice.pdf")
    
    # Validation: File extensions
    allowed_extensions = {".pdf", ".png", ".jpg", ".jpeg"}
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Veritas AP Gateway accepts PDF, PNG, JPG, or JPEG."
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds enterprise ceiling of 10MB.")

    # 1. Compute SHA-256 fingerprint
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    file_b64 = base64.b64encode(file_bytes).decode("utf-8")
    content_type = file.content_type or ("application/pdf" if ext == ".pdf" else "image/png")

    # 2. Extract structured fields via temporary file
    tmp_file = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    tmp_path = tmp_file.name
    try:
        tmp_file.write(file_bytes)
        tmp_file.close()
        extracted = extract_invoice(tmp_path, content_type)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    # 3. Deterministic Audit & Fraud Pipeline
    audit_results = AuditEngine.execute_full_audit(db, file_hash, extracted)

    vendor = audit_results["vendor"]
    approval_status = audit_results["approval_status"]
    risk_score = audit_results["risk_score"]
    risk_level = audit_results["risk_level"]
    explanation = audit_results["ai_explanation"]

    # 4. Save Invoice with file_base64 in database
    invoice = Invoice(
        vendor_id=vendor.id if vendor else None,
        uploaded_by_user_id=current_user.id,
        invoice_number=extracted.invoice_number,
        normalized_invoice_num=normalize_key(extracted.invoice_number),
        file_hash_sha256=file_hash,
        file_path="",
        file_name=safe_filename,
        file_mime=content_type,
        file_base64=file_b64,
        invoice_date=extracted.invoice_date,
        due_date=extracted.due_date,
        subtotal=extracted.subtotal,
        claimed_tax_rate=extracted.claimed_tax_rate,
        claimed_tax_amount=extracted.claimed_tax_amount,
        calculated_tax_amount=audit_results["calculated_tax_amount"],
        total_amount=extracted.total_amount,
        currency=extracted.currency,
        approval_status=approval_status,
        risk_score=risk_score,
        risk_level=risk_level,
        risk_breakdown=audit_results["risk_breakdown"],
        fraud_findings=audit_results["fraud_findings"],
        ai_explanation=explanation
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    # 5. Save Line Items
    for item in extracted.line_items:
        inv_item = InvoiceItem(
            invoice_id=invoice.id,
            line_index=item.line_index,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            claimed_total=item.claimed_total,
            calculated_total=item.calculated_total,
            discrepancy_flag=item.discrepancy_flag,
            discrepancy_reason=item.discrepancy_reason
        )
        db.add(inv_item)
    
    # 6. Record Duplicate Detection if found
    if audit_results["is_duplicate"] and audit_results["duplicate_detail"]:
        dup_det = DuplicateDetection(
            current_invoice_id=invoice.id,
            matched_invoice_id=audit_results["duplicate_detail"].matched_invoice_id,
            match_type=audit_results["duplicate_detail"].match_type,
            confidence_score=audit_results["duplicate_detail"].confidence_score,
            evidence=audit_results["duplicate_detail"].evidence
        )
        db.add(dup_det)

    db.commit()

    # 7. Record Immutable Audit Events
    record_audit_event(
        db=db,
        event_type="DOCUMENT_INTAKE_UPLOAD",
        actor_role=current_user.role,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        details={"file_name": safe_filename, "file_hash": file_hash, "file_size": len(file_bytes)},
        invoice_id=invoice.id,
        severity="INFO"
    )

    if audit_results["is_duplicate"]:
        record_audit_event(
            db=db,
            event_type="DUPLICATE_COLLISION_FLAGGED",
            actor_role="SYSTEM",
            details=audit_results["duplicate_detail"].dict(),
            invoice_id=invoice.id,
            severity="CRITICAL"
        )

    for finding in audit_results["fraud_findings"]:
        if finding["finding_type"] != "DUPLICATE_INVOICE":
            record_audit_event(
                db=db,
                event_type=f"DISCREPANCY_{finding['finding_type']}",
                actor_role="SYSTEM",
                details=finding,
                invoice_id=invoice.id,
                severity=finding["severity"]
            )

    record_audit_event(
        db=db,
        event_type="INITIAL_AUDIT_STATE_DETERMINED",
        actor_role="SYSTEM",
        details={"status": approval_status, "risk_score": risk_score, "risk_level": risk_level},
        invoice_id=invoice.id,
        severity="CRITICAL" if risk_score >= 60 else "INFO"
    )

    # 8. Idempotent Revenue Transaction for Completed Audit
    rev_txn = record_revenue_for_audit(db=db, invoice=invoice, user=current_user)

    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "vendor_name": vendor.name if vendor else "Unverified Vendor",
        "total_amount": invoice.total_amount,
        "file_hash": invoice.file_hash_sha256,
        "approval_status": approval_status,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "is_duplicate": audit_results["is_duplicate"],
        "explanation": explanation,
        "findings": audit_results["fraud_findings"],
        "risk_breakdown": audit_results["risk_breakdown"],
        "billing": {
            "audit_status": "COMPLETED",
            "audit_fee": rev_txn.amount,
            "currency": rev_txn.currency,
            "billing_status": rev_txn.status,
            "transaction_id": rev_txn.reference_id,
            "reference_id": rev_txn.reference_id,
            "completed_at": rev_txn.completed_at.isoformat() if rev_txn.completed_at else None
        }
    }

# ====================================================================
# 5. APPROVAL WORKFLOW ACTIONS (CHIEF AUDITOR ONLY)
# ====================================================================

@app.post("/api/invoices/{invoice_id}/approve")
def approve_invoice(
    invoice_id: str,
    req: ApproveBlockRequest,
    current_user: User = Depends(require_chief_auditor),
    db: Session = Depends(get_db)
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    old_status = inv.approval_status
    inv.approval_status = "APPROVED"
    inv.adjudication_notes = req.reason or "Approved by Chief Auditor after manual compliance review."
    inv.adjudicated_by = current_user.full_name
    from datetime import datetime, timezone
    inv.adjudicated_at = datetime.now(timezone.utc)
    db.commit()

    record_audit_event(
        db=db,
        event_type="AUDITOR_APPROVAL_GRANTED",
        actor_role=current_user.role,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        details={
            "invoice_id": invoice_id,
            "old_status": old_status,
            "new_status": "APPROVED",
            "reason": inv.adjudication_notes
        },
        invoice_id=invoice_id,
        severity="INFO"
    )

    return {"status": "success", "invoice_id": invoice_id, "approval_status": "APPROVED"}

@app.post("/api/invoices/{invoice_id}/block")
def block_invoice(
    invoice_id: str,
    req: ApproveBlockRequest,
    current_user: User = Depends(require_chief_auditor),
    db: Session = Depends(get_db)
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    old_status = inv.approval_status
    inv.approval_status = "BLOCKED"
    inv.adjudication_notes = req.reason or "Confirmed fraud or critical discrepancy. Disbursement permanently blocked."
    inv.adjudicated_by = current_user.full_name
    from datetime import datetime, timezone
    inv.adjudicated_at = datetime.now(timezone.utc)
    db.commit()

    record_audit_event(
        db=db,
        event_type="AUDITOR_INVOICE_BLOCKED",
        actor_role=current_user.role,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        details={
            "invoice_id": invoice_id,
            "old_status": old_status,
            "new_status": "BLOCKED",
            "reason": inv.adjudication_notes
        },
        invoice_id=invoice_id,
        severity="CRITICAL"
    )

    return {"status": "success", "invoice_id": invoice_id, "approval_status": "BLOCKED"}

# ====================================================================
# 6. AUDIT TRAIL & FORENSIC EXPORTS
# ====================================================================

@app.get("/api/audit-logs")
def get_audit_logs(db: Session = Depends(get_db)):
    ensure_baseline_seeded()
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).all()
    return [
        {
            "id": l.id,
            "invoice_id": l.invoice_id,
            "event_type": l.event_type,
            "severity": l.severity,
            "actor_role": l.actor_role,
            "actor_id": l.actor_id,
            "actor_name": l.actor_name or "System Engine",
            "details": l.details,
            "prev_log_hash": l.prev_log_hash,
            "current_log_hash": l.current_log_hash,
            "timestamp": l.timestamp_iso
        }
        for l in logs
    ]

@app.get("/api/audit-logs/verify")
def verify_audit_logs(db: Session = Depends(get_db)):
    return verify_audit_chain_integrity(db)

@app.get("/api/export/audit-trail.csv")
def export_csv_trail(db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.asc()).all()
    csv_data = generate_audit_csv(logs)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="veritas_audit_trail.csv"'}
    )

@app.get("/api/export/forensic-packet/{invoice_id}.pdf")
def export_forensic_packet(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    
    logs = db.query(AuditLog).filter(AuditLog.invoice_id == invoice_id).order_by(AuditLog.timestamp.asc()).all()
    if not logs:
        logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(8).all()

    tmp_report = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    report_path = tmp_report.name
    tmp_report.close()

    try:
        generate_forensic_pdf(inv, logs, report_path)
        with open(report_path, "rb") as f:
            pdf_bytes = f.read()
    finally:
        try:
            os.remove(report_path)
        except OSError:
            pass

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="VERITAS_FORENSIC_AUDIT_{inv.invoice_number}.pdf"'}
    )

# ====================================================================
# 7. DEMO FILES & RESET ENDPOINTS
# ====================================================================

@app.get("/api/demo-files/{filename}")
def get_demo_file(filename: str):
    safe_name = os.path.basename(filename)
    path = os.path.join("storage/invoices", safe_name)
    if os.path.exists(path):
        return FileResponse(path, filename=safe_name, media_type="application/pdf")
    
    tmp_path = os.path.join(tempfile.gettempdir(), safe_name)
    if "abc" in safe_name or "1042" in safe_name or "competition" in safe_name:
        generate_pdf_invoice(tmp_path, {
            "vendor_name": "ABC Supplies Pvt Ltd",
            "tax_id": "IN-GST-27AABCA1042K1Z5",
            "invoice_number": "INV-2026-1042",
            "date": "2026-10-08",
            "due_date": "2026-11-08",
            "items": [
                {"description": "Industrial Grade Raw Material Batch A", "qty": 100, "unit_price": 3500.00, "total": 350000.00},
                {"description": "High-Capacity Pneumatic Valves", "qty": 30, "unit_price": 5000.00, "total": 150000.00}
            ],
            "subtotal": 500000.00,
            "tax_rate_percent": 28.0,
            "tax_amount": 140000.00,
            "total": 640000.00
        })
    elif "clean" in safe_name:
        generate_pdf_invoice(tmp_path, {
            "vendor_name": "Apex Industrial Supplies Ltd",
            "tax_id": "US-EIN-8839210",
            "invoice_number": "INV-2024-9899",
            "date": "2024-10-06",
            "due_date": "2024-11-06",
            "items": [
                {"description": "Heavy Duty Conveyor Belt 100m", "qty": 2, "unit_price": 1850.00, "total": 3700.00},
                {"description": "Precision Ball Bearings SKF-6205", "qty": 40, "unit_price": 45.00, "total": 1800.00}
            ],
            "subtotal": 5500.00,
            "tax_rate_percent": 18.0,
            "tax_amount": 990.00,
            "total": 6490.00
        })
    else:
        generate_pdf_invoice(tmp_path, {
            "vendor_name": "Apex Industrial Supplies Ltd",
            "tax_id": "US-EIN-8839210",
            "invoice_number": "INV-2024-9821",
            "date": "2024-10-07",
            "due_date": "2024-11-07",
            "items": [
                {"description": "High-Tensile Structural Fasteners M16", "qty": 250, "unit_price": 20.00, "total": 5000.00},
                {"description": "Industrial Grade Hydraulic Lubricant 55 Gal", "qty": 15, "unit_price": 300.00, "total": 4500.00},
                {"description": "Pneumatic Control Valve Assembly", "qty": 10, "unit_price": 300.00, "total": 3000.00}
            ],
            "subtotal": 12500.00,
            "tax_rate_percent": 12.0,
            "tax_amount": 1500.00,
            "total": 14000.00
        })

    return FileResponse(tmp_path, filename=safe_name, media_type="application/pdf")

# ====================================================================
# 7. REVENUE & BILLING (CHIEF AUDITOR ONLY & PER-INVOICE)
# ====================================================================

@app.get("/api/invoices/{invoice_id}/billing", response_model=InvoiceBillingDetail)
def get_invoice_billing_detail(
    invoice_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    
    rev_txn = db.query(RevenueTransaction).filter(RevenueTransaction.invoice_id == inv.id).first()
    if not rev_txn and inv.approval_status in ["APPROVED", "BLOCKED", "PENDING"]:
        rev_txn = record_revenue_for_audit(db=db, invoice=inv, user=current_user)

    if not rev_txn:
        raise HTTPException(status_code=404, detail="No billing transaction recorded for this invoice.")

    return {
        "audit_status": "COMPLETED",
        "audit_fee": rev_txn.amount,
        "currency": rev_txn.currency,
        "billing_status": rev_txn.status,
        "transaction_id": rev_txn.reference_id,
        "reference_id": rev_txn.reference_id,
        "completed_at": rev_txn.completed_at.isoformat() if rev_txn.completed_at else None
    }

@app.get("/api/revenue/summary", response_model=RevenueSummaryResponse)
def get_revenue_summary_endpoint(
    current_user: User = Depends(require_chief_auditor),
    db: Session = Depends(get_db)
):
    ensure_baseline_seeded()
    return get_revenue_summary(db)

@app.get("/api/revenue/transactions", response_model=List[RevenueTransactionResponse])
def get_revenue_transactions_endpoint(
    search: Optional[str] = Query(None),
    current_user: User = Depends(require_chief_auditor),
    db: Session = Depends(get_db)
):
    ensure_baseline_seeded()
    return get_revenue_transactions_list(db, search=search)

@app.get("/api/revenue/chart")
def get_revenue_chart_endpoint(
    current_user: User = Depends(require_chief_auditor),
    db: Session = Depends(get_db)
):
    ensure_baseline_seeded()
    return get_revenue_chart_data(db)

@app.get("/api/revenue/export-csv")
def export_revenue_csv_endpoint(
    current_user: User = Depends(require_chief_auditor),
    db: Session = Depends(get_db)
):
    import io
    import csv
    ensure_baseline_seeded()
    txns = db.query(RevenueTransaction).order_by(RevenueTransaction.completed_at.asc()).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Transaction ID",
        "Invoice ID",
        "Invoice Number",
        "Audit ID",
        "Date",
        "Customer",
        "Transaction Type",
        "Amount",
        "Currency",
        "Status",
        "Reference ID"
    ])
    for t in txns:
        inv_num = t.invoice.invoice_number if t.invoice else "N/A"
        date_str = t.completed_at.strftime("%Y-%m-%d %H:%M:%S") if t.completed_at else (t.created_at.strftime("%Y-%m-%d %H:%M:%S") if t.created_at else "")
        writer.writerow([
            t.id,
            t.invoice_id,
            inv_num,
            t.audit_id,
            date_str,
            t.customer_name,
            t.transaction_type,
            f"{t.amount:.2f}",
            t.currency,
            t.status,
            t.reference_id
        ])
    
    csv_bytes = output.getvalue().encode("utf-8")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="veritas_revenue_transactions.csv"'}
    )

@app.post("/api/reset-demo")
def reset_demo(db: Session = Depends(get_db)):
    db.query(RevenueTransaction).delete()
    db.query(DuplicateDetection).delete()
    db.query(InvoiceItem).delete()
    db.query(AuditLog).delete()
    db.query(Invoice).delete()
    db.query(Vendor).delete()
    db.query(User).delete()
    db.commit()
    seed_database()
    return {"status": "success", "message": "Demo state reset and historical database re-seeded."}

# Mount compiled React frontend if present
dist_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
