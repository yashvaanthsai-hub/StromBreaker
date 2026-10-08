import os
import hashlib
import tempfile
import base64
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from backend.database import SessionLocal, engine, Base
from backend.models import User, Vendor, Invoice, InvoiceItem, AuditLog, RevenueTransaction
from backend.auth import hash_password
from backend.audit_trail import record_audit_event
from backend.revenue_service import record_revenue_for_audit

def normalize_text(text: str) -> str:
    return "".join(c for c in text.lower() if c.isalnum())

def compute_file_sha256(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def generate_pdf_invoice(file_path: str, invoice_data: dict):
    doc = SimpleDocTemplate(file_path, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'InvoiceTitle',
        parent=styles['Heading1'],
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#1e293b")
    )
    
    meta_style = ParagraphStyle(
        'MetaStyle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569")
    )
    
    story = []
    
    # Header Banner
    story.append(Paragraph(f"<b>COMMERCIAL INVOICE</b>", title_style))
    story.append(Spacer(1, 10))
    
    header_data = [
        [
            Paragraph(f"<b>Vendor:</b> {invoice_data['vendor_name']}<br/><b>Tax ID / EIN:</b> {invoice_data['tax_id']}<br/>104 Enterprise Way, Suite 400<br/>Chicago, IL 60601", meta_style),
            Paragraph(f"<b>Invoice #:</b> <font color='#2563eb'><b>{invoice_data['invoice_number']}</b></font><br/><b>Date:</b> {invoice_data['date']}<br/><b>Due Date:</b> {invoice_data['due_date']}<br/><b>Payment Terms:</b> Net 30", meta_style)
        ]
    ]
    header_table = Table(header_data, colWidths=[270, 270])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 15))
    
    # Line items
    table_content = [
        ["#", "Description", "Qty", "Unit Price ($)", "Total ($)"]
    ]
    for idx, item in enumerate(invoice_data['items'], start=1):
        table_content.append([
            str(idx),
            item['description'],
            f"{item['qty']:.1f}",
            f"${item['unit_price']:,.2f}",
            f"${item['total']:,.2f}"
        ])
        
    line_table = Table(table_content, colWidths=[30, 250, 60, 100, 100])
    line_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
    ]))
    story.append(line_table)
    story.append(Spacer(1, 15))
    
    # Financial Totals Summary
    summary_data = [
        ["Subtotal:", f"${invoice_data['subtotal']:,.2f}"],
        [f"Tax / VAT ({invoice_data['tax_rate_percent']}%):", f"${invoice_data['tax_amount']:,.2f}"],
        ["Total Amount Due:", f"${invoice_data['total']:,.2f}"]
    ]
    summary_table = Table(summary_data, colWidths=[380, 160])
    summary_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('LINEBELOW', (0, -1), (-1, -1), 1.5, colors.HexColor("#0f172a")),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#f1f5f9")),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 20))
    
    footer_text = Paragraph(
        f"<i>Certification: Billed pursuant to Vendor Agreement Schedule A. Remit payments via ACH Wire to Apex Corporate Reserve. Bank Ref: APX-CH-992.</i>",
        meta_style
    )
    story.append(footer_text)
    
    doc.build(story)

