import { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert, ShieldCheck, FileText, Upload, AlertTriangle,
  CheckCircle2, XCircle, RefreshCw, Download, 
  Database, Building2, Lock, History,
  FileSpreadsheet, AlertOctagon,
  LayoutDashboard, Clock, LogOut, Search,
  X, ShieldX, Sparkles,
  ExternalLink, User, PlusCircle, BookOpen, Check,
  CircleDollarSign, TrendingUp, Receipt
} from 'lucide-react';

interface AuthUser {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: 'FINANCE_OPERATOR' | 'CHIEF_AUDITOR';
}

interface DashboardStats {
  total_invoices: number;
  high_risk_invoices: number;
  duplicate_invoices: number;
  pending_approvals: number;
  approved_invoices: number;
  blocked_invoices: number;
  total_volume_usd: number;
  risk_distribution?: Record<string, number>;
  status_distribution?: Record<string, number>;
  recent_invoices?: any[];
}

interface Vendor {
  id: string;
  name: string;
  tax_id: string;
  risk_tier: string;
  default_tax_rate: number;
  status: string;
  historical_invoice_count: number;
  historical_total_spent: number;
  avg_invoice_amount: number;
  max_invoice_amount: number;
  last_transaction_date?: string;
}

interface LineItem {
  line_index: number;
  description: string;
  quantity: number;
  unit_price: number;
  claimed_total: number;
  calculated_total: number;
  discrepancy_flag: boolean;
  discrepancy_reason?: string;
}

interface RiskFactor {
  factor: string;
  points: number;
  description: string;
}

interface FraudFinding {
  finding_type: string;
  severity: string;
  evidence: string;
  explanation: string;
}

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  vendor?: Vendor;
  file_name: string;
  file_url?: string;
  file_hash_sha256: string;
  invoice_date?: string;
  due_date?: string;
  subtotal: number;
  claimed_tax_rate: number;
  claimed_tax_amount: number;
  calculated_tax_amount: number;
  total_amount: number;
  currency: string;
  approval_status: 'PENDING' | 'APPROVED' | 'BLOCKED';
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_breakdown?: RiskFactor[];
  fraud_findings?: FraudFinding[];
  ai_explanation?: any;
  adjudication_notes?: string;
  adjudicated_by?: string;
  adjudicated_at?: string;
  line_items: LineItem[];
  matched_duplicate?: any;
  created_at: string;
  billing?: {
    audit_status: string;
    audit_fee: number;
    currency: string;
    billing_status: string;
    transaction_id: string;
    reference_id: string;
    completed_at?: string;
  };
}

interface RevenueTransaction {
  id: string;
  invoice_id: string;
  invoice_number?: string;
  audit_id: string;
  user_id?: string;
  customer_name: string;
  transaction_type: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  reference_id: string;
  created_at: string;
  completed_at: string;
}

interface RevenueSummary {
  total_revenue: number;
  today_revenue: number;
  this_month_revenue: number;
  total_audited_invoices: number;
  billable_invoices: number;
  free_audits: number;
  average_revenue_per_invoice: number;
  current_price_per_audit: number;
  currency: string;
}

interface RevenueChartPoint {
  date: string;
  amount: number;
  audit_count: number;
}

interface AuditLog {
  id: string;
  invoice_id?: string;
  event_type: string;
  severity: string;
  actor_role: string;
  actor_id: string;
  actor_name?: string;
  details: any;
  prev_log_hash: string;
  current_log_hash: string;
  timestamp: string;
}

