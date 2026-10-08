# VERITAS: Vercel Production Deployment Guide

This guide details how to deploy **Veritas AP Audit Gateway** to Vercel with a live cloud database so judges and auditors can access the application from any browser, laptop, or phone without relying on a local machine.

---

## 1. Prerequisites

1. **Vercel Account**: Free tier on [vercel.com](https://vercel.com).
2. **Cloud PostgreSQL Database**: Free managed instance from:
   - **Neon** ([neon.tech](https://neon.tech)) — Recommended (instant serverless PostgreSQL).
   - **Supabase** ([supabase.com](https://supabase.com)).
   - **Vercel Postgres** (built-in marketplace).
   - **AWS RDS / Render**.
3. **Google Gemini API Key** (Optional for multimodal vision; deterministic fallback engine is included):
   - Obtain from [Google AI Studio](https://aistudio.google.com).
4. **Git Repository**: GitHub, GitLab, or Bitbucket.

---

## 2. Production Architecture on Vercel

```
User's Browser (Any Device)
            │
            ▼
     Vercel Edge Network
            │
            ├─────────────────────────────────────────┐
            │ Static Assets & SPA Routing             │ Serverless API Functions
            ▼                                         ▼
   Vite + React 19 Frontend                     Python FastAPI Engine
     (frontend/dist/)                              (api/index.py)
                                                      │
                                                      ├────────────────────────┐
                                                      ▼                        ▼
                                            Managed Cloud Database    Google Gemini AI
                                            (Neon / Supabase / RDS)   (Perceptual Vision)
                                            • Invoices & Line Items
                                            • Base64 Document Blobs
                                            • Hash-Chained Audit Logs
```

---

## 3. Required Environment Variables

Configure these in your **Vercel Project Settings $\to$ Environment Variables**:

| Variable | Description | Exposure | Example Format |
| :--- | :--- | :---: | :--- |
| `DATABASE_URL` | **Cloud PostgreSQL Connection String** (Required for multi-device live persistence) | **Server-Only** | `postgresql://user:password@ep-host.region.pooler.neon.tech/veritas?sslmode=require` |
| `GEMINI_API_KEY` | Google Gemini API key for multimodal document perception | **Server-Only** | `AIzaSy...` |
| `AUTH_SECRET` | Secret token for session authorization & tamper-proof signing | **Server-Only** | `c9f8a42e18d34b7f...` |
| `ENVIRONMENT` | Target runtime environment | **Server-Only** | `production` |

> [!IMPORTANT]
> **Zero Client-Side Secret Leakage**: Notice that none of the environment variables are prefixed with `VITE_`. All database credentials and AI keys are strictly isolated on the server and will never be bundled into the browser JavaScript assets.

---

## 4. Cloud Database Setup (e.g. Neon or Supabase)

1. Create a free PostgreSQL database on [neon.tech](https://neon.tech) or [supabase.com](https://supabase.com).
2. Copy your connection URI.
   - Example: `postgresql://neondb_owner:npg_xyz@ep-cold-smoke-1234.us-east-2.aws.neon.tech/neondb?sslmode=require`
3. **No manual migrations required**:
   - On initial connection, Veritas automatically creates the tables (`vendors`, `invoices`, `invoice_items`, `duplicate_detections`, `audit_logs`, `users`).
   - If the database is empty, Veritas auto-seeds the 4 registered historical vendors and baseline historical paid invoice `INV-2024-9821`.

---

## 5. Vercel Deployment Steps

### Method A: Connect Git Repository (Recommended)
1. Push this repository to GitHub/GitLab.
2. In the Vercel Dashboard, click **"Add New Project"** and select your repository.
3. Configure the Project Settings:
   - **Framework Preset**: `Other` (or auto-detected Vite).
   - **Root Directory**: `./` (leave default).
   - **Build Command**: `npm --prefix frontend install && npm --prefix frontend run build` (configured in `vercel.json`).
   - **Output Directory**: `frontend/dist`.
4. Under **Environment Variables**, paste:
   - `DATABASE_URL` = `<your-cloud-postgres-connection-string>`
   - `GEMINI_API_KEY` = `<your-gemini-key>` (optional)
   - `AUTH_SECRET` = `veritas_production_secret_key_2026`
   - `ENVIRONMENT` = `production`
5. Click **"Deploy"**.

### Method B: Deploy using Vercel CLI
```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login to Vercel
vercel login

# 3. Deploy to production
vercel --prod
```

---

## 6. How Document Storage Works in Serverless

In standard Vercel serverless functions, the local filesystem is ephemeral and read-only outside `/tmp`.
Veritas uses a **Cloud-Native Database Blob Storage Architecture**:
1. When an invoice is uploaded, its binary content is securely fingerprinted with SHA-256 and stored as a base64 string directly inside the cloud PostgreSQL `invoices` table (`file_base64`).
2. When any judge clicks **"View Raw Document"** or inspects duplicates, the backend serves the document directly from cloud storage via `/api/invoices/{id}/file`.
3. **Result**: Zero dependency on local disk. Invoices, risk evaluations, and audit logs persist across all serverless invocations and page refreshes.

---

## 7. Mandatory Competition Test Verification on Public URL

Once deployed, open your live Vercel URL (`https://your-project.vercel.app`) on any device:

1. **Verify Role Persistence**:
   - The top banner displays the active persona (**Finance Operator: Sarah Jenkins** vs **Chief Auditor: Marcus Vance**).
   - Select either persona; refresh the page. The chosen persona persists.
2. **Execute the Mandatory Tampered Invoice Test**:
   - Click the red button: **`JUDGE TEST: Tampered Invoice (INV-9821)`** (or download `tampered_invoice_apex.pdf` and drag & drop it).
   - Watch the live telemetry bar process the file.
   - The status updates in real time to **`REJECTED_DUPLICATE`** with a **Risk Score of 100/100 (CRITICAL)**.
   - The AI Explanation Card shows:
     - Duplicate collision: *Invoice #INV-2024-9821 was previously processed and approved 18 days ago*.
     - Tax rate anomaly: *Contracted rate 18.0% vs Claimed 12.0% ($750 tax understated)*.
3. **Verify Cloud Database Persistence**:
   - Refresh the page, or open the URL in an incognito window or from a smartphone.
   - Navigate to the **Invoices Ledger** tab: the rejected invoice and its audit details are permanently present.
4. **Chief Auditor Adjudication & Forensic PDF**:
   - Switch to **Chief Auditor** mode.
   - Click **`Confirm Fraud`** and **`Quarantine Vendor`**.
   - Navigate to **Tamper-Evident Logs** and click **`Verify Cryptographic Chain`** (proves SHA-256 blocks are untampered).
   - Click **`Export Certified Forensic Audit Packet (PDF)`** to download the signed PDF report.

---

## 8. Common Deployment Issues & Fixes

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `sqlalchemy.exc.OperationalError: no such table` | Database tables not initialized | Handled automatically: Veritas auto-creates tables and seeds baseline data on first request. |
| `connection refused` or `database is locked` | SQLite used in serverless | Provide a valid cloud PostgreSQL `DATABASE_URL` (Neon or Supabase) in Vercel environment variables. |
| `413 Payload Too Large` | Upload file exceeds Vercel 4.5MB serverless body limit | Supported invoices are standard PDFs (typically < 1MB). If submitting massive scans, compress or use standard 300 DPI PDFs. |
| `ModuleNotFoundError` on Vercel build | Missing Python dependency | Verify `requirements.txt` is in the repository root. |
| `404 on page refresh` | SPA routing not configured | Handled automatically by the rewrite rules in `vercel.json` (`/(.*) -> /index.html`). |
