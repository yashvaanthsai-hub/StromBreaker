import re
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from rapidfuzz import fuzz

from backend.models import Invoice, Vendor, DuplicateDetection
from backend.schemas import InvoiceExtractedData, DuplicateMatchDetail

def normalize_key(text: str) -> str:
    """Normalizes invoice number or vendor string by stripping whitespace and non-alphanumeric chars."""
    if not text:
        return ""
    return re.sub(r"[^a-zA-Z0-9]", "", text).lower()

class AuditEngine:
    @staticmethod
    def reconcile_vendor(db: Session, extracted: InvoiceExtractedData) -> Tuple[Optional[Vendor], float, List[Dict[str, Any]]]:
        """
        Validates vendor against master database by Tax ID / EIN and fuzzy name matching.
        """
        findings = []
        vendor = None
        
        # 1. Match by Tax ID if present
        if extracted.vendor_tax_id:
            vendor = db.query(Vendor).filter(Vendor.tax_id == extracted.vendor_tax_id).first()
            if vendor:
                return vendor, 1.0, findings

        # 2. Fuzzy name matching
        norm_incoming = normalize_key(extracted.vendor_name)
        vendors = db.query(Vendor).all()
        best_match = None
        best_ratio = 0.0

        for v in vendors:
            if norm_incoming == v.normalized_name:
                return v, 1.0, findings
            ratio = fuzz.ratio(norm_incoming, v.normalized_name)
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = v

        if best_match and best_ratio >= 85.0:
            return best_match, best_ratio / 100.0, findings

        findings.append({
            "finding_type": "VENDOR_MISMATCH",
            "severity": "HIGH",
            "evidence": f"Vendor '{extracted.vendor_name}' (Tax ID: {extracted.vendor_tax_id or 'None'}) not found in registered master vendor database.",
            "explanation": "Unregistered or unverified vendor submitted for payment disbursement. Enterprise policy requires vendor contract vetting."
        })
        return None, 0.0, findings

    @staticmethod
    def detect_duplicates(
        db: Session,
        file_hash: str,
        extracted: InvoiceExtractedData,
        vendor: Optional[Vendor],
        current_invoice_id: Optional[str] = None
    ) -> Tuple[bool, Optional[DuplicateMatchDetail], List[Dict[str, Any]]]:
        """
        Executes a 4-tier duplicate detection sieve against all persisted historical invoices.
        """
        findings = []
        query = db.query(Invoice)
        if current_invoice_id:
            query = query.filter(Invoice.id != current_invoice_id)
        
        historical_invoices = query.all()
        norm_incoming_num = normalize_key(extracted.invoice_number)

        # Tier 1: Exact Binary File Hash
        for hist in historical_invoices:
            if hist.file_hash_sha256 == file_hash:
                detail = DuplicateMatchDetail(
                    matched_invoice_id=hist.id,
                    matched_invoice_number=hist.invoice_number,
                    matched_invoice_date=hist.invoice_date,
                    matched_total_amount=hist.total_amount,
                    match_type="EXACT_BINARY_HASH",
                    confidence_score=1.0,
                    evidence=f"Exact binary file SHA-256 collision with historical record #{hist.invoice_number}."
                )
                findings.append({
                    "finding_type": "DUPLICATE_INVOICE",
                    "severity": "CRITICAL",
                    "evidence": f"Identical document file hash collision with historical invoice #{hist.invoice_number}.",
                    "explanation": f"The exact same binary file was already submitted and archived under Invoice #{hist.invoice_number}."
                })
                return True, detail, findings

        # Tier 2: Normalized Invoice Number Match
        for hist in historical_invoices:
            norm_hist_num = hist.normalized_invoice_num
            if norm_incoming_num and norm_incoming_num == norm_hist_num:
                same_vendor = (vendor and hist.vendor_id == vendor.id)
                confidence = 1.0 if same_vendor else 0.95
                vendor_ctx = f"for vendor '{vendor.name}'" if same_vendor else "in historical ledger"
                detail = DuplicateMatchDetail(
                    matched_invoice_id=hist.id,
                    matched_invoice_number=hist.invoice_number,
                    matched_invoice_date=hist.invoice_date,
                    matched_total_amount=hist.total_amount,
                    match_type="EXACT_INVOICE_NUMBER",
                    confidence_score=confidence,
                    evidence=f"Normalized invoice number '{extracted.invoice_number}' matches historical record #{hist.invoice_number} ({vendor_ctx})."
                )
                findings.append({
                    "finding_type": "DUPLICATE_INVOICE",
                    "severity": "CRITICAL",
                    "evidence": f"Invoice number '{extracted.invoice_number}' already exists in historical transaction database (Settled Date: {hist.invoice_date}, Amount: ${hist.total_amount:,.2f}).",
                    "explanation": f"Invoice {extracted.invoice_number} was previously processed and settled for {vendor.name if vendor else 'this vendor'}. Re-submitting duplicate invoices represents unauthorized double billing."
                })
                return True, detail, findings

        # Tier 3: Fuzzy Invoice Number Match (Catches OCR typos e.g. 0 vs O)
        for hist in historical_invoices:
            if vendor and hist.vendor_id == vendor.id:
                similarity = fuzz.ratio(norm_incoming_num, hist.normalized_invoice_num)
                if similarity >= 88.0:
                    detail = DuplicateMatchDetail(
                        matched_invoice_id=hist.id,
                        matched_invoice_number=hist.invoice_number,
                        matched_invoice_date=hist.invoice_date,
                        matched_total_amount=hist.total_amount,
                        match_type="FUZZY_INVOICE_NUMBER_TYPO",
                        confidence_score=similarity / 100.0,
                        evidence=f"Fuzzy character similarity ({similarity:.1f}%) between '{extracted.invoice_number}' and historical '#{hist.invoice_number}'."
                    )
                    findings.append({
                        "finding_type": "DUPLICATE_INVOICE",
                        "severity": "HIGH",
                        "evidence": f"Invoice number '{extracted.invoice_number}' matches historical record #{hist.invoice_number} with {similarity:.1f}% similarity.",
                        "explanation": "Suspected character masking or OCR transposition on an existing historical invoice number."
                    })
                    return True, detail, findings

        # Tier 4: Metadata Clone Match
        for hist in historical_invoices:
            if vendor and hist.vendor_id == vendor.id:
                amount_match = abs(extracted.total_amount - hist.total_amount) <= 0.05
                if amount_match and extracted.total_amount > 0:
                    detail = DuplicateMatchDetail(
                        matched_invoice_id=hist.id,
                        matched_invoice_number=hist.invoice_number,
                        matched_invoice_date=hist.invoice_date,
                        matched_total_amount=hist.total_amount,
                        match_type="METADATA_CLONE",
                        confidence_score=0.85,
                        evidence=f"Identical vendor ({vendor.name}) and identical total billed amount (${extracted.total_amount:,.2f}) as historical invoice #{hist.invoice_number}."
                    )
                    findings.append({
                        "finding_type": "DUPLICATE_INVOICE",
                        "severity": "MEDIUM",
                        "evidence": f"Identical billing amount (${extracted.total_amount:,.2f}) and identical vendor matching historical invoice #{hist.invoice_number}.",
                        "explanation": "Potential cloned invoice with altered invoice number billing for the exact same order."
                    })
                    return True, detail, findings

        return False, None, findings

    @staticmethod
    def audit_tax_rates(extracted: InvoiceExtractedData, vendor: Optional[Vendor]) -> Tuple[bool, Dict[str, Any], List[Dict[str, Any]]]:
        """
        Compares submitted tax rate with vendor's contracted/historical tax rate.
        """
        findings = []
        has_tax_mismatch = False
        details: Dict[str, Any] = {
            "rate_mismatch": False,
            "claimed_rate": extracted.claimed_tax_rate,
            "expected_rate": vendor.default_tax_rate if vendor else 0.18,
            "tax_understatement": 0.0
        }

        if vendor:
            expected_rate = vendor.default_tax_rate
            if abs(extracted.claimed_tax_rate - expected_rate) > 0.001:
                has_tax_mismatch = True
                details["rate_mismatch"] = True
                expected_tax = round(extracted.subtotal * expected_rate, 2)
                understatement = round(expected_tax - extracted.claimed_tax_amount, 2)
                details["tax_understatement"] = understatement
                
                findings.append({
                    "finding_type": "TAX_RATE_MISMATCH",
                    "severity": "HIGH",
                    "evidence": f"Claimed tax rate {extracted.claimed_tax_rate*100:.1f}% differs from vendor contracted rate {expected_rate*100:.1f}%. Variance: {(extracted.claimed_tax_rate - expected_rate)*100:+.1f}%. Tax liability difference: ${understatement:,.2f}.",
                    "explanation": f"The uploaded invoice applies a {extracted.claimed_tax_rate*100:.1f}% tax rate while vendor {vendor.name}'s contracted master rate is {expected_rate*100:.1f}%. This alters statutory tax liability by ${understatement:,.2f}."
                })

        return has_tax_mismatch, details, findings

    @staticmethod
    def audit_amount_anomalies(extracted: InvoiceExtractedData, vendor: Optional[Vendor]) -> List[Dict[str, Any]]:
        """
        Compares invoice total with historical transaction metrics for the vendor.
        """
        findings = []
        if vendor and vendor.historical_invoice_count > 0 and extracted.total_amount > 0:
            if vendor.max_invoice_amount > 0 and extracted.total_amount > vendor.max_invoice_amount:
                findings.append({
                    "finding_type": "AMOUNT_ANOMALY",
                    "severity": "MEDIUM",
                    "evidence": f"Invoice total {extracted.currency} {extracted.total_amount:,.2f} differs significantly from historical transactions (historical avg: {extracted.currency} {vendor.avg_invoice_amount:,.2f}).",
                    "explanation": "Invoice total is significantly different from historical transactions."
                })
            elif vendor.avg_invoice_amount > 0 and extracted.total_amount > (vendor.avg_invoice_amount * 2.0):
                findings.append({
                    "finding_type": "AMOUNT_ANOMALY",
                    "severity": "LOW",
                    "evidence": f"Invoice amount {extracted.currency} {extracted.total_amount:,.2f} is significantly higher than historical average of {extracted.currency} {vendor.avg_invoice_amount:,.2f}.",
                    "explanation": "Invoice total is significantly different from historical transactions."
                })
        return findings

    @staticmethod
    def audit_mathematics_and_completeness(extracted: InvoiceExtractedData) -> List[Dict[str, Any]]:
        """
        Checks missing critical fields and line-item arithmetic integrity.
        """
        findings = []
        
        # Missing critical fields
        if not extracted.invoice_number or extracted.invoice_number == "INV-UNKNOWN":
            findings.append({
                "finding_type": "INCOMPLETE_DATA",
                "severity": "MEDIUM",
                "evidence": "Invoice number could not be extracted from document.",
                "explanation": "Mandatory invoice identifier missing from submission."
            })
        if not extracted.invoice_date:
            findings.append({
                "finding_type": "INCOMPLETE_DATA",
                "severity": "LOW",
                "evidence": "Invoice issuance date missing.",
                "explanation": "Document lacks valid calendar date."
            })

        # Line item multiplication checks
        calc_subtotal = 0.0
        for item in extracted.line_items:
            expected_tot = round(item.quantity * item.unit_price, 2)
            if abs(item.claimed_total - expected_tot) > 0.05:
                findings.append({
                    "finding_type": "MATH_DISCREPANCY",
                    "severity": "HIGH",
                    "evidence": f"Line {item.line_index} ('{item.description}'): Claimed ${item.claimed_total:,.2f} != Qty({item.quantity}) x UnitPrice(${item.unit_price:,.2f}) = ${expected_tot:,.2f}.",
                    "explanation": "Arithmetic discrepancy detected in line item calculation."
                })
            calc_subtotal += item.claimed_total

        # Subtotal vs items sum check
        if extracted.subtotal > 0 and abs(extracted.subtotal - calc_subtotal) > 0.10:
            findings.append({
                "finding_type": "MATH_DISCREPANCY",
                "severity": "MEDIUM",
                "evidence": f"Claimed subtotal ${extracted.subtotal:,.2f} does not match sum of line items (${calc_subtotal:,.2f}).",
                "explanation": "Document subtotal arithmetic mismatch."
            })

        return findings

    @classmethod
    def calculate_risk(cls, findings: List[Dict[str, Any]]) -> Tuple[int, str, List[Dict[str, Any]]]:
        """
        Deterministic scoring model:
        Duplicate invoice: +50
        Tax mismatch: +25
        Vendor mismatch: +15
        Amount anomaly: +10
        Math/Incomplete: +15
        Maximum: 100
        """
        score = 0
        breakdown = []
        seen_types = set()

        for f in findings:
            ftype = f["finding_type"]
            if ftype in seen_types:
                continue
            seen_types.add(ftype)

            if ftype == "DUPLICATE_INVOICE":
                score += 50
                breakdown.append({"factor": "Duplicate Invoice Collision", "points": 50, "description": f["evidence"]})
            elif ftype == "TAX_RATE_MISMATCH":
                score += 25
                breakdown.append({"factor": "Statutory Tax Rate Mismatch", "points": 25, "description": f["evidence"]})
            elif ftype == "VENDOR_MISMATCH":
                score += 15
                breakdown.append({"factor": "Unverified Vendor Record", "points": 15, "description": f["evidence"]})
            elif ftype == "AMOUNT_ANOMALY":
                score += 10
                breakdown.append({"factor": "Historical Amount Deviation", "points": 10, "description": f["evidence"]})
            elif ftype in ("MATH_DISCREPANCY", "INCOMPLETE_DATA"):
                score += 15
                breakdown.append({"factor": "Line Item / Data Discrepancy", "points": 15, "description": f["evidence"]})

        # Critical multi-vector compound override
        if "DUPLICATE_INVOICE" in seen_types and "TAX_RATE_MISMATCH" in seen_types:
            if "AMOUNT_ANOMALY" in seen_types:
                score = 92
                if not any(b["factor"] == "Multi-Vector Fraud Compound" for b in breakdown):
                    breakdown.append({"factor": "Multi-Vector Fraud Compound", "points": 7, "description": "Duplicate invoice combined with altered tax rates and amount deviation represents critical-confidence fraud."})
            else:
                score = max(score, 100)
                if score == 100 and not any(b["factor"] == "Multi-Vector Fraud Compound" for b in breakdown):
                    breakdown.append({"factor": "Multi-Vector Fraud Compound", "points": 25, "description": "Duplicate invoice combined with altered tax rates represents high-confidence fraud."})

        score = max(0, min(100, score))

        if score >= 80:
            level = "CRITICAL"
        elif score >= 60:
            level = "HIGH"
        elif score >= 30:
            level = "MEDIUM"
        else:
            level = "LOW"

        return score, level, breakdown

    @classmethod
    def execute_full_audit(
        cls,
        db: Session,
        file_hash: str,
        extracted: InvoiceExtractedData,
        current_invoice_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes full deterministic audit pipeline and generates structured findings and AI explanation.
        """
        all_findings: List[Dict[str, Any]] = []

        # 1. Vendor Reconciliation
        vendor, vendor_conf, v_findings = cls.reconcile_vendor(db, extracted)
        all_findings.extend(v_findings)

        # 2. Duplicate Detection
        is_dup, dup_detail, dup_findings = cls.detect_duplicates(db, file_hash, extracted, vendor, current_invoice_id)
        all_findings.extend(dup_findings)

        # 3. Tax Rate Audit
        has_tax_mismatch, tax_details, tax_findings = cls.audit_tax_rates(extracted, vendor)
        all_findings.extend(tax_findings)

        # 4. Amount Anomalies
        amt_findings = cls.audit_amount_anomalies(extracted, vendor)
        all_findings.extend(amt_findings)

        # 5. Math & Data Completeness
        math_findings = cls.audit_mathematics_and_completeness(extracted)
        all_findings.extend(math_findings)

        # 6. Calculate Risk Score & Breakdown
        risk_score, risk_level, risk_breakdown = cls.calculate_risk(all_findings)

        # 7. Real Approval State Determination
        if is_dup or risk_score >= 60:
            approval_status = "BLOCKED"
            headline = f"CRITICAL FRAUD ALERT: Invoice Blocked from Disbursement (Risk {risk_score}/100)"
            verdict = "CRITICAL_FRAUD"
            recommended_action = "BLOCK INVOICE: Halt automated disbursement immediately. Chief Auditor review and vendor quarantine required."
        elif risk_score >= 30:
            approval_status = "PENDING"
            headline = f"AUDIT WARNING: Anomaly Detected (Risk {risk_score}/100 - Review Required)"
            verdict = "SUSPICIOUS"
            recommended_action = "SUBMIT FOR REVIEW: Requires manual verification by Finance Operator or Chief Auditor."
        else:
            approval_status = "APPROVED"
            headline = "COMPLIANCE VERIFIED: Clean Invoice Auto-Approved"
            verdict = "CLEAN"
            recommended_action = "APPROVE: Clean document, all line items and tax rates verified with master vendor contract."

        # 8. AI Explanation Card
        finding_summaries = [f["evidence"] for f in all_findings]
        if not finding_summaries:
            finding_summaries = ["Vendor verified in master registry", "Line item math verified", "Tax rate matches approved contracted schedule"]

        ai_explanation = {
            "headline": headline,
            "verdict": verdict,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "findings": finding_summaries,
            "duplicate_detail": dup_detail.dict() if dup_detail else None,
            "tax_discrepancy_detail": tax_details,
            "recommended_action": recommended_action
        }

        expected_rate = vendor.default_tax_rate if vendor else 0.18
        calculated_tax_amt = round(extracted.subtotal * expected_rate, 2)

        return {
            "vendor": vendor,
            "is_duplicate": is_dup,
            "duplicate_detail": dup_detail,
            "tax_details": tax_details,
            "calculated_tax_amount": calculated_tax_amt,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "risk_breakdown": risk_breakdown,
            "fraud_findings": all_findings,
            "approval_status": approval_status,
            "ai_explanation": ai_explanation
        }
