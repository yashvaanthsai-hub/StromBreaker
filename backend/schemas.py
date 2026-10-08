from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field
from datetime import datetime

class LoginRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class VendorResponse(BaseModel):
    id: str
    name: str
    normalized_name: str
    tax_id: str
    risk_tier: str
    default_tax_rate: float
    status: str
    historical_invoice_count: int = 0
    historical_total_spent: float = 0.0
    avg_invoice_amount: float = 0.0
    max_invoice_amount: float = 0.0
    last_transaction_date: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class VendorCreateRequest(BaseModel):
    name: str
    tax_id: str
    default_tax_rate: float = Field(default=0.18, description="Contractual tax rate as decimal (e.g. 0.18 for 18%) or percentage")
    risk_tier: str = Field(default="LOW", description="LOW, MEDIUM, or HIGH")
    status: str = Field(default="ACTIVE", description="ACTIVE, UNDER_REVIEW, or BLOCKED")
    avg_invoice_amount: Optional[float] = 0.0
    max_invoice_amount: Optional[float] = 0.0

class VendorUpdateRequest(BaseModel):
    default_tax_rate: Optional[float] = None
    risk_tier: Optional[str] = None
    status: Optional[str] = None
    avg_invoice_amount: Optional[float] = None
    max_invoice_amount: Optional[float] = None
    reason: Optional[str] = None

class LineItemExtracted(BaseModel):
    line_index: int = 1
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0
    claimed_total: float = 0.0
    calculated_total: float = 0.0
    discrepancy_flag: bool = False
    discrepancy_reason: Optional[str] = None

class InvoiceExtractedData(BaseModel):
    vendor_name: str
    vendor_tax_id: Optional[str] = None
    invoice_number: str
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    currency: str = "USD"
    line_items: List[LineItemExtracted] = []
    subtotal: float = 0.0
    claimed_tax_rate: float = 0.0
    claimed_tax_amount: float = 0.0
    total_amount: float = 0.0
    confidence_score: float = 0.95

class DuplicateMatchDetail(BaseModel):
    matched_invoice_id: str
    matched_invoice_number: str
    matched_invoice_date: Optional[str]
    matched_total_amount: float
    match_type: str
    confidence_score: float
    evidence: str

class RiskFactorItem(BaseModel):
    factor: str
    points: int
    description: str

class FraudFindingItem(BaseModel):
    finding_type: str
    severity: str
    evidence: str
    explanation: str

class DashboardStatsResponse(BaseModel):
    total_invoices: int
    high_risk_invoices: int
    duplicate_invoices: int
    pending_approvals: int
    approved_invoices: int
    blocked_invoices: int
    total_volume_usd: float
    risk_distribution: Dict[str, int]
    status_distribution: Dict[str, int]
    recent_invoices: List[Dict[str, Any]]

class ApproveBlockRequest(BaseModel):
    reason: Optional[str] = None

class AuditLogResponse(BaseModel):
    id: str
    invoice_id: Optional[str]
    event_type: str
    severity: str
    actor_role: str
    actor_id: str
    actor_name: Optional[str] = "System Engine"
    details: Dict[str, Any]
    prev_log_hash: str
    current_log_hash: str
    timestamp: str
    class Config:
        from_attributes = True

class InvoiceBillingDetail(BaseModel):
    audit_status: str = "COMPLETED"
    audit_fee: float = 5.0
    currency: str = "INR"
    billing_status: str = "COMPLETED"
    transaction_id: str
    reference_id: str
    completed_at: Optional[str] = None

class RevenueTransactionResponse(BaseModel):
    id: str
    invoice_id: str
    invoice_number: Optional[str] = "N/A"
    audit_id: str
    user_id: Optional[str] = None
    customer_name: str
    transaction_type: str
    amount: float
    currency: str
    status: str
    description: str
    reference_id: str
    created_at: str
    completed_at: str

class RevenueSummaryResponse(BaseModel):
    total_revenue: float
    today_revenue: float
    this_month_revenue: float
    total_audited_invoices: int
    billable_invoices: int
    free_audits: int
    average_revenue_per_invoice: float
    current_price_per_audit: float
    currency: str

