import os
from fastapi.testclient import TestClient
from backend.main import app

def test_competition_demo_flow():
    client = TestClient(app)

    print("--- 1. Testing Competition Demo Authentication ---")
    # Operator demo login
    res = client.post("/api/auth/login", json={"email": "operator@veritas.demo", "password": "Demo@123"})
    assert res.status_code == 200, f"Demo Operator login failed: {res.text}"
    op_data = res.json()
    assert op_data["user"]["role"] == "FINANCE_OPERATOR"
    op_token = op_data["access_token"]
    op_headers = {"Authorization": f"Bearer {op_token}"}
    print("[OK] Demo Finance Operator logged in successfully.")

    # Auditor demo login
    res = client.post("/api/auth/login", json={"email": "auditor@veritas.demo", "password": "Demo@123"})
    assert res.status_code == 200, f"Demo Auditor login failed: {res.text}"
    aud_data = res.json()
    assert aud_data["user"]["role"] == "CHIEF_AUDITOR"
    aud_token = aud_data["access_token"]
    aud_headers = {"Authorization": f"Bearer {aud_token}"}
    print("[OK] Demo Chief Auditor logged in successfully.")

    # Reset demo baseline
    client.post("/api/reset-demo", headers=aud_headers)
    print("[OK] Demo state cleanly reset to baseline.")

    print("--- 2. Testing Baseline Dashboard Stats ---")
    res = client.get("/api/dashboard/stats", headers=op_headers)
    assert res.status_code == 200
    stats = res.json()
    assert stats["total_invoices"] >= 3
    print(f"[OK] Baseline verified: Total={stats['total_invoices']}, Approved={stats['approved_invoices']}, Blocked={stats['blocked_invoices']}.")

    print("--- 3. Testing Competition Demo Invoice (ABC Supplies INV-2026-1042) ---")
    demo_pdf_path = "storage/invoices/demo_invoice_abc_1042.pdf"
    if not os.path.exists(demo_pdf_path):
        res = client.get("/api/demo-files/demo_invoice_abc_1042.pdf")
        assert res.status_code == 200
        with open(demo_pdf_path, "wb") as f:
            f.write(res.content)

    with open(demo_pdf_path, "rb") as f:
        res = client.post(
            "/api/invoices/upload",
            files={"file": ("demo_invoice_abc_1042.pdf", f, "application/pdf")},
            headers=op_headers
        )
    assert res.status_code == 200, res.text
    inv_data = res.json()

    print(f"  * Invoice Number: {inv_data['invoice_number']}")
    print(f"  * Vendor:         {inv_data['vendor_name']}")
    print(f"  * Total Amount:   INR {inv_data['total_amount']:,.2f}")
    print(f"  * Risk Score:     {inv_data['risk_score']}/100 ({inv_data['risk_level']})")
    print(f"  * Duplicate:      {inv_data['is_duplicate']}")
    print(f"  * Status:         {inv_data['approval_status']}")

    assert inv_data["invoice_number"] == "INV-2026-1042"
    assert inv_data["is_duplicate"] == True
    assert inv_data["risk_score"] == 92, f"Expected 92 risk score, got {inv_data['risk_score']}"
    assert inv_data["risk_level"] == "CRITICAL"
    assert inv_data["approval_status"] == "BLOCKED"
    print("[OK] Competition demo invoice correctly flagged with 92/100 CRITICAL risk and locked to BLOCKED.")

    print("--- 4. Testing Risk Score Factor Breakdown ---")
    factors = [rf["factor"] for rf in inv_data["risk_breakdown"]]
    assert any("Duplicate" in f for f in factors), "Duplicate factor missing"
    assert any("Tax Rate" in f for f in factors), "Tax rate factor missing"
    assert any("Amount" in f for f in factors), "Amount factor missing"
    print("[OK] Risk factor breakdown contains duplicate, tax mismatch, and amount anomaly.")

    print("--- 5. Testing Chief Auditor Adjudication ---")
    inv_id = inv_data["invoice_id"]
    res = client.post(
        f"/api/invoices/{inv_id}/block",
        headers=aud_headers,
        json={"reason": "Chief Auditor confirmation: Fraudulent duplicate invoice frozen."}
    )
    assert res.status_code == 200
    print("[OK] Chief Auditor confirmed BLOCKED status.")

    print("--- 6. Testing Audit Trail & Proof Verification ---")
    res = client.get("/api/audit-logs", headers=aud_headers)
    assert res.status_code == 200
    logs = res.json()
    assert len(logs) >= 5
    print(f"[OK] Audit trail contains {len(logs)} tamper-evident entries.")

    res = client.get("/api/audit-logs/verify", headers=aud_headers)
    assert res.status_code == 200
    proof = res.json()
    assert proof["valid"] == True
    print(f"[OK] Hash chain verified: {proof['total_records']} blocks 100% valid.")

    print("--- 7. Testing CSV & Certified Forensic PDF Export ---")
    res = client.get("/api/export/audit-trail.csv", headers=aud_headers)
    assert res.status_code == 200
    assert len(res.content) > 500
    print(f"[OK] Audit trail CSV exported ({len(res.content)} bytes).")

    res = client.get(f"/api/export/forensic-packet/{inv_id}.pdf", headers=aud_headers)
    assert res.status_code == 200
    assert len(res.content) > 1000
    print(f"[OK] Certified forensic PDF exported ({len(res.content)} bytes).")

    print("\n=================================================================")
    print("SUCCESS: 3-MINUTE COMPETITION DEMO FLOW VERIFIED 100% END-TO-END!")
    print("=================================================================\n")

if __name__ == "__main__":
    test_competition_demo_flow()