export default function App() {
  // Authentication State
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('veritas_token'));
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('veritas_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // App Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'invoices' | 'upload' | 'vendors' | 'approvals' | 'audit_trail' | 'reports' | 'system' | 'profile' | 'revenue'>('dashboard');

  // Live Database Data
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [currentInvoice, setCurrentInvoice] = useState<InvoiceDetail | null>(null);

  // Revenue & Billing State
  const [revenueSummary, setRevenueSummary] = useState<RevenueSummary | null>(null);
  const [revenueTransactions, setRevenueTransactions] = useState<RevenueTransaction[]>([]);
  const [revenueChartData, setRevenueChartData] = useState<RevenueChartPoint[]>([]);
  const [revenueSearch, setRevenueSearch] = useState('');
  const [isLoadingRevenue, setIsLoadingRevenue] = useState(false);

  // Upload & Process State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressStage, setUploadProgressStage] = useState<string>('');
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number>(0);

  // Vendor Registration & Management Suite State (Option C)
  const [vendorSubView, setVendorSubView] = useState<'directory' | 'create' | 'import'>('directory');
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorStatusFilter, setVendorStatusFilter] = useState('ALL');
  const [editingTaxRateVendor, setEditingTaxRateVendor] = useState<{ vendorId: string; vendorName: string; currentRate: number; newRate: number; reason: string } | null>(null);
  const [importCsvFile, setImportCsvFile] = useState<File | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvPreviewRows, setCsvPreviewRows] = useState<any[]>([]);
  const [csvRawText, setCsvRawText] = useState('');
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const [showRegisterVendorModal, setShowRegisterVendorModal] = useState(false);
  const [registerVendorForm, setRegisterVendorForm] = useState({
    name: '',
    tax_id: '',
    default_tax_rate: 18,
    risk_tier: 'LOW',
    status: 'ACTIVE',
    avg_invoice_amount: 10000,
    max_invoice_amount: 50000
  });
  const [isSubmittingVendor, setIsSubmittingVendor] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);

  // UI Modals & Filters
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [adjudicateModal, setAdjudicateModal] = useState<{ open: boolean; targetStatus: 'APPROVED' | 'BLOCKED'; invoiceId: string; reason: string } | null>(null);
  const [chainProof, setChainProof] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const authHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
  };

  // Load live data from real database
  const loadData = async () => {
    try {
      const headers = authHeaders();
      const [statsRes, invRes, vendRes, logsRes] = await Promise.all([
        fetch('/api/dashboard/stats', { headers }),
        fetch('/api/invoices', { headers }),
        fetch('/api/vendors', { headers }),
        fetch('/api/audit-logs', { headers })
      ]);

      if (statsRes.ok) setDashboardStats(await statsRes.json());
      if (invRes.ok) setInvoices(await invRes.json());
      if (vendRes.ok) setVendors(await vendRes.json());
      if (logsRes.ok) setAuditLogs(await logsRes.json());

      if (currentUser?.role === 'CHIEF_AUDITOR') {
        loadRevenueData();
      }
    } catch (err) {
      console.error('Error fetching live data:', err);
    }
  };

  // Load live revenue data from live database (Chief Auditor only)
  const loadRevenueData = async () => {
    if (!authToken || currentUser?.role !== 'CHIEF_AUDITOR') return;
    setIsLoadingRevenue(true);
    try {
      const headers = authHeaders();
      const [sumRes, txnRes, chartRes] = await Promise.all([
        fetch('/api/revenue/summary', { headers }),
        fetch('/api/revenue/transactions', { headers }),
        fetch('/api/revenue/chart', { headers })
      ]);

      if (sumRes.ok) setRevenueSummary(await sumRes.json());
      if (txnRes.ok) setRevenueTransactions(await txnRes.json());
      if (chartRes.ok) setRevenueChartData(await chartRes.json());
    } catch (err) {
      console.error('Error fetching revenue data:', err);
    } finally {
      setIsLoadingRevenue(false);
    }
  };

  useEffect(() => {
    if (authToken) {
      loadData();
      if (currentUser?.role === 'CHIEF_AUDITOR') {
        loadRevenueData();
      }
    }
  }, [authToken, currentUser?.role]);

  // Authentication Handlers
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Please enter both User ID / Corporate Email and password.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Authentication failed. Please verify credentials.');
      }

      const data = await res.json();
      setAuthToken(data.access_token);
      setCurrentUser(data.user);
      localStorage.setItem('veritas_token', data.access_token);
      localStorage.setItem('veritas_user', JSON.stringify(data.user));
      showToast(`Welcome back, ${data.user.full_name} (${data.user.role.replace('_', ' ')})`, 'success');
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSelectRolePreset = (role: 'OPERATOR' | 'AUDITOR') => {
    if (role === 'OPERATOR') {
      setLoginEmail('operator@veritas.internal');
      setLoginPassword('Operator@123');
      setLoginError(null);
      showToast('Loaded Finance Operator credentials into fields. Click "AUTHENTICATE SESSION" to log in.', 'info');
    } else {
      setLoginEmail('auditor@veritas.internal');
      setLoginPassword('Auditor@123');
      setLoginError(null);
      showToast('Loaded Chief Auditor credentials into fields. Click "AUTHENTICATE SESSION" to log in.', 'info');
    }
  };

  const handleLogout = async () => {
    try {
      if (authToken) {
        await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() });
      }
    } catch (e) {}
    setAuthToken(null);
    setCurrentUser(null);
    localStorage.removeItem('veritas_token');
    localStorage.removeItem('veritas_user');
    showToast('Signed out successfully.', 'info');
  };

  // Upload & Process Invoice
  const handleProcessSelectedFile = async (fileToProcess?: File) => {
    const file = fileToProcess || selectedFile;
    if (!file) {
      showToast('Please select or drop an invoice document first.', 'error');
      return;
    }

    setIsUploading(true);
    setUploadProgressStage('Validating document & computing cryptographic SHA-256 fingerprint...');
    setUploadProgressPercent(20);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setTimeout(() => {
        setUploadProgressStage('Multimodal AI: Extracting line items, tax rates, and totals...');
        setUploadProgressPercent(50);
      }, 500);

      setTimeout(() => {
        setUploadProgressStage('Deterministic Audit: Running 4-tier duplicate sieve and tax policy checks...');
        setUploadProgressPercent(80);
      }, 1000);

      const res = await fetch('/api/invoices/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload processing failed.');
      }

      const result = await res.json();
      setUploadProgressStage('Audit finalized: Approval state locked in live cloud database.');
      setUploadProgressPercent(100);

      // Load full invoice detail from server
      const detailRes = await fetch(`/api/invoices/${result.invoice_id}`, { headers: authHeaders() });
      if (detailRes.ok) {
        const fullDetail = await detailRes.json();
        setCurrentInvoice(fullDetail);
      }

      await loadData();
      setSelectedFile(null);
      showToast(
        `Processed Invoice #${result.invoice_number}: Status locked to ${result.approval_status} (Risk ${result.risk_score}/100).`,
        result.approval_status === 'BLOCKED' ? 'error' : 'success'
      );
      setActiveTab('invoices');
    } catch (err: any) {
      showToast(`Processing error: ${err.message}`, 'error');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
      }, 500);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  // Helper to load sample files directly from backend
  const runSampleInvoice = async (filename: string) => {
    try {
      const res = await fetch(`/api/demo-files/${filename}`);
      if (!res.ok) throw new Error('Could not fetch sample document.');
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'application/pdf' });
      setSelectedFile(file);
      await handleProcessSelectedFile(file);
    } catch (err: any) {
      showToast(`Sample test failed: ${err.message}`, 'error');
    }
  };

  // Real Approval Actions (Chief Auditor Only)
  const handleConfirmAdjudication = async () => {
    if (!adjudicateModal) return;
    const { targetStatus, invoiceId, reason } = adjudicateModal;

    try {
      const endpoint = targetStatus === 'APPROVED' ? `/api/invoices/${invoiceId}/approve` : `/api/invoices/${invoiceId}/block`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({ reason: reason || `Adjudication status updated to ${targetStatus}` })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Action rejected');
      }

      const updated = await fetch(`/api/invoices/${invoiceId}`, { headers: authHeaders() }).then(r => r.json());
      setCurrentInvoice(updated);
      await loadData();
      setAdjudicateModal(null);
      showToast(`Invoice #${updated.invoice_number} successfully ${targetStatus}. Recorded in audit trail.`, targetStatus === 'APPROVED' ? 'success' : 'error');
    } catch (err: any) {
      showToast(`Adjudication failed: ${err.message}`, 'error');
    }
  };

  const handleVendorQuarantine = async (vendorId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/vendors/${vendorId}/status?status=${newStatus}`, {
        method: 'POST',
        headers: authHeaders()
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Quarantine update failed');
      }
      await loadData();
      showToast(`Vendor status updated to ${newStatus}.`, 'info');
    } catch (err: any) {
      showToast(`Vendor action failed: ${err.message}`, 'error');
    }
  };

  const handleRegisterVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerVendorForm.name || !registerVendorForm.tax_id) {
      showToast('Please enter both Vendor Name and Tax ID / GSTIN.', 'error');
      return;
    }
    setIsSubmittingVendor(true);
    setVendorError(null);
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({
          ...registerVendorForm,
          default_tax_rate: registerVendorForm.default_tax_rate > 1 ? registerVendorForm.default_tax_rate / 100 : registerVendorForm.default_tax_rate
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to register vendor.');
      }

      const created = await res.json();
      showToast(`Vendor ${created.name} successfully registered with ${((created.default_tax_rate || 0.18) * 100).toFixed(0)}% statutory tax baseline.`, 'success');
      setShowRegisterVendorModal(false);
      setVendorSubView('directory');
      setRegisterVendorForm({
        name: '',
        tax_id: '',
        default_tax_rate: 18,
        risk_tier: 'LOW',
        status: 'ACTIVE',
        avg_invoice_amount: 10000,
        max_invoice_amount: 50000
      });
      await loadData();
    } catch (err: any) {
      setVendorError(err.message || 'Error creating vendor');
      showToast(err.message || 'Error creating vendor', 'error');
    } finally {
      setIsSubmittingVendor(false);
    }
  };

  const handleUpdateContractTaxRate = async (vendorId: string, newRate: number, reason: string) => {
    try {
      const res = await fetch(`/api/vendors/${vendorId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({
          default_tax_rate: newRate > 1 ? newRate / 100 : newRate,
          reason: reason || 'Contractual statutory tax rate updated via UI.'
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to update contract rate.');
      }

      const updated = await res.json();
      showToast(`Contract tax rate for ${updated.name} updated to ${((updated.default_tax_rate || 0.18) * 100).toFixed(1)}%.`, 'success');
      setEditingTaxRateVendor(null);
      await loadData();
    } catch (err: any) {
      showToast(`Update failed: ${err.message}`, 'error');
    }
  };

  const handleCsvFileSelection = (file: File) => {
    setImportCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setCsvRawText(text);
      parseCsvPreview(text);
    };
    reader.readAsText(file);
  };

  const parseCsvPreview = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 1) {
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows = lines.slice(1, 10).map(line => {
        const parts = line.split(',');
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = parts[i]?.trim(); });
        return obj;
      });
      setCsvPreviewRows(rows);
    } else {
      setCsvPreviewRows([]);
    }
  };

  const handleExecuteCsvImport = async () => {
    if (!importCsvFile && !csvRawText.trim()) {
      showToast('Please select a CSV file or paste CSV text to import.', 'error');
      return;
    }

    setIsImportingCsv(true);
    try {
      let fileToSend: File;
      if (importCsvFile) {
        fileToSend = importCsvFile;
      } else {
        const blob = new Blob([csvRawText], { type: 'text/csv' });
        fileToSend = new File([blob], 'pasted_vendors.csv', { type: 'text/csv' });
      }

      const formData = new FormData();
      formData.append('file', fileToSend);

      const res = await fetch('/api/vendors/import-csv', {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Bulk vendor import failed.');
      }

      const result = await res.json();
      showToast(result.message || `Successfully imported vendors!`, 'success');
      setImportCsvFile(null);
      setCsvRawText('');
      setCsvPreviewRows([]);
      setVendorSubView('directory');
      await loadData();
    } catch (err: any) {
      showToast(`Import error: ${err.message}`, 'error');
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleVerifyAuditChain = async () => {
    try {
      const res = await fetch('/api/audit-logs/verify', { headers: authHeaders() });
      if (res.ok) {
        const proof = await res.json();
        setChainProof(proof);
        showToast(proof.valid ? "Cryptographic hash chain 100% verified across all blocks!" : "Chain integrity check failed!", proof.valid ? 'success' : 'error');
      }
    } catch (err) {
      showToast("Verification request failed.", 'error');
    }
  };

  // LOGIN SCREEN
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 font-sans selection:bg-cyan-500 selection:text-white">
        <div className="max-w-md w-full space-y-8 p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-500" />
          
          <div className="text-center">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center mx-auto shadow-xl shadow-cyan-500/20 mb-4">
              <ShieldAlert className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white">VERITAS</h2>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-mono">
              Accounts Payable Audit Gateway
            </p>
          </div>

          {loginError && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={(e) => handleLogin(e)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                User ID / Corporate Email
              </label>
              <input
                type="text"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="operator_internal or operator@veritas.internal"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter password (e.g. Operator@123 or Auditor@123)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20 transition disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
            >
              {isLoggingIn ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              <span>AUTHENTICATE SESSION</span>
            </button>
          </form>

          {/* Quick-Fill Role Buttons for Evaluation */}
          <div className="pt-4 border-t border-slate-800 space-y-2.5">
            <div className="text-center">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Fill Role Credentials
              </span>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Click to load credentials into the form, then click Authenticate Session.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectRolePreset('OPERATOR')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  loginEmail === 'operator@veritas.internal'
                    ? 'bg-cyan-950/40 border-cyan-500/50'
                    : 'bg-slate-950 hover:bg-slate-800 border-slate-800'
                }`}
              >
                <div className="text-xs font-bold text-cyan-400">Finance Operator</div>
                <div className="text-[10px] text-slate-400 font-mono truncate">operator_internal</div>
                <div className="text-[9px] text-slate-500 font-mono mt-0.5">Pass: Operator@123</div>
              </button>
              <button
                type="button"
                onClick={() => handleSelectRolePreset('AUDITOR')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  loginEmail === 'auditor@veritas.internal'
                    ? 'bg-indigo-950/40 border-indigo-500/50'
                    : 'bg-slate-950 hover:bg-slate-800 border-slate-800'
                }`}
              >
                <div className="text-xs font-bold text-indigo-400">Chief Auditor</div>
                <div className="text-[10px] text-slate-400 font-mono truncate">auditor_internal</div>
                <div className="text-[9px] text-slate-500 font-mono mt-0.5">Pass: Auditor@123</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Filtered Invoices Ledger
  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = !invoiceSearch || 
      inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.vendor_name.toLowerCase().includes(invoiceSearch.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || inv.approval_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* ENTERPRISE TOP NAVIGATION BAR */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  VERITAS
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 uppercase tracking-widest font-mono">
                  ENTERPRISE v2.0
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono -mt-0.5">Automated Accounts Payable Audit Gateway</p>
            </div>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center space-x-3">
            <button
              onClick={loadData}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Refresh live data from cloud database"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-xs transition cursor-pointer text-left"
              title="View Profile & Operating Guide"
            >
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <span className="font-bold text-slate-200 block">{currentUser.username}</span>
                <span className="text-[10px] text-cyan-400 font-mono">{currentUser.full_name}</span>
              </div>
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 border border-slate-700 hover:border-rose-800 text-xs font-semibold transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-800/80">
          <nav className="flex space-x-1 py-1.5 text-xs font-medium overflow-x-auto">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition shrink-0 ${
                activeTab === 'dashboard'
                  ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('invoices')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition shrink-0 ${
                activeTab === 'invoices'
                  ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Invoices Ledger</span>
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition shrink-0 ${
                activeTab === 'upload'
                  ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Invoice</span>
            </button>

            <button
              onClick={() => setActiveTab('vendors')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition shrink-0 ${
                activeTab === 'vendors'
                  ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Vendors Registry</span>
            </button>

            <button
              onClick={() => setActiveTab('approvals')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition shrink-0 ${
                activeTab === 'approvals'
                  ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Approvals Governance</span>
            </button>

            <button
              onClick={() => setActiveTab('audit_trail')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition shrink-0 ${
                activeTab === 'audit_trail'
                  ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Audit Trail</span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition shrink-0 ${
                activeTab === 'reports'
                  ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Reports & Export</span>
            </button>

            {currentUser.role === 'CHIEF_AUDITOR' && (
              <button
                onClick={() => {
                  setActiveTab('revenue');
                  loadRevenueData();
                }}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition shrink-0 ${
                  activeTab === 'revenue'
                    ? 'bg-slate-800 text-emerald-400 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <CircleDollarSign className="h-3.5 w-3.5 text-emerald-400" />
                <span>Revenue & Billing</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('system')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition shrink-0 ${
                activeTab === 'system'
                  ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Database className="h-3.5 w-3.5" />
              <span>System & API Status</span>
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition shrink-0 ${
                activeTab === 'profile'
                  ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>Profile & Guide</span>
            </button>
          </nav>
        </div>
      </header>

      {/* TOAST ALERT */}
      {toastMessage && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center space-x-2 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold border backdrop-blur-md animate-in slide-in-from-bottom duration-300 ${
          toastMessage.type === 'error'
            ? 'bg-rose-950/95 border-rose-700 text-rose-200'
            : toastMessage.type === 'info'
            ? 'bg-cyan-950/95 border-cyan-700 text-cyan-200'
            : 'bg-emerald-950/95 border-emerald-700 text-emerald-200'
        }`}>
          {toastMessage.type === 'error' ? <AlertTriangle className="h-4 w-4 text-rose-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* 1. DASHBOARD VIEW */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Real-Time Audit Intelligence Gateway
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Autonomous surveillance querying live cloud database records and transaction histories.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('upload')}
                  className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-lg shadow-cyan-600/20 transition"
                >
                  <Upload className="h-4 w-4" />
                  <span>Intake New Invoice</span>
                </button>
              </div>
            </div>

            {/* Live KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Invoices</div>
                <div className="mt-2 text-2xl font-bold font-mono text-white">
                  {dashboardStats ? dashboardStats.total_invoices : '—'}
                </div>
                <div className="mt-1 text-[11px] text-slate-500 font-mono">Total documents in database</div>
                <div className="absolute top-4 right-4 h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                  <FileText className="h-4 w-4" />
                </div>
              </div>

              <div className="bg-slate-900 border border-rose-900/40 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">High-Risk Invoices</div>
                <div className="mt-2 text-2xl font-bold font-mono text-rose-400">
                  {dashboardStats ? dashboardStats.high_risk_invoices : '—'}
                </div>
                <div className="mt-1 text-[11px] text-rose-500/80 font-mono">Risk score ≥ 60/100</div>
                <div className="absolute top-4 right-4 h-8 w-8 rounded-lg bg-rose-950/80 flex items-center justify-center text-rose-400">
                  <AlertOctagon className="h-4 w-4" />
                </div>
              </div>

              <div className="bg-slate-900 border border-amber-900/40 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Duplicate Invoices</div>
                <div className="mt-2 text-2xl font-bold font-mono text-amber-400">
                  {dashboardStats ? dashboardStats.duplicate_invoices : '—'}
                </div>
                <div className="mt-1 text-[11px] text-amber-500/80 font-mono">Sieve collisions detected</div>
                <div className="absolute top-4 right-4 h-8 w-8 rounded-lg bg-amber-950/80 flex items-center justify-center text-amber-400">
                  <ShieldX className="h-4 w-4" />
                </div>
              </div>

              <div className="bg-slate-900 border border-cyan-900/40 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                <div className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">Pending Approvals</div>
                <div className="mt-2 text-2xl font-bold font-mono text-cyan-400">
                  {dashboardStats ? dashboardStats.pending_approvals : '—'}
                </div>
                <div className="mt-1 text-[11px] text-cyan-500/80 font-mono">Requires auditor sign-off</div>
                <div className="absolute top-4 right-4 h-8 w-8 rounded-lg bg-cyan-950/80 flex items-center justify-center text-cyan-400">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
            </div>

            {/* Approved vs Blocked Secondary Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/80 border border-emerald-900/30 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Approved Invoices</span>
                  <div className="text-xl font-bold font-mono text-white mt-1">
                    {dashboardStats ? dashboardStats.approved_invoices : '—'} Invoices
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Disbursement cleared; statutory rates validated.</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-emerald-950 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>

              <div className="bg-slate-900/80 border border-rose-900/30 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Blocked Invoices</span>
                  <div className="text-xl font-bold font-mono text-white mt-1">
                    {dashboardStats ? dashboardStats.blocked_invoices : '—'} Invoices
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Disbursement frozen; duplicate or altered tax rate flagged.</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-rose-950 border border-rose-800/40 flex items-center justify-center text-rose-400">
                  <XCircle className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Total Audited Volume Metric */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Audited Transaction Volume</span>
                <div className="text-2xl font-extrabold font-mono text-white mt-1">
                  ${dashboardStats ? dashboardStats.total_volume_usd.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'} USD
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Calculated across all historical and active invoice records in live database.</p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('invoices')}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                >
                  View Invoices Ledger
                </button>
              </div>
            </div>

            {/* Recent Live Invoices Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Recent Invoices in Database</h3>
                <span className="text-[10px] text-slate-400 font-mono">Live SQL Query</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Vendor</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3 text-center">Risk</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right font-sans">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {dashboardStats?.recent_invoices?.map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 font-bold text-white">{inv.invoice_number}</td>
                        <td className="py-2.5 px-3 font-sans text-slate-200">{inv.vendor_name}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-100">${inv.total_amount?.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.risk_score >= 60 ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          }`}>
                            {inv.risk_score}/100
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.approval_status === 'BLOCKED' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                            inv.approval_status === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                            'bg-cyan-950 text-cyan-400 border border-cyan-800'
                          }`}>
                            {inv.approval_status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-sans">
                          <button
                            onClick={async () => {
                              const res = await fetch(`/api/invoices/${inv.id}`, { headers: authHeaders() });
                              if (res.ok) {
                                setCurrentInvoice(await res.json());
                                setActiveTab('invoices');
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 transition"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 2. INVOICE UPLOAD VIEW */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            <div className="pb-2 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                <span>Invoice Intake & Multimodal Audit Gateway</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload actual PDF or image invoices. Files are hashed (SHA-256), extracted, audited, and stored in cloud database.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Upload Drop Zone */}
              <div className="lg:col-span-2 space-y-4">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-3xl p-8 text-center cursor-pointer transition bg-slate-900/60 hover:bg-slate-900 group"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="h-14 w-14 rounded-2xl bg-slate-800 text-cyan-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition">
                    <Upload className="h-7 w-7" />
                  </div>
                  <h4 className="text-base font-bold text-white">Drag & drop invoice document here</h4>
                  <p className="text-xs text-slate-400 mt-1">Accepts PDF, PNG, JPG, or JPEG (Max 10MB)</p>
                  <span className="inline-block mt-3 text-xs font-semibold text-cyan-400 underline">
                    or browse files from device
                  </span>
                </div>

                {/* Staged File Card */}
                {selectedFile && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Selected Document</span>
                      <button
                        onClick={() => setSelectedFile(null)}
                        className="text-xs text-slate-400 hover:text-rose-400 transition"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="flex items-center space-x-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="h-10 w-10 rounded-lg bg-cyan-950 border border-cyan-800/40 text-cyan-400 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{selectedFile.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'application/pdf'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleProcessSelectedFile()}
                      disabled={isUploading}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20 transition disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      {isUploading ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Processing Invoice...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 text-amber-300" />
                          <span>PROCESS INVOICE VIA AUDIT GATEWAY</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Live Progress Bar */}
                {isUploading && (
                  <div className="p-4 rounded-2xl bg-slate-900 border border-cyan-800 text-center space-y-3">
                    <p className="text-xs font-mono text-cyan-300">{uploadProgressStage}</p>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sample Files for Evaluation */}
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Evaluation Test Files</h3>
                  <p className="text-xs text-slate-400">
                    Test documents pre-generated on the server to verify the audit pipeline without requiring manual file uploads:
                  </p>

                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => runSampleInvoice('tampered_invoice_apex.pdf')}
                      disabled={isUploading}
                      className="w-full text-left p-3 rounded-xl bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/60 transition group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-300">Tampered Duplicate Invoice</span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-900 text-rose-200">
                          FAIL EXPECTED
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Invoice #INV-2024-9821 with altered tax rate (12% vs 18%). Triggers duplicate collision and 100/100 risk.
                      </p>
                    </button>

                    <button
                      onClick={() => runSampleInvoice('demo_invoice_abc_1042.pdf')}
                      disabled={isUploading}
                      className="w-full text-left p-3 rounded-xl bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/60 transition group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-300">ABC Supplies Tampered Invoice</span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-900 text-rose-200">
                          FAIL EXPECTED
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Invoice #INV-2026-1042 with 28% tax rate vs 18% historical. Triggers duplicate collision and 92/100 risk.
                      </p>
                    </button>

                    <button
                      onClick={() => runSampleInvoice('clean_invoice_apex.pdf')}
                      disabled={isUploading}
                      className="w-full text-left p-3 rounded-xl bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-800/60 transition group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-300">Compliant Clean Invoice</span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-900 text-emerald-200">
                          PASS EXPECTED
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Invoice #INV-2024-9899. Matches contracted 18% rate, clean line items. Risk score 0/100.
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. INVOICES LEDGER & DETAIL VIEW */}
        {activeTab === 'invoices' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">Accounts Payable Invoices Ledger</h2>
                <p className="text-xs text-slate-400 mt-0.5">Live database ledger containing extracted financial data and fraud scores.</p>
              </div>

              {/* Search & Filter Controls */}
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    placeholder="Search invoice or vendor..."
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 w-48 sm:w-60"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">PENDING</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="BLOCKED">BLOCKED</option>
                </select>
              </div>
            </div>

            {/* Split Screen or Selected Invoice Detail Card */}
            {currentInvoice && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-lg font-bold text-white">Invoice #{currentInvoice.invoice_number}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        currentInvoice.approval_status === 'BLOCKED' ? 'bg-rose-950 text-rose-400 border-rose-800' :
                        currentInvoice.approval_status === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
                        'bg-cyan-950 text-cyan-400 border-cyan-800'
                      }`}>
                        {currentInvoice.approval_status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Vendor: <strong className="text-slate-200">{currentInvoice.vendor?.name || 'Unverified Vendor'}</strong> • SHA-256: <span className="font-mono text-slate-400">{currentInvoice.file_hash_sha256?.substring(0, 16)}...</span>
                    </p>
                  </div>

                  {/* Document & Adjudication Controls */}
                  <div className="flex items-center space-x-2">
                    <a
                      href={`/api/invoices/${currentInvoice.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>View Stored Document</span>
                    </a>

                    {currentUser.role === 'CHIEF_AUDITOR' && (
                      <div className="flex items-center space-x-1 pl-2 border-l border-slate-800">
                        <button
                          onClick={() => setAdjudicateModal({ open: true, targetStatus: 'APPROVED', invoiceId: currentInvoice.id, reason: '' })}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setAdjudicateModal({ open: true, targetStatus: 'BLOCKED', invoiceId: currentInvoice.id, reason: '' })}
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition"
                        >
                          Block
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Score & Fraud Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Risk Score Indicator */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deterministic Risk Score</span>
                    <div className={`text-4xl font-extrabold font-mono mt-1 ${
                      currentInvoice.risk_score >= 60 ? 'text-rose-400' :
                      currentInvoice.risk_score >= 30 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {currentInvoice.risk_score} <span className="text-base text-slate-500">/ 100</span>
                    </div>
                    <span className={`mt-1 px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                      currentInvoice.risk_level === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border-rose-800' :
                      currentInvoice.risk_level === 'HIGH' ? 'bg-rose-950 text-rose-300 border-rose-800' :
                      currentInvoice.risk_level === 'MEDIUM' ? 'bg-amber-950 text-amber-300 border-amber-800' :
                      'bg-emerald-950 text-emerald-300 border-emerald-800'
                    }`}>
                      {currentInvoice.risk_level} RISK
                    </span>
                  </div>

                  {/* AI Explanation Card */}
                  <div className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center space-x-1.5 text-cyan-400 text-xs font-bold uppercase">
                      <Sparkles className="h-4 w-4" />
                      <span>Why This Invoice Was Flagged</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {currentInvoice.ai_explanation?.headline || 'Audit compliance assessment complete.'}
                    </p>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-amber-300 font-mono">
                      Recommended Action: {currentInvoice.ai_explanation?.recommended_action || 'Review transaction history and approve.'}
                    </div>
                  </div>
                </div>

                {/* Billing Section (Pay-Per-Audited-Invoice) */}
                {currentInvoice.billing && (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                      <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                        <Receipt className="h-4 w-4" />
                        <span>Audit Billing & Settlement</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {currentInvoice.billing.billing_status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Audit Status</span>
                        <span className="font-semibold text-slate-200 mt-0.5 block">{currentInvoice.billing.audit_status}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Audit Fee</span>
                        <span className="font-bold text-emerald-400 font-mono mt-0.5 block">
                          ₹{currentInvoice.billing.audit_fee.toFixed(2)} {currentInvoice.billing.currency}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Billing Status</span>
                        <span className="font-semibold text-slate-200 mt-0.5 block">{currentInvoice.billing.billing_status}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Transaction ID</span>
                        <span className="font-mono text-cyan-400 font-semibold text-[11px] truncate mt-0.5 block" title={currentInvoice.billing.transaction_id}>
                          {currentInvoice.billing.transaction_id}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fraud Findings & Score Factor Breakdown */}
                {currentInvoice.risk_breakdown && currentInvoice.risk_breakdown.length > 0 && (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Contributing Score Factors
                    </span>
                    <div className="space-y-1.5">
                      {currentInvoice.risk_breakdown.map((rf, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800/80 text-xs">
                          <span className="text-slate-200 font-medium">{rf.factor}: <span className="text-slate-400 font-mono">{rf.description}</span></span>
                          <span className="font-mono font-bold text-rose-400">+{rf.points} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Duplicate Diff Trigger */}
                {currentInvoice.matched_duplicate && (
                  <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-rose-200">Duplicate Match Found in Historical Ledger</div>
                      <div className="text-[11px] text-rose-300/80 font-mono mt-0.5">
                        Matched with Historical Invoice #{currentInvoice.matched_duplicate.invoice_number} (Status: {currentInvoice.matched_duplicate.approval_status})
                      </div>
                    </div>
                    <button
                      onClick={() => setShowDiffModal(true)}
                      className="px-3 py-1.5 rounded-xl bg-rose-800 hover:bg-rose-700 text-white font-semibold text-xs transition"
                    >
                      Side-by-Side Diff
                    </button>
                  </div>
                )}

                {/* Extracted Line Items Table */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-white uppercase tracking-wider block">Extracted Line Items</span>
                  <div className="overflow-x-auto rounded-2xl border border-slate-800">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-950 text-[10px] text-slate-400 uppercase">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Description</th>
                          <th className="py-2.5 px-3 text-right">Quantity</th>
                          <th className="py-2.5 px-3 text-right">Unit Price</th>
                          <th className="py-2.5 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {currentInvoice.line_items?.map((item) => (
                          <tr key={item.line_index} className="hover:bg-slate-800/40 transition">
                            <td className="py-2.5 px-3">{item.line_index}</td>
                            <td className="py-2.5 px-3 font-sans text-slate-200">{item.description}</td>
                            <td className="py-2.5 px-3 text-right">{item.quantity}</td>
                            <td className="py-2.5 px-3 text-right">${item.unit_price?.toLocaleString()}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-white">${item.claimed_total?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Totals */}
                  <div className="flex justify-end pt-2">
                    <div className="w-64 space-y-1 text-xs font-mono">
                      <div className="flex justify-between text-slate-400">
                        <span>Subtotal:</span>
                        <span>${currentInvoice.subtotal?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Claimed Tax ({(currentInvoice.claimed_tax_rate * 100).toFixed(1)}%):</span>
                        <span>${currentInvoice.claimed_tax_amount?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-white font-bold text-sm pt-1 border-t border-slate-800">
                        <span>Grand Total:</span>
                        <span className="text-emerald-400">${currentInvoice.total_amount?.toLocaleString()} {currentInvoice.currency}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Invoices Ledger Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4 font-sans">Vendor</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">Tax Rate</th>
                      <th className="py-3 px-4 text-right">Total Amount</th>
                      <th className="py-3 px-4 text-center">Risk</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right font-sans">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-bold text-white">{inv.invoice_number}</td>
                        <td className="py-3 px-4 font-sans text-slate-200">{inv.vendor_name}</td>
                        <td className="py-3 px-4 text-slate-400">{inv.invoice_date || 'N/A'}</td>
                        <td className="py-3 px-4 text-right">{(inv.claimed_tax_rate * 100).toFixed(1)}%</td>
                        <td className="py-3 px-4 text-right font-bold text-white">
                          ${inv.total_amount?.toLocaleString()} {inv.currency}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.risk_score >= 60 ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          }`}>
                            {inv.risk_score}/100
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.approval_status === 'BLOCKED' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                            inv.approval_status === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                            'bg-cyan-950 text-cyan-400 border border-cyan-800'
                          }`}>
                            {inv.approval_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-sans">
                          <button
                            onClick={async () => {
                              const res = await fetch(`/api/invoices/${inv.id}`, { headers: authHeaders() });
                              if (res.ok) {
                                setCurrentInvoice(await res.json());
                              }
                            }}
                            className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 4. VENDORS REGISTRY & MANAGEMENT VIEW (OPTION C) */}
        {activeTab === 'vendors' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header with Sub-View Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                  <Building2 className="h-5 w-5 text-cyan-400" />
                  <span>Master Vendor & Contract Tax Management</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase tracking-widest font-mono">
                    OPTION C
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure approved suppliers, contractual statutory tax rates, spend thresholds, and bulk import vendor registries.
                </p>
              </div>

              {/* Sub-view Nav Pills */}
              <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 p-1 rounded-2xl shrink-0">
                <button
                  onClick={() => setVendorSubView('directory')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    vendorSubView === 'directory'
                      ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Directory & Rates</span>
                </button>
                <button
                  onClick={() => setVendorSubView('create')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    vendorSubView === 'create'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>+ Create Vendor</span>
                </button>
                <button
                  onClick={() => setVendorSubView('import')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    vendorSubView === 'import'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Bulk CSV Import</span>
                </button>
              </div>
            </div>

            {/* SUB-VIEW 1: DIRECTORY & MASTER RATES */}
            {vendorSubView === 'directory' && (
              <div className="space-y-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Registered Suppliers</span>
                    <div className="text-2xl font-bold font-mono text-white">{vendors.length}</div>
                    <span className="text-[10px] text-slate-500 font-mono">Master ledger records</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Active Suppliers</span>
                    <div className="text-2xl font-bold font-mono text-emerald-400">{vendors.filter(v => v.status === 'ACTIVE').length}</div>
                    <span className="text-[10px] text-emerald-500 font-mono">Disbursement authorized</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Under Review / Quarantined</span>
                    <div className="text-2xl font-bold font-mono text-amber-400">{vendors.filter(v => v.status !== 'ACTIVE').length}</div>
                    <span className="text-[10px] text-amber-500 font-mono">Audit scrutiny active</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Avg Contract Tax Rate</span>
                    <div className="text-2xl font-bold font-mono text-cyan-400">
                      {vendors.length > 0 ? ((vendors.reduce((acc, v) => acc + (v.default_tax_rate || 0), 0) / vendors.length) * 100).toFixed(1) : 0}%
                    </div>
                    <span className="text-[10px] text-cyan-500 font-mono">Statutory GST/VAT baseline</span>
                  </div>
                </div>

                {/* Filter and Fast Action Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-2xl">
                  <div className="flex flex-1 items-center space-x-2">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-500" />
                      <input
                        type="text"
                        value={vendorSearch}
                        onChange={(e) => setVendorSearch(e.target.value)}
                        placeholder="Search supplier name or tax ID..."
                        className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                    <select
                      value={vendorStatusFilter}
                      onChange={(e) => setVendorStatusFilter(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="ACTIVE">Active</option>
                      <option value="UNDER_REVIEW">Under Review</option>
                      <option value="BLOCKED">Blocked</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <a
                      href="/api/vendors/template.csv"
                      download="veritas_vendor_import_template.csv"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
                      title="Download sample CSV template for bulk importing"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>CSV Template</span>
                    </a>
                    <button
                      onClick={() => setVendorSubView('import')}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-indigo-300 text-xs font-bold border border-indigo-800 transition cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Import CSV</span>
                    </button>
                    <button
                      onClick={() => setVendorSubView('create')}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition shadow-md shadow-cyan-600/20 cursor-pointer"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>+ Add Vendor</span>
                    </button>
                  </div>
                </div>

                {/* Vendor Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {vendors
                    .filter(v => {
                      const matchesSearch = !vendorSearch ||
                        v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
                        v.tax_id.toLowerCase().includes(vendorSearch.toLowerCase());
                      const matchesStatus = vendorStatusFilter === 'ALL' || v.status === vendorStatusFilter;
                      return matchesSearch && matchesStatus;
                    })
                    .map((vendor) => (
                      <div key={vendor.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm hover:border-slate-700 transition">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-white">{vendor.name}</h3>
                            <span className="text-[11px] text-slate-400 font-mono block mt-0.5">Tax ID: {vendor.tax_id}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            vendor.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                            vendor.status === 'UNDER_REVIEW' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                            'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {vendor.status}
                          </span>
                        </div>

                        {/* Contract Statutory Tax Rate Highlight Banner */}
                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase font-mono">Contract Tax Rate</span>
                            <span className="text-sm font-extrabold text-cyan-400 font-mono">
                              {(vendor.default_tax_rate * 100).toFixed(1)}% <span className="text-[10px] font-normal text-slate-400">Statutory</span>
                            </span>
                          </div>
                          <button
                            onClick={() => setEditingTaxRateVendor({
                              vendorId: vendor.id,
                              vendorName: vendor.name,
                              currentRate: vendor.default_tax_rate,
                              newRate: Number((vendor.default_tax_rate * 100).toFixed(1)),
                              reason: ''
                            })}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                            title="Edit contracted statutory tax rate"
                          >
                            Edit Rate
                          </button>
                        </div>

                        {/* Historical Spend Metrics */}
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase">Risk Tier</span>
                            <span className={`font-bold ${
                              vendor.risk_tier === 'HIGH' ? 'text-rose-400' :
                              vendor.risk_tier === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'
                            }`}>{vendor.risk_tier}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase">Historical Invoices</span>
                            <span className="text-slate-200 font-bold">{vendor.historical_invoice_count}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase">Historical Total</span>
                            <span className="text-slate-200 font-bold">${vendor.historical_total_spent?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase">Avg Invoice Amount</span>
                            <span className="text-slate-200 font-bold">${vendor.avg_invoice_amount?.toLocaleString()}</span>
                          </div>
                        </div>

                        {currentUser.role === 'CHIEF_AUDITOR' && (
                          <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
                            <span className="text-[11px] text-slate-400 font-semibold">Quarantine:</span>
                            <button
                              onClick={() => handleVendorQuarantine(vendor.id, 'ACTIVE')}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-emerald-400 cursor-pointer"
                            >
                              Active
                            </button>
                            <button
                              onClick={() => handleVendorQuarantine(vendor.id, 'UNDER_REVIEW')}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-amber-400 cursor-pointer"
                            >
                              Review
                            </button>
                            <button
                              onClick={() => handleVendorQuarantine(vendor.id, 'BLOCKED')}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-rose-400 cursor-pointer"
                            >
                              Block
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* SUB-VIEW 2: CREATE / REGISTER NEW VENDOR SCREEN */}
            {vendorSubView === 'create' && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl max-w-3xl mx-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center">
                      <PlusCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Register New Supplier & Contract Tax Rate</h3>
                      <p className="text-xs text-slate-400">Establish statutory tax baseline and spend thresholds in the live cloud database.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setVendorSubView('directory')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    ← Back to Directory
                  </button>
                </div>

                {vendorError && (
                  <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                    <span>{vendorError}</span>
                  </div>
                )}

                <form onSubmit={handleRegisterVendor} className="space-y-5 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Vendor Legal Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Apex Industrial Supplies Ltd"
                        value={registerVendorForm.name}
                        onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500 font-sans"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Tax ID / GSTIN / EIN *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. US-EIN-8839210 or IN-GST-27AABCA1042K1Z5"
                        value={registerVendorForm.tax_id}
                        onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, tax_id: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  {/* Contract Statutory Tax Rate with Presets */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-200">Contractual Statutory Tax Rate (%) *</label>
                      <span className="text-[11px] font-mono text-cyan-400 font-bold">{registerVendorForm.default_tax_rate}% baseline</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {[0, 5, 12, 18, 28].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setRegisterVendorForm({ ...registerVendorForm, default_tax_rate: rate })}
                          className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition cursor-pointer ${
                            registerVendorForm.default_tax_rate === rate
                              ? 'bg-cyan-600 text-white shadow-sm'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                          }`}
                        >
                          {rate}% {rate === 0 ? '(Exempt)' : rate === 5 ? '(Reduced)' : rate === 12 ? '(Standard)' : rate === 18 ? '(Master Contract)' : '(Luxury)'}
                        </button>
                      ))}
                    </div>

                    <div className="pt-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        required
                        value={registerVendorForm.default_tax_rate}
                        onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, default_tax_rate: parseFloat(e.target.value) || 0 })}
                        className="w-48 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono focus:outline-none focus:border-cyan-500 text-xs"
                        placeholder="Custom %"
                      />
                      <span className="text-[10px] text-slate-500 font-mono ml-2">Custom percentage</span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                      🛡️ <strong className="text-slate-300">Statutory Tax Manipulation Sieve:</strong> Any invoice processed for this vendor claiming a tax rate other than <span className="text-cyan-400 font-mono font-bold">{registerVendorForm.default_tax_rate}%</span> will be flagged with +25 risk points for tax underreporting or evasion.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Risk Profile Tier</label>
                      <select
                        value={registerVendorForm.risk_tier}
                        onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, risk_tier: e.target.value as any })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="LOW">LOW Risk (Trusted)</option>
                        <option value="MEDIUM">MEDIUM Risk (Standard)</option>
                        <option value="HIGH">HIGH Risk (Restricted)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Avg Expected Invoice ($)</label>
                      <input
                        type="number"
                        min="0"
                        value={registerVendorForm.avg_invoice_amount}
                        onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, avg_invoice_amount: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">Max Authorized Threshold ($)</label>
                      <input
                        type="number"
                        min="0"
                        value={registerVendorForm.max_invoice_amount}
                        onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, max_invoice_amount: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setVendorSubView('directory')}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingVendor}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-cyan-600/20 disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
                    >
                      {isSubmittingVendor ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                      <span>SAVE & REGISTER MASTER VENDOR</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* SUB-VIEW 3: BULK CSV IMPORT SCREEN */}
            {vendorSubView === 'import' && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl max-w-3xl mx-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Bulk Supplier Import & Master Rate Ingestion</h3>
                      <p className="text-xs text-slate-400">Import pre-approved vendors and contracted statutory rates from accounting systems.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setVendorSubView('directory')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    ← Back to Directory
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 gap-3">
                  <div>
                    <h4 className="font-bold text-white text-xs">Standard CSV Template</h4>
                    <p className="text-[11px] text-slate-400">Columns: name, tax_id, default_tax_rate, risk_tier, avg_invoice_amount, max_invoice_amount</p>
                  </div>
                  <a
                    href="/api/vendors/template.csv"
                    download="veritas_vendor_import_template.csv"
                    className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold text-xs border border-slate-700 transition"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download CSV Template</span>
                  </a>
                </div>

                {/* Dropzone */}
                <div
                  onClick={() => csvFileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-3xl p-8 text-center cursor-pointer transition bg-slate-950/40 space-y-3"
                >
                  <input
                    ref={csvFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleCsvFileSelection(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="h-12 w-12 rounded-2xl bg-indigo-950 text-indigo-400 flex items-center justify-center mx-auto">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      {importCsvFile ? importCsvFile.name : 'Click to select or drag & drop a vendor CSV file'}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
                      {importCsvFile ? `${(importCsvFile.size / 1024).toFixed(1)} KB` : 'UTF-8 encoded .csv format'}
                    </span>
                  </div>
                </div>

                {/* Optional CSV Paste Textarea */}
                <div className="space-y-1.5 text-xs">
                  <label className="font-semibold text-slate-300">Or Paste CSV Data Directly:</label>
                  <textarea
                    rows={4}
                    value={csvRawText}
                    onChange={(e) => {
                      setCsvRawText(e.target.value);
                      parseCsvPreview(e.target.value);
                    }}
                    placeholder={`name,tax_id,default_tax_rate,risk_tier,max_invoice_amount\nAcme Fasteners Corp,US-EIN-1122334,18.0,LOW,50000`}
                    className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Live Preview Table */}
                {csvPreviewRows.length > 0 && (
                  <div className="space-y-2 text-xs">
                    <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                      CSV Preview (First {csvPreviewRows.length} Rows):
                    </span>
                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                      <table className="w-full text-left font-mono text-[11px]">
                        <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                          <tr>
                            <th className="py-2 px-3">Name</th>
                            <th className="py-2 px-3">Tax ID</th>
                            <th className="py-2 px-3">Tax Rate</th>
                            <th className="py-2 px-3">Risk</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {csvPreviewRows.map((r, i) => (
                            <tr key={i}>
                              <td className="py-1.5 px-3 font-semibold text-white">{r.name || r.vendor_name}</td>
                              <td className="py-1.5 px-3 text-cyan-400">{r.tax_id || r.ein || r.gstin}</td>
                              <td className="py-1.5 px-3">{r.default_tax_rate || r.tax_rate || '18.0'}%</td>
                              <td className="py-1.5 px-3">{r.risk_tier || 'LOW'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setImportCsvFile(null);
                      setCsvRawText('');
                      setCsvPreviewRows([]);
                      setVendorSubView('directory');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteCsvImport}
                    disabled={isImportingCsv || (!importCsvFile && !csvRawText.trim())}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
                  >
                    {isImportingCsv ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span>INGEST & PROCESS VENDORS</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. APPROVALS GOVERNANCE VIEW (CHIEF AUDITOR) */}
        {activeTab === 'approvals' && (
          <div className="space-y-6">
            <div className="pb-2 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                <Lock className="h-5 w-5 text-indigo-400" />
                <span>Executive Approvals Governance Queue</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Role-enforced adjudication queue. Server requires Chief Auditor authorization token for state changes.
              </p>
            </div>

            {currentUser.role !== 'CHIEF_AUDITOR' ? (
              <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-3">
                <Lock className="h-10 w-10 text-amber-400 mx-auto" />
                <h3 className="text-base font-bold text-white">Chief Auditor Authorization Required</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Your active role is <strong>Finance Operator</strong>. Approval and blocking actions require Chief Auditor administrative clearance.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {invoices.filter(i => i.approval_status === 'PENDING' || i.approval_status === 'BLOCKED').map((inv) => (
                  <div key={inv.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-base font-bold text-white">Invoice #{inv.invoice_number}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          inv.approval_status === 'BLOCKED' ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                        }`}>
                          {inv.approval_status}
                        </span>
                        <span className="text-xs font-mono text-slate-400">Risk: {inv.risk_score}/100</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Vendor: <strong className="text-slate-200">{inv.vendor_name}</strong> • Total Billed: <span className="font-mono text-emerald-400 font-bold">${inv.total_amount?.toLocaleString()} {inv.currency}</span>
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={async () => {
                          const res = await fetch(`/api/invoices/${inv.id}`, { headers: authHeaders() });
                          if (res.ok) {
                            setCurrentInvoice(await res.json());
                            setActiveTab('invoices');
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                      >
                        Inspect Evidence
                      </button>
                      <button
                        onClick={() => setAdjudicateModal({ open: true, targetStatus: 'APPROVED', invoiceId: inv.id, reason: '' })}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setAdjudicateModal({ open: true, targetStatus: 'BLOCKED', invoiceId: inv.id, reason: '' })}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition"
                      >
                        Block
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. IMMUTABLE AUDIT TRAIL VIEW */}
        {activeTab === 'audit_trail' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                  <History className="h-5 w-5 text-cyan-400" />
                  <span>Immutable Cryptographic Audit Trail</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sequential SHA-256 hash-chained event blocks (H_k = SHA-256(H_k-1 + payload)).
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleVerifyAuditChain}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition shadow-md"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>Verify Hash Chain Integrity</span>
                </button>
                <a
                  href="/api/export/audit-trail.csv"
                  target="_blank"
                  className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export CSV</span>
                </a>
              </div>
            </div>

            {/* Proof Card */}
            {chainProof && (
              <div className={`p-4 rounded-2xl border ${
                chainProof.valid ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200' : 'bg-rose-950/40 border-rose-800 text-rose-200'
              }`}>
                <div className="flex items-center space-x-2 font-bold text-sm">
                  {chainProof.valid ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <XCircle className="h-5 w-5 text-rose-400" />}
                  <span>{chainProof.message}</span>
                </div>
                <div className="mt-2 text-xs font-mono space-y-0.5 text-slate-300">
                  <div>Verified Blocks: <strong>{chainProof.total_records}</strong></div>
                  <div>Root Fingerprint: <span className="text-cyan-400">{chainProof.latest_root_hash}</span></div>
                </div>
              </div>
            )}

            {/* Audit Log Stream */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                      <th className="py-3 px-4">Event Type</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Severity</th>
                      <th className="py-3 px-4">Timestamp (UTC)</th>
                      <th className="py-3 px-4">Current Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-bold text-white">{log.event_type}</td>
                        <td className="py-3 px-4 font-sans text-slate-200">{log.actor_name || 'System Engine'}</td>
                        <td className="py-3 px-4 text-cyan-400">{log.actor_role}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                            log.severity === 'WARNING' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                            'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {log.severity}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400">{log.timestamp}</td>
                        <td className="py-3 px-4 text-slate-500 truncate max-w-[120px]">{log.current_log_hash?.substring(0, 16)}...</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 7. REPORTS & EXPORTS VIEW */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="pb-2 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">Compliance Export & Forensic Reports</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Generate real CSV spreadsheets and certified ReportLab PDF audit forensic packets.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-cyan-950 text-cyan-400 flex items-center justify-center">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-white">Full Audit Trail Ledger (CSV)</h3>
                <p className="text-xs text-slate-400">
                  Exports a structured spreadsheet containing every transaction, risk calculation, and role adjudication event.
                </p>
                <a
                  href="/api/export/audit-trail.csv"
                  target="_blank"
                  className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition flex items-center justify-center space-x-2"
                >
                  <Download className="h-4 w-4" />
                  <span>DOWNLOAD AUDIT TRAIL CSV</span>
                </a>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-indigo-950 text-indigo-400 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-white">Certified Forensic Audit Packet (PDF)</h3>
                <p className="text-xs text-slate-400">
                  Generates an authenticated ReportLab PDF complete with SHA-256 seals, vendor match evidence, and tax variance calculations.
                </p>
                {currentInvoice ? (
                  <a
                    href={`/api/export/forensic-packet/${currentInvoice.id}.pdf`}
                    target="_blank"
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center justify-center space-x-2"
                  >
                    <Download className="h-4 w-4" />
                    <span>DOWNLOAD CERTIFIED PDF PACKET</span>
                  </a>
                ) : (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-500 font-bold text-xs cursor-not-allowed"
                  >
                    Select an invoice in ledger to export PDF
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 8. SYSTEM & API STATUS VIEW */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            <div className="pb-2 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">System Architecture & Service Telemetry</h2>
              <p className="text-xs text-slate-400 mt-0.5">Live service health, cloud database connectivity, and backend engine status.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Service Health</span>
                <span className="text-emerald-400 font-bold flex items-center space-x-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>HTTP 200 (ONLINE)</span>
                </span>
                <p className="text-[11px] text-slate-400 font-sans">FastAPI serverless gateway responding.</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Database Storage</span>
                <span className="text-cyan-400 font-bold flex items-center space-x-1.5 text-sm">
                  <Database className="h-4 w-4" />
                  <span>PERSISTENT CLOUD DB</span>
                </span>
                <p className="text-[11px] text-slate-400 font-sans">PostgreSQL / SQLite WAL mode active.</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Multimodal Vision Engine</span>
                <span className="text-indigo-400 font-bold flex items-center space-x-1.5 text-sm">
                  <Sparkles className="h-4 w-4" />
                  <span>DUAL-ENGINE ACTIVE</span>
                </span>
                <p className="text-[11px] text-slate-400 font-sans">Gemini 2.0 Flash + Deterministic OCR Parser.</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 text-xs">
              <h3 className="font-bold text-white text-sm">Interactive API Documentation</h3>
              <p className="text-slate-400">
                Veritas exposes standard OpenAPI documentation for all authentication, document processing, and audit endpoints.
              </p>
              <div className="pt-2">
                <a
                  href="/docs"
                  target="_blank"
                  className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold transition"
                >
                  <span>Open Swagger / OpenAPI Documentation</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* REVENUE & BILLING INTELLIGENCE (CHIEF AUDITOR ONLY) */}
        {activeTab === 'revenue' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {currentUser.role !== 'CHIEF_AUDITOR' ? (
              <div className="p-12 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
                <Lock className="h-12 w-12 text-amber-400 mx-auto" />
                <h3 className="text-lg font-bold text-white">Chief Auditor Clearance Required</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Your active role is <strong>Finance Operator</strong>. Organization-wide billing metrics, transaction ledgers, and revenue settlement reports require Chief Auditor executive clearance.
                </p>
              </div>
            ) : (
              <>
                {/* Header & Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                      <CircleDollarSign className="h-5 w-5 text-emerald-400" />
                      <span>Executive Revenue & Billing Intelligence</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Live pay-per-audited-invoice transaction metrics. Server rate fixed at <strong className="text-emerald-400">₹{revenueSummary?.current_price_per_audit || 5} INR</strong> per completed forensic audit.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={loadRevenueData}
                      disabled={isLoadingRevenue}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                      title="Refresh live revenue metrics from cloud database"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isLoadingRevenue ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                    <a
                      href="/api/revenue/export-csv"
                      target="_blank"
                      className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export Revenue CSV</span>
                    </a>
                  </div>
                </div>

                {/* KPI Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Revenue</span>
                    <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                      ₹{revenueSummary ? revenueSummary.total_revenue.toLocaleString('en-IN') : '0'}
                    </div>
                    <span className="text-[10px] text-slate-500 block">100% DB Settled</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Today's Revenue</span>
                    <div className="text-2xl font-extrabold text-cyan-400 font-mono">
                      ₹{revenueSummary ? revenueSummary.today_revenue.toLocaleString('en-IN') : '0'}
                    </div>
                    <span className="text-[10px] text-slate-500 block">Current 24h UTC</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">This Month</span>
                    <div className="text-2xl font-extrabold text-indigo-400 font-mono">
                      ₹{revenueSummary ? revenueSummary.this_month_revenue.toLocaleString('en-IN') : '0'}
                    </div>
                    <span className="text-[10px] text-slate-500 block">Monthly Yield</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Audited Invoices</span>
                    <div className="text-2xl font-extrabold text-white font-mono">
                      {revenueSummary ? revenueSummary.total_audited_invoices : 0}
                    </div>
                    <span className="text-[10px] text-slate-500 block">Completed Audits</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Billable Audits</span>
                    <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                      {revenueSummary ? revenueSummary.billable_invoices : 0}
                    </div>
                    <span className="text-[10px] text-slate-500 block">Paid Transactions</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Price / Audit</span>
                    <div className="text-2xl font-extrabold text-amber-400 font-mono">
                      ₹{revenueSummary ? revenueSummary.current_price_per_audit : 5}
                    </div>
                    <span className="text-[10px] text-slate-500 block">Server Config (INR)</span>
                  </div>
                </div>

                {/* Revenue Chart Section */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                        Revenue Realization Timeline (Daily Aggregation)
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      Live Database Stream
                    </span>
                  </div>

                  {revenueChartData.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      No completed revenue transactions found in ledger yet.
                    </div>
                  ) : (
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        {revenueChartData.map((pt, idx) => (
                          <div key={idx} className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono text-slate-400">{pt.date}</span>
                              <span className="font-bold text-emerald-400 font-mono text-sm">₹{pt.amount.toFixed(2)}</span>
                            </div>
                            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-2 rounded-full"
                                style={{ width: `${Math.min(100, Math.max(15, (pt.amount / (revenueSummary?.total_revenue || 1)) * 100))}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500 block">
                              {pt.audit_count} audited invoice{pt.audit_count === 1 ? '' : 's'} billed
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Transaction History Ledger */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                        <Receipt className="h-4 w-4 text-cyan-400" />
                        <span>Revenue Transaction Ledger</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Immutable transaction records bound to completed invoice audits.
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={revenueSearch}
                          onChange={(e) => setRevenueSearch(e.target.value)}
                          placeholder="Search transactions..."
                          className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-52"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 font-bold font-mono">
                          <th className="py-2.5 px-3">Transaction ID</th>
                          <th className="py-2.5 px-3">Invoice Ref</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Customer / Entity</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Amount</th>
                          <th className="py-2.5 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {revenueTransactions
                          .filter(t => !revenueSearch || t.reference_id.toLowerCase().includes(revenueSearch.toLowerCase()) || (t.invoice_number && t.invoice_number.toLowerCase().includes(revenueSearch.toLowerCase())) || t.customer_name.toLowerCase().includes(revenueSearch.toLowerCase()))
                          .map((t) => (
                            <tr key={t.id} className="hover:bg-slate-950/40 transition">
                              <td className="py-2.5 px-3 font-bold text-cyan-400">{t.reference_id}</td>
                              <td className="py-2.5 px-3 text-slate-300">#{t.invoice_number}</td>
                              <td className="py-2.5 px-3 text-slate-400 font-sans text-[11px]">
                                {t.completed_at ? new Date(t.completed_at).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="py-2.5 px-3 font-sans text-slate-200 max-w-xs truncate">{t.customer_name}</td>
                              <td className="py-2.5 px-3">
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                                  {t.transaction_type}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-bold text-emerald-400">
                                ₹{t.amount.toFixed(2)} {t.currency}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                                  {t.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 9. USER PROFILE & OPERATING GUIDE */}
        {activeTab === 'profile' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header / Intro */}
            <div className="pb-2 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                  <User className="h-5 w-5 text-cyan-400" />
                  <span>User Profile & Operations Manual</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Live session identity, role-based authorization parameters, and standard operating procedures for Veritas.
                </p>
              </div>

              {/* Session Switcher */}
              <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl">
                <span className="text-[10px] font-mono text-slate-400 px-2 font-semibold uppercase">Switch Account:</span>
                <button
                  onClick={async () => {
                    await handleLogout();
                    handleSelectRolePreset('OPERATOR');
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                    currentUser.role === 'FINANCE_OPERATOR'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                  title="Log out and fill Finance Operator credentials"
                >
                  Finance Operator
                </button>
                <button
                  onClick={async () => {
                    await handleLogout();
                    handleSelectRolePreset('AUDITOR');
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                    currentUser.role === 'CHIEF_AUDITOR'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                  title="Log out and fill Chief Auditor credentials"
                >
                  Chief Auditor
                </button>
              </div>
            </div>

            {/* Profile Overview Card & Permissions Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* User Identity Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-indigo-500" />
                <div className="flex items-center space-x-4">
                  <div className={`h-16 w-16 rounded-2xl flex items-center justify-center text-white text-xl font-extrabold shadow-lg ${
                    currentUser.role === 'CHIEF_AUDITOR' ? 'bg-indigo-600 shadow-indigo-600/30' : 'bg-cyan-600 shadow-cyan-600/30'
                  }`}>
                    {currentUser.username.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{currentUser.username}</h3>
                    <p className="text-xs text-slate-400">{currentUser.full_name}</p>
                    <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase font-mono tracking-wider border ${
                      currentUser.role === 'CHIEF_AUDITOR'
                        ? 'bg-indigo-950 text-indigo-300 border-indigo-700'
                        : 'bg-cyan-950 text-cyan-300 border-cyan-700'
                    }`}>
                      {currentUser.role.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-800/80 text-xs">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Login Email</span>
                    <span className="font-mono text-slate-200 font-semibold">{currentUser.email}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Account ID</span>
                    <span className="font-mono text-slate-400 text-[11px]">{currentUser.id}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Security Clearance</span>
                    <span className="flex items-center space-x-1 text-emerald-400 font-semibold">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                      <span>Active Verified</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Auth Token Status</span>
                    <span className="font-mono text-[10px] text-cyan-400">Bearer JWT (Active)</span>
                  </div>
                </div>
              </div>

              {/* Role Permissions Matrix */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg">
                <div className="flex items-center space-x-2 text-white font-bold text-sm">
                  <ShieldCheck className="h-4 w-4 text-cyan-400" />
                  <span>Role Authorization & Access Control Matrix</span>
                </div>
                <p className="text-xs text-slate-400">
                  Veritas strictly enforces role-based access control at the API level. Actions are cryptographically bound to the authenticated user ID.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className={`p-4 rounded-2xl border transition ${
                    currentUser.role === 'FINANCE_OPERATOR'
                      ? 'bg-cyan-950/20 border-cyan-500/40 ring-1 ring-cyan-500/20'
                      : 'bg-slate-950/50 border-slate-800/60 opacity-75'
                  }`}>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className="font-bold text-xs text-cyan-400 flex items-center space-x-1.5">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Finance Operator</span>
                      </span>
                      {currentUser.role === 'FINANCE_OPERATOR' && (
                        <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded font-mono font-bold">CURRENT SESSION</span>
                      )}
                    </div>
                    <ul className="mt-3 space-y-2 text-xs text-slate-300">
                      <li className="flex items-center space-x-2">
                        <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                        <span>Upload & OCR PDF/Image Invoices</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                        <span>Inspect Line Items & Math Integrity</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                        <span>Examine Deterministic Risk Breakdown</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                        <span>Register New Master Vendors (Option C)</span>
                      </li>
                      <li className="flex items-center space-x-2 text-slate-500">
                        <X className="h-3.5 w-3.5 text-rose-500/60 shrink-0" />
                        <span>Cannot execute final disbursement approval</span>
                      </li>
                    </ul>
                  </div>

                  <div className={`p-4 rounded-2xl border transition ${
                    currentUser.role === 'CHIEF_AUDITOR'
                      ? 'bg-indigo-950/20 border-indigo-500/40 ring-1 ring-indigo-500/20'
                      : 'bg-slate-950/50 border-slate-800/60 opacity-75'
                  }`}>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className="font-bold text-xs text-indigo-400 flex items-center space-x-1.5">
                        <Lock className="h-3.5 w-3.5" />
                        <span>Chief Auditor</span>
                      </span>
                      {currentUser.role === 'CHIEF_AUDITOR' && (
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold">CURRENT SESSION</span>
                      )}
                    </div>
                    <ul className="mt-3 space-y-2 text-xs text-slate-300">
                      <li className="flex items-center space-x-2">
                        <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span>Adjudicate Invoices: Approve or Block</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span>Record Immutable Justification Notes</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span>Verify Cryptographic Audit Hash Chain</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span>Vendor Quarantine & Risk Tier Controls</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span>Generate Certified Forensic PDF Packets</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Comprehensive User Guide / Operational Instructions */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
              <div className="flex items-center space-x-3 pb-4 border-b border-slate-800">
                <div className="h-10 w-10 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">How to Use Veritas</h3>
                  <p className="text-xs text-slate-400">
                    Comprehensive operational guide and navigation reference tailored to your active role ({currentUser.role === 'CHIEF_AUDITOR' ? 'Chief Auditor' : 'Finance Operator'}).
                  </p>
                </div>
              </div>

              {/* QUICK NAVIGATION SECTION */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Quick Navigation ({currentUser.role === 'CHIEF_AUDITOR' ? 'Chief Auditor Suite' : 'Finance Operator Suite'})</span>
                </div>
                <p className="text-xs text-slate-400">
                  Select any accessible menu item from the top navigation bar to access its specialized features:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-white flex items-center space-x-1.5">
                      <LayoutDashboard className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Dashboard</span>
                    </span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      View your current invoice audit activity, risk level distributions, and active throughput metrics.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-white flex items-center space-x-1.5">
                      <FileText className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Invoices Ledger</span>
                    </span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      View previously processed invoices, inspect line-item math, duplicate evidence, and ₹5 audit settlement status.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-white flex items-center space-x-1.5">
                      <Upload className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Upload Invoice</span>
                    </span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Upload commercial PDF or image invoices to trigger real-time AI extraction, fraud checks, and billing.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-white flex items-center space-x-1.5">
                      <Building2 className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Vendors Registry</span>
                    </span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      View registered suppliers, inspect contracted statutory tax rates, and register or update supplier baselines.
                    </p>
                  </div>

                  {currentUser.role === 'CHIEF_AUDITOR' && (
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-indigo-900/60 space-y-1">
                      <span className="font-bold text-indigo-300 flex items-center space-x-1.5">
                        <Lock className="h-3.5 w-3.5 text-indigo-400" />
                        <span>Approvals Governance</span>
                      </span>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Adjudicate pending and blocked high-risk invoices. Officially approve disbursements or freeze payments.
                      </p>
                    </div>
                  )}

                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-white flex items-center space-x-1.5">
                      <History className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Audit Trail</span>
                    </span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Inspect chronological SHA-256 event logs and verify mathematical hash chain integrity across all blocks.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-white flex items-center space-x-1.5">
                      <Download className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Reports & Export</span>
                    </span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Export full regulatory audit trails as CSV or generate certified court-ready forensic PDF packets.
                    </p>
                  </div>

                  {currentUser.role === 'CHIEF_AUDITOR' && (
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-900/60 space-y-1">
                      <span className="font-bold text-emerald-300 flex items-center space-x-1.5">
                        <CircleDollarSign className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Revenue & Billing</span>
                      </span>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Track live pay-per-audit revenue (₹5/audit), billable counts, timeline charts, and export CSV billing ledgers.
                      </p>
                    </div>
                  )}

                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-white flex items-center space-x-1.5">
                      <Database className="h-3.5 w-3.5 text-cyan-400" />
                      <span>System & API Status</span>
                    </span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Check live database connectivity, dual AI OCR parser health, and open interactive Swagger OpenAPI docs.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-white flex items-center space-x-1.5">
                      <User className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Profile & Guide</span>
                    </span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      View your session credentials, permissions matrix, quick navigation, and platform operating manual.
                    </p>
                  </div>
                </div>
              </div>

              {/* STEP-BY-STEP OPERATING WORKFLOW */}
              <div className="pt-4 border-t border-slate-800 space-y-4">
                <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                  <BookOpen className="h-4 w-4" />
                  <span>Step-by-Step Operating Workflow</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {currentUser.role === 'FINANCE_OPERATOR' ? (
                    <>
                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-cyan-400">1. Login & Identity Verification</span>
                        <p className="text-slate-300 leading-relaxed">
                          Sign in with your Finance Operator account (<code className="text-slate-400">operator@veritas.internal</code>). Your credentials grant permission to upload invoices and review audit math.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-cyan-400">2. Dashboard Overview</span>
                        <p className="text-slate-300 leading-relaxed">
                          Check the total volume of invoices processed, risk distribution charts, and pending items requiring resolution.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-cyan-400">3. Upload Invoice & AI Sieve</span>
                        <p className="text-slate-300 leading-relaxed">
                          Navigate to <strong>Upload Invoice</strong>. Drag and drop any PDF/image invoice or click sample test files. The dual-engine extracts fields, flags discrepancies, and automatically creates a ₹5 completed audit transaction.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-cyan-400">4. Review Invoices & Billing Details</span>
                        <p className="text-slate-300 leading-relaxed">
                          Under <strong>Invoices Ledger</strong>, click on any processed invoice to examine line items, risk score (0-100), and the <strong>Audit Billing & Settlement</strong> section showing the ₹5 fee and Transaction ID.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-cyan-400">5. Vendors Registry Management</span>
                        <p className="text-slate-300 leading-relaxed">
                          Register new supplier accounts with their contracted statutory tax rate (0%, 5%, 12%, 18%, 28%) to establish baselines for automated fraud defense.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-cyan-400">6. Audit Trail & Reports Verification</span>
                        <p className="text-slate-300 leading-relaxed">
                          Inspect immutable event logs under <strong>Audit Trail</strong> and export regulatory CSV files or certified PDF packets under <strong>Reports & Export</strong>.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-indigo-400">1. Login & Executive Clearance</span>
                        <p className="text-slate-300 leading-relaxed">
                          Sign in with your Chief Auditor account (<code className="text-slate-400">auditor@veritas.internal</code>). You hold complete administrative authority over approvals, rates, and revenue.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-indigo-400">2. Executive Dashboard Monitoring</span>
                        <p className="text-slate-300 leading-relaxed">
                          Review enterprise AP activity, duplicate collision flags, high-risk counts, and pending items requiring adjudication.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-indigo-400">3. Approvals Governance Queue</span>
                        <p className="text-slate-300 leading-relaxed">
                          Navigate to <strong>Approvals Governance</strong> to review flagged high-risk and duplicate invoices. Perform side-by-side evidence checks and officially <strong>Approve</strong> or <strong>Block</strong> with mandatory audit notes.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-indigo-400">4. Master Vendor Rates & Quarantine</span>
                        <p className="text-slate-300 leading-relaxed">
                          Under <strong>Vendors Registry</strong>, update contracted statutory tax rates or quarantine compromised suppliers to <code className="text-amber-400">UNDER_REVIEW</code> or <code className="text-rose-400">BLOCKED</code>.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-indigo-400">5. Revenue & Billing Intelligence</span>
                        <p className="text-slate-300 leading-relaxed">
                          Open <strong>Revenue & Billing</strong> to analyze pay-per-audit performance (₹5 INR per completed audit), daily volume charts, transaction logs, and export revenue spreadsheets as CSV.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="font-bold text-indigo-400">6. Cryptographic Proof & PDF Export</span>
                        <p className="text-slate-300 leading-relaxed">
                          Under <strong>Audit Trail</strong>, click <em>Verify Hash Chain Integrity</em> to mathematically re-validate all SHA-256 blocks, or download certified court-ready forensic PDF packets.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* IMPORTANT OPERATING TIPS */}
              <div className="pt-4 border-t border-slate-800 space-y-3 text-xs">
                <div className="flex items-center space-x-2 text-amber-400 font-bold uppercase tracking-wider">
                  <AlertOctagon className="h-4 w-4" />
                  <span>Important Tips for Using Veritas</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-300">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-white block">Pay-Per-Audit Model</span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Revenue is billed at <strong>₹5 INR</strong> per successfully completed audit regardless of risk verdict (clean, duplicate, or high-risk). Failed extractions are not billed.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-white block">Strict Idempotency</span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Re-opening, refreshing, or re-verifying an invoice never creates duplicate billing transactions. Unique database constraints guarantee exactly one transaction per invoice.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-white block">Cryptographic Immutability</span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Every document upload, fraud finding, vendor rate adjustment, and revenue event is chained via sequential SHA-256 hashes for regulatory compliance.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ADJUDICATION MODAL (CHIEF AUDITOR) */}
      {adjudicateModal && adjudicateModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Lock className="h-5 w-5 text-cyan-400" />
              <span>Confirm Adjudication: {adjudicateModal.targetStatus}</span>
            </h3>

            <p className="text-xs text-slate-300">
              Provide formal audit reasoning for this state modification. This note will be recorded in the immutable audit trail.
            </p>

            <textarea
              value={adjudicateModal.reason}
              onChange={(e) => setAdjudicateModal({ ...adjudicateModal, reason: e.target.value })}
              placeholder="e.g., Confirmed fraudulent duplicate submission and statutory tax alteration."
              className="w-full h-24 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setAdjudicateModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdjudication}
                className={`px-4 py-2 rounded-xl font-bold text-xs text-white shadow-lg ${
                  adjudicateModal.targetStatus === 'APPROVED' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                Confirm {adjudicateModal.targetStatus}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIDE-BY-SIDE DUPLICATE DIFF MODAL */}
      {showDiffModal && currentInvoice?.matched_duplicate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
                <span>Forensic Side-by-Side Duplicate Collision Diff</span>
              </h3>
              <button
                onClick={() => setShowDiffModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              {/* Original Historical Invoice */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-slate-800 pb-2">
                  <span>ORIGINAL HISTORICAL RECORD</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-[10px] border border-emerald-800">
                    {currentInvoice.matched_duplicate.approval_status}
                  </span>
                </div>
                <div>Invoice #: <strong className="text-white">{currentInvoice.matched_duplicate.invoice_number}</strong></div>
                <div>Subtotal: <strong>${currentInvoice.matched_duplicate.subtotal?.toLocaleString()}</strong></div>
                <div>Tax Billed: <strong>${currentInvoice.matched_duplicate.tax_amount?.toLocaleString()}</strong></div>
                <div>Total Amount: <strong className="text-emerald-400">${currentInvoice.matched_duplicate.total_amount?.toLocaleString()}</strong></div>
                <div>File: <span className="text-slate-400">{currentInvoice.matched_duplicate.file_name}</span></div>
              </div>

              {/* Uploaded Fraudulent Submission */}
              <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-800/60 space-y-3">
                <div className="flex items-center justify-between text-rose-400 font-bold border-b border-rose-800/40 pb-2">
                  <span>INCOMING SUBMISSION (FLAGGED)</span>
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-[10px] border border-rose-800">
                    {currentInvoice.approval_status}
                  </span>
                </div>
                <div>Invoice #: <strong className="text-white">{currentInvoice.invoice_number}</strong></div>
                <div>Subtotal: <strong>${currentInvoice.subtotal?.toLocaleString()}</strong></div>
                <div>Claimed Tax: <strong className="text-rose-400">${currentInvoice.claimed_tax_amount?.toLocaleString()} ({(currentInvoice.claimed_tax_rate*100).toFixed(1)}%)</strong></div>
                <div>Total Amount: <strong className="text-rose-400">${currentInvoice.total_amount?.toLocaleString()}</strong></div>
                <div>File: <span className="text-slate-400">{currentInvoice.file_name}</span></div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono">
              Detection Evidence: {currentInvoice.matched_duplicate.evidence || 'Identical normalized invoice number within the same registered vendor profile.'}
            </div>
          </div>
        </div>
      )}

      {/* VENDOR REGISTRATION MODAL (OPTION C) */}
      {showRegisterVendorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Building2 className="h-5 w-5 text-cyan-400" />
                <span>Register Master Vendor</span>
              </h3>
              <button
                onClick={() => setShowRegisterVendorModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Register a verified enterprise vendor to establish their contractual statutory tax rate, risk tier, and invoice spend baseline.
            </p>

            {vendorError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {vendorError}
              </div>
            )}

            <form onSubmit={handleRegisterVendor} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Vendor Legal Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Industrial Supplies Ltd"
                  value={registerVendorForm.name}
                  onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Tax ID / GSTIN / EIN *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. US-EIN-8839210 or IN-GST-27AABCA1042K1Z5"
                  value={registerVendorForm.tax_id}
                  onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, tax_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Contract Tax Rate (%) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    value={registerVendorForm.default_tax_rate}
                    onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, default_tax_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">Standard GST/VAT baseline</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Risk Profile Tier</label>
                  <select
                    value={registerVendorForm.risk_tier}
                    onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, risk_tier: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="LOW">LOW Risk (Trusted)</option>
                    <option value="MEDIUM">MEDIUM Risk (Standard)</option>
                    <option value="HIGH">HIGH Risk (Restricted)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Avg Expected Invoice ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={registerVendorForm.avg_invoice_amount}
                    onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, avg_invoice_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Max Transaction Limit ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={registerVendorForm.max_invoice_amount}
                    onChange={(e) => setRegisterVendorForm({ ...registerVendorForm, max_invoice_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRegisterVendorModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingVendor}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20 disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {isSubmittingVendor ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />}
                  <span>Save & Register Vendor</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CONTRACT TAX RATE MODAL (OPTION C) */}
      {editingTaxRateVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Building2 className="h-5 w-5 text-cyan-400" />
                <span>Update Contract Statutory Tax Rate</span>
              </h3>
              <button
                onClick={() => setEditingTaxRateVendor(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs space-y-1">
              <div className="text-white font-bold">{editingTaxRateVendor.vendorName}</div>
              <div className="text-slate-400 font-mono">Current Statutory Baseline: {(editingTaxRateVendor.currentRate * 100).toFixed(1)}%</div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">New Contracted Tax Rate (%) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={editingTaxRateVendor.newRate}
                  onChange={(e) => setEditingTaxRateVendor({
                    ...editingTaxRateVendor,
                    newRate: parseFloat(e.target.value) || 0
                  })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {[0, 5, 12, 18, 28].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setEditingTaxRateVendor({
                      ...editingTaxRateVendor,
                      newRate: rate
                    })}
                    className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold transition cursor-pointer ${
                      editingTaxRateVendor.newRate === rate
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Audit Justification / Contract Schedule Ref</label>
                <input
                  type="text"
                  placeholder="e.g. Supplier amended statutory contract schedule for 2026"
                  value={editingTaxRateVendor.reason}
                  onChange={(e) => setEditingTaxRateVendor({
                    ...editingTaxRateVendor,
                    reason: e.target.value
                  })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-amber-300 font-mono">
                Notice: Modifying this rate will immediately update statutory fraud defense rules for all future invoices processed from this supplier.
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingTaxRateVendor(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleUpdateContractTaxRate(
                  editingTaxRateVendor.vendorId,
                  editingTaxRateVendor.newRate,
                  editingTaxRateVendor.reason
                )}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20"
              >
                Confirm Rate Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 text-center text-xs text-slate-500 font-mono">
        Veritas Enterprise AP Gateway • Production Build • Live Cloud Database Active
      </footer>
    </div>
  );
}