def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        # 1. Seed Real Users with Hashed Passwords
        demo_op = db.query(User).filter_by(email="operator@veritas.demo").first()
        if not demo_op:
            d_op_hash, d_op_salt = hash_password("Demo@123")
            d_aud_hash, d_aud_salt = hash_password("Demo@123")
            db.add_all([
                User(
                    id="USR-OP-DEMO",
                    email="operator@veritas.demo",
                    username="operator_demo",
                    full_name="Finance Operator",
                    hashed_password=d_op_hash,
                    salt=d_op_salt,
                    role="FINANCE_OPERATOR",
                    is_active=True
                ),
                User(
                    id="USR-AUD-DEMO",
                    email="auditor@veritas.demo",
                    username="auditor_demo",
                    full_name="Chief Auditor",
                    hashed_password=d_aud_hash,
                    salt=d_aud_salt,
                    role="CHIEF_AUDITOR",
                    is_active=True
                )
            ])
            db.commit()

        if not db.query(User).filter_by(email="operator@veritas.internal").first():
            op_hashed, op_salt = hash_password("Operator@123")
            aud_hashed, aud_salt = hash_password("Auditor@123")

            op_user = User(
                id="USR-OP-001",
                email="operator@veritas.internal",
                username="operator_internal",
                full_name="Finance Operator",
                hashed_password=op_hashed,
                salt=op_salt,
                role="FINANCE_OPERATOR",
                is_active=True
            )
            auditor_user = User(
                id="USR-AUD-002",
                email="auditor@veritas.internal",
                username="auditor_internal",
                full_name="Chief Auditor",
                hashed_password=aud_hashed,
                salt=aud_salt,
                role="CHIEF_AUDITOR",
                is_active=True
            )
            db.add_all([op_user, auditor_user])
            db.commit()

        # Update any previously seeded user records to ensure clean names
        db.query(User).filter(User.username.like("%operator%")).update({"full_name": "Finance Operator"})
        db.query(User).filter(User.username.like("%auditor%")).update({"full_name": "Chief Auditor"})
        db.commit()

        # 2. Seed Real Historical Vendors with Deep Metrics
        vendors_data = [
            {
                "id": "VEND-ABC-001",
                "name": "ABC Supplies Pvt Ltd",
                "normalized_name": normalize_text("ABC Supplies Pvt Ltd"),
                "tax_id": "IN-GST-27AABCA1042K1Z5",
                "bank_account_hash": hashlib.sha256(b"ABC-BANK-WIRE-1042").hexdigest(),
                "risk_tier": "LOW",
                "default_tax_rate": 0.18, # Historical Rate: 18%
                "status": "ACTIVE",
                "historical_invoice_count": 14,
                "historical_total_spent": 8260000.00,
                "avg_invoice_amount": 590000.00,
                "max_invoice_amount": 620000.00,
                "last_transaction_date": "2026-08-15"
            },
            {
                "id": "VEND-APEX-001",
                "name": "Apex Industrial Supplies Ltd",
                "normalized_name": normalize_text("Apex Industrial Supplies Ltd"),
                "tax_id": "US-EIN-8839210",
                "bank_account_hash": hashlib.sha256(b"APEX-BANK-WIRE-8839").hexdigest(),
                "risk_tier": "LOW",
                "default_tax_rate": 0.18, # 18% standard contract rate
                "status": "ACTIVE",
                "historical_invoice_count": 12,
                "historical_total_spent": 148250.00,
                "avg_invoice_amount": 12354.00,
                "max_invoice_amount": 18500.00,
                "last_transaction_date": "2024-09-20"
            },
            {
                "id": "VEND-VERTEX-002",
                "name": "Vertex Cloud Solutions Inc",
                "normalized_name": normalize_text("Vertex Cloud Solutions Inc"),
                "tax_id": "US-EIN-4491023",
                "bank_account_hash": hashlib.sha256(b"VERTEX-BANK-WIRE-4491").hexdigest(),
                "risk_tier": "LOW",
                "default_tax_rate": 0.18,
                "status": "ACTIVE",
                "historical_invoice_count": 24,
                "historical_total_spent": 96000.00,
                "avg_invoice_amount": 4000.00,
                "max_invoice_amount": 6500.00,
                "last_transaction_date": "2024-09-15"
            },
            {
                "id": "VEND-OMEGA-003",
                "name": "Omega Logistics Global",
                "normalized_name": normalize_text("Omega Logistics Global"),
                "tax_id": "US-EIN-1928374",
                "bank_account_hash": hashlib.sha256(b"OMEGA-BANK-WIRE-1928").hexdigest(),
                "risk_tier": "LOW",
                "default_tax_rate": 0.12,
                "status": "ACTIVE",
                "historical_invoice_count": 8,
                "historical_total_spent": 38400.00,
                "avg_invoice_amount": 4800.00,
                "max_invoice_amount": 7200.00,
                "last_transaction_date": "2024-08-30"
            },
            {
                "id": "VEND-CYBER-004",
                "name": "CyberShield Security LLC",
                "normalized_name": normalize_text("CyberShield Security LLC"),
                "tax_id": "US-EIN-7729103",
                "bank_account_hash": hashlib.sha256(b"CYBER-BANK-WIRE-7729").hexdigest(),
                "risk_tier": "HIGH",
                "default_tax_rate": 0.18,
                "status": "UNDER_REVIEW",
                "historical_invoice_count": 3,
                "historical_total_spent": 45000.00,
                "avg_invoice_amount": 15000.00,
                "max_invoice_amount": 22000.00,
                "last_transaction_date": "2024-07-12"
            }
        ]

        for v in vendors_data:
            existing = db.query(Vendor).filter_by(tax_id=v["tax_id"]).first()
            if not existing:
                db.add(Vendor(**v))
        db.commit()

        # 3. Create Sample Invoices with serverless fallback
        storage_dir = "storage/invoices"
        try:
            os.makedirs(storage_dir, exist_ok=True)
            os.makedirs("storage/reports", exist_ok=True)
        except OSError:
            storage_dir = os.path.join(tempfile.gettempdir(), "storage", "invoices")
            os.makedirs(storage_dir, exist_ok=True)

        # Baseline Historical Paid Invoice (Processed 18 days ago)
        hist_pdf_path = os.path.join(storage_dir, "historical_invoice_apex_9821.pdf")
        try:
            generate_pdf_invoice(hist_pdf_path, {
                "vendor_name": "Apex Industrial Supplies Ltd",
                "tax_id": "US-EIN-8839210",
                "invoice_number": "INV-2024-9821",
                "date": "2024-09-20",
                "due_date": "2024-10-20",
                "items": [
                    {"description": "High-Tensile Structural Fasteners M16", "qty": 250, "unit_price": 20.00, "total": 5000.00},
                    {"description": "Industrial Grade Hydraulic Lubricant 55 Gal", "qty": 15, "unit_price": 300.00, "total": 4500.00},
                    {"description": "Pneumatic Control Valve Assembly", "qty": 10, "unit_price": 300.00, "total": 3000.00}
                ],
                "subtotal": 12500.00,
                "tax_rate_percent": 18.0,
                "tax_amount": 2250.00,
                "total": 14750.00
            })
            hist_hash = compute_file_sha256(hist_pdf_path)
            with open(hist_pdf_path, "rb") as f:
                hist_b64 = base64.b64encode(f.read()).decode("utf-8")
        except Exception:
            hist_hash = hashlib.sha256(b"HISTORICAL_INVOICE_APEX_9821").hexdigest()
            hist_b64 = ""

        # Ensure historical baseline invoice exists in DB
        existing_hist = db.query(Invoice).filter_by(invoice_number="INV-2024-9821").first()
        if not existing_hist:
            hist_inv = Invoice(
                id="INV-HIST-APEX-9821",
                vendor_id="VEND-APEX-001",
                uploaded_by_user_id="USR-OP-001",
                invoice_number="INV-2024-9821",
                normalized_invoice_num=normalize_text("INV-2024-9821"),
                file_hash_sha256=hist_hash,
                file_path=hist_pdf_path,
                file_name="historical_invoice_apex_9821.pdf",
                file_mime="application/pdf",
                file_base64=hist_b64,
                invoice_date="2024-09-20",
                due_date="2024-10-20",
                subtotal=12500.00,
                claimed_tax_rate=0.18,
                claimed_tax_amount=2250.00,
                calculated_tax_amount=2250.00,
                total_amount=14750.00,
                currency="USD",
                approval_status="APPROVED",
                risk_score=8,
                risk_level="LOW",
                risk_breakdown=[
                    {"factor": "Baseline Historical Record", "points": 8, "description": "Verified historical transaction processed and settled"}
                ],
                fraud_findings=[],
                ai_explanation={
                    "headline": "Historical Baseline Clean Invoice",
                    "verdict": "CLEAN",
                    "risk_score": 8,
                    "findings": ["Vendor actively verified in master registry", "Tax calculations match contracted 18.0% rate", "No duplicate collisions"]
                }
            )
            db.add(hist_inv)
            db.commit()

            items = [
                InvoiceItem(invoice_id=hist_inv.id, line_index=1, description="High-Tensile Structural Fasteners M16", quantity=250, unit_price=20.00, claimed_total=5000.00, calculated_total=5000.00),
                InvoiceItem(invoice_id=hist_inv.id, line_index=2, description="Industrial Grade Hydraulic Lubricant 55 Gal", quantity=15, unit_price=300.00, claimed_total=4500.00, calculated_total=4500.00),
                InvoiceItem(invoice_id=hist_inv.id, line_index=3, description="Pneumatic Control Valve Assembly", quantity=10, unit_price=300.00, claimed_total=3000.00, calculated_total=3000.00),
            ]
            db.add_all(items)
            db.commit()

            record_audit_event(
                db=db,
                event_type="HISTORICAL_BASELINE_SEEDED",
                actor_role="SYSTEM",
                details={"invoice_id": hist_inv.id, "invoice_number": "INV-2024-9821", "amount": 14750.00},
                invoice_id=hist_inv.id,
                severity="INFO"
            )

        # Baseline Clean Invoice 2 (Vertex Cloud)
        existing_v = db.query(Invoice).filter_by(invoice_number="INV-2024-9100").first()
        if not existing_v:
            vertex_inv = Invoice(
                id="INV-HIST-VERTEX-9100",
                vendor_id="VEND-VERTEX-002",
                uploaded_by_user_id="USR-OP-001",
                invoice_number="INV-2024-9100",
                normalized_invoice_num=normalize_text("INV-2024-9100"),
                file_hash_sha256=hashlib.sha256(b"VERTEX-9100-BASELINE").hexdigest(),
                file_path="",
                file_name="vertex_cloud_inv_9100.pdf",
                file_mime="application/pdf",
                file_base64="",
                invoice_date="2024-09-15",
                due_date="2024-10-15",
                subtotal=4000.00,
                claimed_tax_rate=0.18,
                claimed_tax_amount=720.00,
                calculated_tax_amount=720.00,
                total_amount=4720.00,
                currency="USD",
                approval_status="APPROVED",
                risk_score=5,
                risk_level="LOW",
                risk_breakdown=[{"factor": "Clean Transaction", "points": 5, "description": "Verified recurring SaaS infrastructure subscription"}],
                fraud_findings=[],
                ai_explanation={
                    "headline": "Approved SaaS Infrastructure Invoice",
                    "verdict": "CLEAN",
                    "risk_score": 5,
                    "findings": ["Vendor verified", "Tax calculations match contracted 18.0% rate"]
                }
            )
            db.add(vertex_inv)
            db.commit()

        # Baseline Clean Invoice 3 (ABC Supplies Pvt Ltd Historical Record)
        existing_abc = db.query(Invoice).filter_by(invoice_number="INV-2026-1042").first()
        if not existing_abc:
            abc_inv = Invoice(
                id="INV-HIST-ABC-1042",
                vendor_id="VEND-ABC-001",
                uploaded_by_user_id="USR-OP-DEMO",
                invoice_number="INV-2026-1042",
                normalized_invoice_num=normalize_text("INV-2026-1042"),
                file_hash_sha256=hashlib.sha256(b"ABC-SUPPLIES-HIST-RECORD-1042").hexdigest(),
                file_path="",
                file_name="historical_invoice_abc_1042.pdf",
                file_mime="application/pdf",
                file_base64="",
                invoice_date="2026-08-15",
                due_date="2026-09-15",
                subtotal=500000.00,
                claimed_tax_rate=0.18,
                claimed_tax_amount=90000.00,
                calculated_tax_amount=90000.00,
                total_amount=590000.00,
                currency="INR",
                approval_status="APPROVED",
                risk_score=5,
                risk_level="LOW",
                risk_breakdown=[{"factor": "Clean Historical Baseline", "points": 5, "description": "Verified transaction settled in historical ERP"}],
                fraud_findings=[],
                ai_explanation={
                    "headline": "Historical Settled Invoice #INV-2026-1042",
                    "verdict": "CLEAN",
                    "risk_score": 5,
                    "findings": ["Vendor verified in master registry", "Contracted 18% GST rate confirmed", "Historical transaction paid and reconciled"]
                }
            )
            db.add(abc_inv)
            db.commit()

            items = [
                InvoiceItem(invoice_id=abc_inv.id, line_index=1, description="Industrial Grade Raw Material Batch A", quantity=100, unit_price=3500.00, claimed_total=350000.00, calculated_total=350000.00),
                InvoiceItem(invoice_id=abc_inv.id, line_index=2, description="High-Capacity Pneumatic Valves", quantity=30, unit_price=5000.00, claimed_total=150000.00, calculated_total=150000.00),
            ]
            db.add_all(items)
            db.commit()

            record_audit_event(
                db=db,
                event_type="HISTORICAL_BASELINE_SEEDED",
                actor_role="SYSTEM",
                details={"invoice_id": abc_inv.id, "invoice_number": "INV-2026-1042", "vendor": "ABC Supplies Pvt Ltd", "amount": 590000.00},
                invoice_id=abc_inv.id,
                severity="INFO"
            )

        # Seed completed revenue transactions for all baseline invoices
        for inv in db.query(Invoice).all():
            record_revenue_for_audit(db, inv)

        # 4. Generate Demo PDF: Clean Invoice (INV-2024-9899)
        clean_pdf_path = os.path.join(storage_dir, "clean_invoice_apex.pdf")
        generate_pdf_invoice(clean_pdf_path, {
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

        # 5. Generate Demo PDF: TAMPERED INVOICE FOR MANDATORY JUDGE TEST!
        tampered_pdf_path = os.path.join(storage_dir, "tampered_invoice_apex.pdf")
        generate_pdf_invoice(tampered_pdf_path, {
            "vendor_name": "Apex Industrial Supplies Ltd",
            "tax_id": "US-EIN-8839210",
            "invoice_number": "INV-2024-9821", # EXACT DUPLICATE OF HISTORICAL RECORD
            "date": "2024-10-07",
            "due_date": "2024-11-07",
            "items": [
                {"description": "High-Tensile Structural Fasteners M16", "qty": 250, "unit_price": 20.00, "total": 5000.00},
                {"description": "Industrial Grade Hydraulic Lubricant 55 Gal", "qty": 15, "unit_price": 300.00, "total": 4500.00},
                {"description": "Pneumatic Control Valve Assembly", "qty": 10, "unit_price": 300.00, "total": 3000.00}
            ],
            "subtotal": 12500.00,
            "tax_rate_percent": 12.0, # ALTERED TAX RATE (Registered is 18.0%)
            "tax_amount": 1500.00,     # MANIPULATED TAX AMOUNT
            "total": 14000.00
        })

        # 6. Generate Competition Demo Invoice: ABC Supplies Tampered Invoice
        demo_abc_pdf_path = os.path.join(storage_dir, "demo_invoice_abc_1042.pdf")
        generate_pdf_invoice(demo_abc_pdf_path, {
            "vendor_name": "ABC Supplies Pvt Ltd",
            "tax_id": "IN-GST-27AABCA1042K1Z5",
            "invoice_number": "INV-2026-1042", # DUPLICATE OF HISTORICAL INVOICE
            "date": "2026-10-08",
            "due_date": "2026-11-08",
            "items": [
                {"description": "Industrial Grade Raw Material Batch A", "qty": 100, "unit_price": 3500.00, "total": 350000.00},
                {"description": "High-Capacity Pneumatic Valves", "qty": 30, "unit_price": 5000.00, "total": 150000.00}
            ],
            "subtotal": 500000.00,
            "tax_rate_percent": 28.0, # ALTERED TAX RATE (Registered is 18.0%)
            "tax_amount": 140000.00,   # ALTERED TAX AMOUNT (Historical is 90,000.00)
            "total": 640000.00         # ALTERED TOTAL (Historical is 5,90,000.00)
        })

        print("Database seeded and test invoices created successfully.")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
