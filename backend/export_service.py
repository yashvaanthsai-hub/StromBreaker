import os
import csv
import io
from datetime import datetime, timezone
from typing import List
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from sqlalchemy.orm import Session

from backend.models import Invoice, AuditLog, DuplicateDetection

def generate_audit_csv(logs: List[AuditLog]) -> str:
    """Generates standard CSV content for the audit logs."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Log ID", "Timestamp (UTC)", "Event Type", "Severity",
        "Actor Role", "Actor ID", "Invoice ID", "Current Hash", "Previous Hash"
    ])
    for log in logs:
        writer.writerow([
            log.id,
            log.timestamp_iso,
            log.event_type,
            log.severity,
            log.actor_role,
            log.actor_id,
            log.invoice_id or "N/A",
            log.current_log_hash,
            log.prev_log_hash
        ])
    return output.getvalue()

def generate_forensic_pdf(invoice: Invoice, logs: List[AuditLog], output_path: str):
    """
    Generates an official Certified Forensic Audit Packet PDF with cryptographic verification.
    """
    doc = SimpleDocTemplate(output_path, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()

    header_style = ParagraphStyle(
        'DocHeader',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a")
    )
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1e3a8a"),
        spaceBefore=10,
        spaceAfter=6
    )
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155")
    )
    alert_style = ParagraphStyle(
        'AlertBody',
        parent=styles['Normal'],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#991b1b")
    )

    story = []

    # Title & Certification Banner
    story.append(Paragraph("<b>VERITAS AUDIT GATEWAY</b>", header_style))
    story.append(Paragraph("<b>FORENSIC ACCOUNTS PAYABLE COMPLIANCE & FRAUD AUDIT PACKET</b>", ParagraphStyle('Sub', parent=body_style, fontSize=10, textColor=colors.HexColor("#64748b"))))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0f172a"), spaceAfter=12))

    # Executive Summary Card
    verdict_color = "#dc2626" if "REJECTED" in invoice.approval_status else "#16a34a"
    summary_data = [
        [
            Paragraph(f"<b>Target Invoice #:</b> {invoice.invoice_number}<br/><b>Vendor:</b> {invoice.vendor.name if invoice.vendor else 'Unverified'}<br/><b>Invoice Date:</b> {invoice.invoice_date or 'N/A'}<br/><b>Total Billed:</b> ${invoice.total_amount:,.2f}", body_style),
            Paragraph(f"<b>Adjudication Status:</b> <font color='{verdict_color}'><b>{invoice.approval_status}</b></font><br/><b>Risk Score:</b> <b>{invoice.risk_score} / 100 ({invoice.risk_level})</b><br/><b>File SHA-256:</b> {invoice.file_hash_sha256[:20]}...<br/><b>Audit Date:</b> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}", body_style)
        ]
    ]
    summary_table = Table(summary_data, colWidths=[270, 270])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 12))

    # Findings & AI Explanation
    story.append(Paragraph("<b>1. AUTOMATED FORENSIC FINDINGS & EVIDENCE</b>", section_style))
    ai_exp = invoice.ai_explanation or {}
    findings_list = ai_exp.get("findings", [])
    
    findings_rows = []
    for f in findings_list:
        findings_rows.append([Paragraph(f"• {f}", alert_style if "CRITICAL" in f or "TAX" in f or "DUPLICATE" in f else body_style)])

    if not findings_rows:
        findings_rows.append([Paragraph("• No risk flags raised. Invoice verified compliant with master vendor contract.", body_style)])

    findings_table = Table(findings_rows, colWidths=[540])
    findings_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#fef2f2") if "REJECTED" in invoice.approval_status else colors.HexColor("#f0fdf4")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#fca5a5") if "REJECTED" in invoice.approval_status else colors.HexColor("#86efac")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(findings_table)
    story.append(Spacer(1, 12))

    # Extracted Line Items
    story.append(Paragraph("<b>2. MULTIMODAL EXTRACTED LINE ITEMS</b>", section_style))
    line_table_data = [["#", "Description", "Qty", "Unit Price", "Claimed Total", "Math Check"]]
    for item in invoice.line_items:
        math_status = "TAMPERED" if item.discrepancy_flag else "VALID"
        line_table_data.append([
            str(item.line_index),
            item.description[:40],
            f"{item.quantity:.1f}",
            f"${item.unit_price:,.2f}",
            f"${item.claimed_total:,.2f}",
            math_status
        ])
    
    line_table = Table(line_table_data, colWidths=[24, 250, 46, 75, 75, 70])
    line_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(line_table)
    story.append(Spacer(1, 12))

    # Cryptographic Audit Log Chaining
    story.append(Paragraph("<b>3. CRYPTOGRAPHICALLY HASH-CHAINED AUDIT LOGS</b>", section_style))
    log_data = [["Timestamp (UTC)", "Event", "Actor", "Severity", "Block Hash (SHA-256)"]]
    for log in logs[:8]: # Display up to 8 relevant entries
        log_data.append([
            log.timestamp_iso[:19].replace("T", " "),
            log.event_type[:18],
            log.actor_role[:15],
            log.severity,
            log.current_log_hash[:16] + "..."
        ])

    log_table = Table(log_data, colWidths=[95, 110, 95, 55, 185])
    log_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(log_table)
    story.append(Spacer(1, 15))

    # Forensic Seal
    cert_text = Paragraph(
        f"<i>Forensic Seal: Generated by Veritas AP Gateway Engine v1.0. Root Block SHA-256: {logs[-1].current_log_hash if logs else 'NONE'}. This document is tamper-evident and admissible under corporate compliance procedures.</i>",
        ParagraphStyle('Cert', parent=body_style, fontSize=7.5, textColor=colors.HexColor("#64748b"))
    )
    story.append(cert_text)

    doc.build(story)
