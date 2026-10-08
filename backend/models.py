import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from backend.database import Base

def generate_uuid():
    return str(uuid.uuid4())

def get_utc_now():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    salt = Column(String, nullable=False)
    role = Column(String, nullable=False) # "FINANCE_OPERATOR" or "CHIEF_AUDITOR"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_utc_now)

    invoices = relationship("Invoice", back_populates="uploaded_by_user")

class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    normalized_name = Column(String, index=True, nullable=False)
    tax_id = Column(String, unique=True, index=True, nullable=False) # e.g., GSTIN / EIN
    bank_account_hash = Column(String, nullable=True)
    risk_tier = Column(String, default="LOW") # "LOW", "MEDIUM", "HIGH"
    default_tax_rate = Column(Float, default=0.18) # 18% standard rate
    status = Column(String, default="ACTIVE") # "ACTIVE", "UNDER_REVIEW", "BLOCKED"
    
    # Historical stats calculated from live ledger
    historical_invoice_count = Column(Integer, default=0)
    historical_total_spent = Column(Float, default=0.0)
    avg_invoice_amount = Column(Float, default=0.0)
    max_invoice_amount = Column(Float, default=0.0)
    last_transaction_date = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_utc_now)

    invoices = relationship("Invoice", back_populates="vendor")

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), nullable=True)
    uploaded_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    
    invoice_number = Column(String, index=True, nullable=False)
    normalized_invoice_num = Column(String, index=True, nullable=False)
    file_hash_sha256 = Column(String, index=True, nullable=False)
    file_path = Column(String, nullable=True)
    file_name = Column(String, nullable=False)
    file_mime = Column(String, default="application/pdf")
    file_base64 = Column(Text, nullable=True) # Direct cloud database persistence for serverless
    invoice_date = Column(String, nullable=True) # YYYY-MM-DD
    due_date = Column(String, nullable=True)
    
    # Financial amounts
    subtotal = Column(Float, default=0.0)
    claimed_tax_rate = Column(Float, default=0.0)
    claimed_tax_amount = Column(Float, default=0.0)
    calculated_tax_amount = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    currency = Column(String, default="USD")

    # Workflow & Risk Status
    approval_status = Column(String, default="PENDING") 
    # "PENDING", "APPROVED", "BLOCKED"
    risk_score = Column(Integer, default=0) # 0 to 100
    risk_level = Column(String, default="LOW") # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    
    # Structured fraud & explanation payload
    risk_breakdown = Column(JSON, nullable=True) # List of {factor, points, description}
    fraud_findings = Column(JSON, nullable=True) # List of {type, severity, evidence, explanation}
    ai_explanation = Column(JSON, nullable=True)
    adjudication_notes = Column(Text, nullable=True)
    adjudicated_by = Column(String, nullable=True)
    adjudicated_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)

    vendor = relationship("Vendor", back_populates="invoices")
    uploaded_by_user = relationship("User", back_populates="invoices")
    line_items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    duplicate_matches = relationship("DuplicateDetection", foreign_keys="DuplicateDetection.current_invoice_id", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="invoice", cascade="all, delete-orphan")
    revenue_transaction = relationship("RevenueTransaction", back_populates="invoice", uselist=False, cascade="all, delete-orphan")

class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(String, primary_key=True, default=generate_uuid)
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False)
    line_index = Column(Integer, default=1)
    description = Column(String, nullable=False)
    quantity = Column(Float, default=1.0)
    unit_price = Column(Float, default=0.0)
    claimed_total = Column(Float, default=0.0)
    calculated_total = Column(Float, default=0.0)
    discrepancy_flag = Column(Boolean, default=False)
    discrepancy_reason = Column(String, nullable=True)

    invoice = relationship("Invoice", back_populates="line_items")

class DuplicateDetection(Base):
    __tablename__ = "duplicate_detections"

    id = Column(String, primary_key=True, default=generate_uuid)
    current_invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False)
    matched_invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False)
    match_type = Column(String, nullable=False) 
    # "EXACT_FILE_HASH", "EXACT_INVOICE_NUMBER", "FUZZY_INVOICE_NUMBER", "METADATA_CLONE"
    confidence_score = Column(Float, default=1.0)
    evidence = Column(Text, nullable=False)
    created_at = Column(DateTime, default=get_utc_now)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=True)
    event_type = Column(String, nullable=False)
    severity = Column(String, default="INFO") # "INFO", "WARNING", "CRITICAL"
    actor_role = Column(String, nullable=False) # "SYSTEM", "FINANCE_OPERATOR", "CHIEF_AUDITOR"
    actor_id = Column(String, default="SYSTEM")
    actor_name = Column(String, default="System Engine")
    details = Column(JSON, nullable=False)
    prev_log_hash = Column(String, nullable=False)
    current_log_hash = Column(String, nullable=False)
    timestamp_iso = Column(String, nullable=False)
    timestamp = Column(DateTime, default=get_utc_now)

    invoice = relationship("Invoice", back_populates="audit_logs")

class RevenueTransaction(Base):
    __tablename__ = "revenue_transactions"

    id = Column(String, primary_key=True, default=generate_uuid)
    invoice_id = Column(String, ForeignKey("invoices.id"), unique=True, index=True, nullable=False)
    audit_id = Column(String, index=True, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    organization_id = Column(String, default="ORG-VERITAS-ENTERPRISE", nullable=False)
    customer_name = Column(String, default="Veritas Enterprise AP", nullable=False)
    transaction_type = Column(String, default="AUDIT", nullable=False) # "AUDIT"
    amount = Column(Float, default=5.0, nullable=False)
    currency = Column(String, default="INR", nullable=False) # "INR"
    status = Column(String, default="COMPLETED", nullable=False) # "COMPLETED", "FAILED"
    description = Column(String, default="Invoice forensic audit fee", nullable=False)
    reference_id = Column(String, unique=True, index=True, nullable=False) # e.g. "TXN-..."
    created_at = Column(DateTime, default=get_utc_now)
    completed_at = Column(DateTime, default=get_utc_now)

    invoice = relationship("Invoice", back_populates="revenue_transaction")
    user = relationship("User")

