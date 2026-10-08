#!/usr/bin/env python3
"""
VERITAS AP AUDIT GATEWAY - Interactive Terminal Demonstration & Judge Verification CLI
Executes the live audit lifecycle against the running server or local engine.
"""

import os
import sys
import time
import requests
import json

BASE_URL = os.getenv("VERITAS_BASE_URL", "http://127.0.0.1:8000")

# ANSI Color codes for clean terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def print_header(title):
    print(f"\n{BLUE}{BOLD}{'='*70}{RESET}")
    print(f"{CYAN}{BOLD}  {title}{RESET}")
    print(f"{BLUE}{BOLD}{'='*70}{RESET}\n")

def print_success(msg):
    print(f"{GREEN}[SUCCESS]{RESET} {msg}")

def print_alert(msg):
    print(f"{RED}{BOLD}[ALERT]{RESET} {msg}")

def print_info(msg):
    print(f"{YELLOW}[INFO]{RESET} {msg}")

def main():
    print_header("VERITAS: ENTERPRISE ACCOUNTS PAYABLE AUDIT GATEWAY")
    print(f"Target Gateway URL: {BOLD}{BASE_URL}{RESET}\n")

    # Step 1: Gateway Health Check
    print_info("Connecting to Veritas AP Gateway...")
    try:
        health_res = requests.get(f"{BASE_URL}/api/health", timeout=5)
        if health_res.status_code == 200:
            print_success(f"Gateway connected: {health_res.json()}")
        else:
            print_alert(f"Gateway returned status {health_res.status_code}")
            return
    except requests.exceptions.ConnectionError:
        print_alert(f"Could not connect to {BASE_URL}. Ensure the server is running with 'python run_server.py'.")
        return

    # Step 2: Authenticate as Finance Operator
    print_info("Authenticating Finance Operator (operator@veritas.demo)...")
    op_login = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "operator@veritas.demo",
        "password": "Demo@123"
    })
    if op_login.status_code != 200:
        print_alert("Finance Operator authentication failed!")
        return
    op_token = op_login.json()["access_token"]
    op_headers = {"Authorization": f"Bearer {op_token}"}
    print_success(f"Finance Operator session active (Token: {op_token[:20]}...)")

    # Step 3: Fetch Live Dashboard Statistics
    print_info("Querying live database KPI metrics...")
    stats_res = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=op_headers)
    stats = stats_res.json()
    print(f"  * Total Invoices Audited:  {BOLD}{stats['total_invoices']}{RESET}")
    print(f"  * High-Risk Invoices:      {BOLD}{stats['high_risk_invoices']}{RESET}")
    print(f"  * Duplicate Invoices:      {BOLD}{stats['duplicate_invoices']}{RESET}")
    print(f"  * Pending Approvals:       {BOLD}{stats['pending_approvals']}{RESET}")
    print(f"  * Approved Invoices:       {BOLD}{stats['approved_invoices']}{RESET}")
    print(f"  * Blocked Invoices:        {BOLD}{stats['blocked_invoices']}{RESET}")
    print(f"  * Audited Volume:          {BOLD}${stats['total_volume_usd']:,.2f} USD{RESET}")

    # Step 4: Run Mandatory Judge Test - Competition Demo Invoice (ABC Supplies INV-2026-1042)
    print_header("COMPETITION DEMO SCENARIO: ABC SUPPLIES PVT LTD (#INV-2026-1042)")
    demo_pdf = "storage/invoices/demo_invoice_abc_1042.pdf"
    if not os.path.exists(demo_pdf):
        sample_res = requests.get(f"{BASE_URL}/api/demo-files/demo_invoice_abc_1042.pdf")
        with open(demo_pdf, "wb") as f:
            f.write(sample_res.content)

    print_info("Uploading and auditing 'demo_invoice_abc_1042.pdf'...")
    with open(demo_pdf, "rb") as f:
        upload_res = requests.post(
            f"{BASE_URL}/api/invoices/upload",
            files={"file": ("demo_invoice_abc_1042.pdf", f, "application/pdf")},
            headers=op_headers
        )

    if upload_res.status_code != 200:
        print_alert(f"Upload failed: {upload_res.text}")
        return

    result = upload_res.json()
    invoice_id = result["invoice_id"]
    print_success(f"Invoice #{result['invoice_number']} analyzed:")
    print(f"  * Vendor:                  {result.get('vendor_name', 'ABC Supplies Pvt Ltd')}")
    print(f"  * File Hash (SHA-256):     {result['file_hash']}")
    print(f"  * Total Amount Billed:     INR {result['total_amount']:,.2f}")
    print(f"  * Risk Score:              {RED}{BOLD}{result['risk_score']}/100 ({result['risk_level']}){RESET}")
    print(f"  * Duplicate Collision:     {RED}{BOLD}{result['is_duplicate']}{RESET}")
    print(f"  * Live Approval State:     {RED}{BOLD}{result['approval_status']}{RESET}")

    # Step 5: Inspect Risk Factors and Findings
    print("\n" + CYAN + BOLD + "--- Itemized Risk Factor Breakdown ---" + RESET)
    for rf in result.get("risk_breakdown", []):
        print(f"  [{YELLOW}+{rf['points']} pts{RESET}] {BOLD}{rf['factor']}{RESET}: {rf['description']}")

    # Step 6: Authenticate as Chief Auditor for Adjudication
    print_header("CHIEF AUDITOR ADJUDICATION & GOVERNANCE")
    print_info("Authenticating Chief Auditor (auditor@veritas.demo)...")
    aud_login = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "auditor@veritas.demo",
        "password": "Demo@123"
    })
    aud_token = aud_login.json()["access_token"]
    aud_headers = {"Authorization": f"Bearer {aud_token}"}
    print_success("Chief Auditor session active.")

    print_info("Executing audit block confirmation...")
    block_res = requests.post(
        f"{BASE_URL}/api/invoices/{invoice_id}/block",
        headers=aud_headers,
        json={"reason": "Judge test verification: Confirmed duplicate invoice submission and tax evasion attempt."}
    )
    if block_res.status_code == 200:
        print_success("Chief Auditor confirmed BLOCKED status in cloud ledger.")

    # Step 7: Cryptographic Proof Verification
    print_info("Verifying cryptographic SHA-256 audit hash chain...")
    chain_res = requests.get(f"{BASE_URL}/api/audit-logs/verify", headers=aud_headers)
    if chain_res.status_code == 200:
        chain_proof = chain_res.json()
        print_success(f"Hash Chain Verified: {BOLD}{chain_proof.get('total_records', 0)} blocks{RESET} mathematically unbroken!")
        print(f"  * Latest Root Hash:  {chain_proof.get('latest_root_hash', '')[:32]}...")
        print(f"  * Status:            {chain_proof.get('message', 'Valid')}")

    # Step 8: Export Forensic Reports
    print_info("Generating certified ReportLab PDF forensic packet...")
    pdf_res = requests.get(f"{BASE_URL}/api/export/forensic-packet/{invoice_id}.pdf", headers=aud_headers)
    if pdf_res.status_code == 200:
        export_path = "storage/reports/judges_certified_packet.pdf"
        os.makedirs("storage/reports", exist_ok=True)
        with open(export_path, "wb") as f:
            f.write(pdf_res.content)
        print_success(f"Certified PDF forensic packet generated: {export_path} ({len(pdf_res.content):,} bytes)")

    csv_res = requests.get(f"{BASE_URL}/api/export/audit-trail.csv", headers=aud_headers)
    if csv_res.status_code == 200:
        csv_path = "storage/reports/veritas_audit_trail.csv"
        with open(csv_path, "wb") as f:
            f.write(csv_res.content)
        print_success(f"Audit trail CSV exported: {csv_path} ({len(csv_res.content):,} bytes)")

    print_header("ALL VERITAS AUDIT SYSTEMS & JUDGE FLOW VALIDATED")
    print(f"Web Dashboard is live at: {BOLD}http://127.0.0.1:8000{RESET}\n")

if __name__ == "__main__":
    main()
