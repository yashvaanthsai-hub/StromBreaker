# VERITAS: Enterprise Accounts Payable Audit Gateway
**Autonomous FinTech & Audit Tech Defense System**

---

## Executive Summary
Enterprises lose millions annually to fraudulent duplicate invoices, altered statutory tax rates, unverified vendors, and invoice amount tampering. **Veritas** is an automated, real-time AP audit gateway designed to intercept, extract, evaluate, and freeze fraudulent disbursements before funds leave corporate accounts.

Built for zero-downtime cloud production on **Vercel** with live cloud database persistence (Neon / Supabase / PostgreSQL or local SQLite WAL fallback).

---

## Production Credentials & Roles

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Finance Operator** | `operator@veritas.internal` | `Operator@123` | Upload invoices, process documents, view risk scores, submit for review, inspect extracted line items |
| **Chief Auditor** | `auditor@veritas.internal` | `Auditor@123` | Full ledger access, Approve/Block invoices, Quarantine vendors, Verify cryptographic hash chain, Export PDF & CSV audit packets |

*The application includes one-click demo role login buttons on the login screen for rapid evaluation.*

---

## Mandatory Judge Test Specification
When a judge uploads `tampered_invoice_apex.pdf` (or clicks **"Test Tampered (INV-9821)"**):
1. **Multimodal Extraction**: Extracts invoice number (`INV-2024-9821`), line items, subtotal ($12,500.00), claimed tax rate (12.0%), and claimed tax amount ($1,500.00).
2. **Duplicate Detection Collision**: Compares with historical ledger and catches exact normalized duplicate match of historical paid invoice `INV-2024-9821` issued 18 days earlier.
3. **Tax Rate Manipulation**: Flags statutory violation — vendor's registered contracted rate is **18.0%**, but invoice claims **12.0%**, understating tax liability by **$750.00**.
4. **Automated Risk Score**: Itemized breakdown (+50 Duplicate, +25 Tax Mismatch, +25 Multi-Vector Compound) sums to **100/100 (CRITICAL)**.
5. **Real-Time Approval State**: Instantly locks state to **`BLOCKED`** with disbursement frozen and full forensic explanation displayed.
6. **Chief Auditor Adjudication**: Chief Auditor confirms block status, quaranatines vendor, and exports signed ReportLab Forensic Audit PDF.

---

## Architecture & Technology Stack

```
User's Browser (React 19 + TypeScript + Tailwind CSS + Lucide)
      ↓
Vercel Edge Network / Reverse Proxy
      ↓
FastAPI Serverless Backend (api/index.py → backend.main)
      ↓
Live Cloud Database (PostgreSQL via Neon/Supabase or SQLite WAL)
      ↓
Deterministic Audit Engine & Multimodal AI Pipeline
```

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide icons.
- **Backend**: Python 3.11+, FastAPI, SQLAlchemy ORM, Uvicorn, ReportLab, RapidFuzz.
- **Database**: Cloud PostgreSQL (`DATABASE_URL` compatible with Neon, Supabase, AWS RDS) with local SQLite WAL fallback.
- **Document Storage**: Base64 database blob storage (`file_base64`) ensuring document availability in serverless environments.
- **Audit Trail**: Cryptographic SHA-256 hash-chained log blocks ($H_k = \text{SHA-256}(H_{k-1} + \text{payload})$) with real-time mathematical proof verification.

---

## Quickstart & How to Run

### 1. Launch the Application Locally
```bash
python run_server.py
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser.

### 2. Run the Full Test Suite
```bash
python -m tests.test_audit_gateway
```
*All 20 integration assertions test authentication, role authorization, live counter updates, duplicate detection, risk breakdown, and PDF exports.*

### 3. Rebuild the Frontend
```bash
npm run build
```

---

## Deploying to Vercel

Veritas is 100% configured for instant Vercel deployment:

1. **Push repository to GitHub**:
   Ensure `.env.example`, `vercel.json`, `package.json`, `requirements.txt`, and `api/index.py` are committed.
2. **Import into Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new).
   - Select your repository.
   - Set Environment Variables:
     - `DATABASE_URL`: `postgresql://user:password@ep-xyz.neon.tech/veritas?sslmode=require` (e.g. from free Neon.tech or Supabase)
     - `AUTH_SECRET`: A secure 32+ character random string.
     - `GEMINI_API_KEY`: *(Optional)* Your Gemini API key for multimodal image extraction.
3. **Deploy**:
   Vercel automatically builds the Vite frontend into `frontend/dist` and routes API calls to the serverless Python handler `api/index.py`.

See [`DEPLOYMENT.md`](file:///d:/stromebreaker/DEPLOYMENT.md) for the detailed cloud database connection guide.

---

## 3-Minute Judge Demonstration Script

1. **Minute 0:00 – 0:30 (Login & Live Dashboard Overview)**:
   - Click **"Sign In as Finance Operator"**.
   - Show the 6 live database KPI cards (Total Invoices, High Risk, Duplicates, Pending, Approved, Blocked).
   - Highlight that all metrics query the live database in real time.
2. **Minute 0:30 – 1:00 (Clean Baseline Ingestion)**:
   - Navigate to **"Upload Invoice"** and click **"Test Clean (INV-9899)"**.
   - Watch the multi-stage ingestion progress.
   - Status locks to **`APPROVED`** with Risk **0/100 (LOW)**.
3. **Minute 1:00 – 2:00 (MANDATORY JUDGE TEST: Tampered Invoice)**:
   - Click **"Test Tampered (INV-9821)"** (or drag & drop `tampered_invoice_apex.pdf`).
   - The deterministic engine detects:
     - Duplicate collision against historical invoice `#INV-2024-9821`.
     - Altered tax rate: claimed 12.0% vs vendor's contracted 18.0%.
   - Risk score locks to **100/100 (CRITICAL)**.
   - Approval state automatically locks to **`BLOCKED`**.
   - Click **"Side-by-Side Diff"** to inspect the original vs tampered document comparison modal.
4. **Minute 2:00 – 2:30 (Chief Auditor Review & Role Enforcement)**:
   - Log out and log in as **Chief Auditor** (`auditor@veritas.internal`).
   - Navigate to **"Approvals"** and confirm the blocked state with audit notes.
   - In **"Vendors"**, set Apex Industrial Supplies to `UNDER_REVIEW`.
5. **Minute 2:30 – 3:00 (Audit Verification & Export)**:
   - Navigate to **"Audit Trail"** and click **"Verify Hash Chain"** to confirm mathematical immutability across all blocks.
   - Navigate to **"Reports & Export"** and download both:
     - **Certified Forensic Audit Packet (PDF)**
     - **Audit Trail Ledger (CSV)**
