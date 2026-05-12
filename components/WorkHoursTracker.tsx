"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
const MIN_HOURS = 4;

// ── Types ──────────────────────────────────────────────────────────────────────

interface Entry {
  id: string;
  date: string;
  jobDescription: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  breakMins: number;
  archived?: boolean;
}

interface ProcessedEntry extends Entry {
  total: number;
  regular: number;
  overtime: number;
  tfnPortion: number;
  abnPortion: number;
  rTFN: number;
  otTFN: number;
  rABN: number;
  otABN: number;
  tfnEarnings: number;
  abnEarnings: number;
  totalEarnings: number;
}

interface Settings {
  yourName: string;
  abn: string;
  yourAddress: string;
  yourPhone: string;
  yourEmail: string;
  tfnRate: string;
  defaultRate: string;
  invoicePrefix: string;
  invoiceNum: number;
  invoiceDate: string;
  invoiceItems: InvoiceItem[];
  companyName: string;
  companyAbn: string;
  companyAddress: string;
  companyEmail: string;
  bankName: string;
  bsb: string;
  accountNumber: string;
  invoiceNotes: string;
  tfnLimit: number;
  overtimeThreshold: number;
  pdfNamePattern: string;
}

interface Totals {
  hours: number;
  tfnHours: number;
  abnHours: number;
  otHours: number;
  tfnEarnings: number;
  abnEarnings: number;
  total: number;
}

interface FormState {
  date: string;
  jobDescription: string;
  startTime: string;
  endTime: string;
  hourlyRate: string;
  breakMins: string;
}

interface Toast {
  msg: string;
  type: "ok" | "err";
}

interface InvoiceItem {
  id: string;
  date: string;
  description: string;
  amount: number;
}

interface InvLineRow {
  key: string;
  date: string;
  startTime?: string;
  description: string;
  rate: number | null;
  hours: number | null;
  amount: number;
}

interface SavedInvoice {
  id: string;
  invoiceNum: number;
  issueDate: string;
  companyName: string;
  subtotal: number;
  createdAt: string;
  data: {
    settings: Partial<Settings>;
    rows: InvLineRow[];
    periodStart: string;
    periodEnd: string;
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 1440;
  return +(mins / 60).toFixed(6);
}

function fh(h: number): string {
  if (!h || h <= 0) return "0h 00m";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${String(mins).padStart(2, "0")}m`;
}

function fc(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n || 0);
}

function fd(d: string): string {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function fdInv(d: string): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function buildPdfFilename(pattern: string, invoiceNum: number, companyName: string, date: string): string {
  const [y, m, d] = (date || todayStr()).split("-");
  const company = (companyName || "Invoice").replace(/[^a-zA-Z0-9]/g, "");
  const name = (pattern || "Invoice-{num}-{company}-{date}")
    .replace(/\{num\}/g,     String(invoiceNum || 1))
    .replace(/\{company\}/g, company)
    .replace(/\{date\}/g,    `${d}${m}${y}`)
    .replace(/\{year\}/g,    y)
    .replace(/\{month\}/g,   m)
    .replace(/\{day\}/g,     d);
  return name.endsWith(".pdf") ? name : name + ".pdf";
}

async function downloadPdf(elementId: string, filename: string): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) return;
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF }   = await import("jspdf");
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
  const imgData = canvas.toDataURL("image/png");
  const pdf   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH  = (canvas.height * pageW) / canvas.width;
  let remaining = imgH;
  let offset    = 0;
  pdf.addImage(imgData, "PNG", 0, offset, pageW, imgH);
  remaining -= pageH;
  while (remaining > 0) {
    offset -= pageH;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, offset, pageW, imgH);
    remaining -= pageH;
  }
  pdf.save(filename);
}

// ── Core Calculation Engine ────────────────────────────────────────────────────
//
//  Two independent splits per entry:
//    OVERTIME: hours beyond 12 in the same calendar day → rate ×1.5
//    TFN/ABN:  first `tfnLimit` hours of period → TFN salary; excess → ABN invoice
//
//  The intersection gives 4 buckets: rTFN, otTFN, rABN, otABN
//
function processEntries(entries: Entry[], tfnLimit = 30, tfnRate?: number, overtimeThreshold = 12): ProcessedEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.startTime.localeCompare(b.startTime);
  });

  let periodRun = 0;

  return sorted.map(entry => {
    const worked   = calcHours(entry.startTime, entry.endTime) - (entry.breakMins || 0) / 60;
    const total    = Math.max(MIN_HOURS, worked);

    // Overtime is per-entry: applies when this entry alone exceeds the threshold
    const regular  = Math.min(total, overtimeThreshold);
    const overtime = total - regular;

    const tfnPortion = Math.max(0, Math.min(tfnLimit, periodRun + total) - periodRun);
    const abnPortion = total - tfnPortion;

    const rTFN  = Math.max(0, Math.min(regular, tfnPortion));
    const otTFN = Math.max(0, Math.min(total, tfnPortion) - regular);
    const rABN  = Math.max(0, Math.min(regular, total) - tfnPortion);
    const otABN = Math.max(0, total - Math.max(regular, tfnPortion));

    const abnR = entry.hourlyRate;
    const tR   = tfnRate ?? abnR;
    const tfnEarnings = rTFN * tR  + otTFN * tR  * 1.5;
    const abnEarnings = rABN * abnR + otABN * abnR * 1.5;

    periodRun += total;

    return {
      ...entry,
      total, regular, overtime,
      tfnPortion, abnPortion,
      rTFN, otTFN, rABN, otABN,
      tfnEarnings, abnEarnings,
      totalEarnings: tfnEarnings + abnEarnings,
    };
  });
}

// ── Supabase row mappers ────────────────────────────────────────────────────────

function rowToEntry(row: Record<string, unknown>): Entry {
  return {
    id:             row.id as string,
    date:           row.date as string,
    jobDescription: row.job_description as string,
    startTime:      (row.start_time as string).slice(0, 5),
    endTime:        (row.end_time   as string).slice(0, 5),
    hourlyRate:     Number(row.hourly_rate),
    breakMins:      Number(row.break_mins) || 0,
    archived:       !!(row.archived),
  };
}

function entryToRow(entry: Entry, userId: string): Record<string, unknown> {
  return {
    id:              entry.id,
    user_id:         userId,
    date:            entry.date,
    job_description: entry.jobDescription,
    start_time:      entry.startTime,
    end_time:        entry.endTime,
    hourly_rate:     entry.hourlyRate,
    break_mins:      entry.breakMins,
    archived:        entry.archived ?? false,
  };
}

function fromInvoiceRow(row: Record<string, unknown>): SavedInvoice {
  return {
    id:          row.id as string,
    invoiceNum:  row.invoice_num as number,
    issueDate:   row.issue_date as string,
    companyName: (row.company_name as string) || "",
    subtotal:    Number(row.subtotal),
    createdAt:   row.created_at as string,
    data:        row.data as SavedInvoice["data"],
  };
}

// ── Default settings ───────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  yourName: "", abn: "", yourAddress: "", yourPhone: "", yourEmail: "",
  tfnRate: "", defaultRate: "",
  invoicePrefix: "INV", invoiceNum: 1, invoiceDate: "", invoiceItems: [],
  companyName: "", companyAbn: "", companyAddress: "", companyEmail: "",
  bankName: "", bsb: "", accountNumber: "", invoiceNotes: "",
  tfnLimit: 30, overtimeThreshold: 12,
  pdfNamePattern: "Invoice-{num}-{company}-{date}",
};

// ── Root App ───────────────────────────────────────────────────────────────────

export default function WorkHoursTracker() {
  const supabase = createClient();
  const router = useRouter();
  const [tab,          setTab]          = useState("dashboard");
  const [entries,      setEntries]      = useState<Entry[]>([]);
  const [settings,     setSettings]     = useState<Settings>(DEFAULT_SETTINGS);
  const [periodStart,  setPeriodStart]  = useState("");
  const [periodEnd,    setPeriodEnd]    = useState("");
  const [toast,        setToast]        = useState<Toast | null>(null);
  const [editId,       setEditId]       = useState<string | null>(null);
  const [form,         setForm]         = useState<FormState>({
    date: todayStr(), jobDescription: "", startTime: "", endTime: "", hourlyRate: "", breakMins: "",
  });
  const [theme,          setTheme]          = useState<"light" | "dark">("light");
  const [userId,         setUserId]         = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [invoiceHistory, setInvoiceHistory] = useState<SavedInvoice[]>([]);
  const [viewingInvoice, setViewingInvoice] = useState<SavedInvoice | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("wh_theme") as "light" | "dark" | null;
    const initial = saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("wh_theme", next);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      const [{ data: entriesData }, { data: settingsData }, { data: invoicesData }] = await Promise.all([
        supabase.from("entries").select("*").eq("user_id", user.id).order("date").order("start_time"),
        supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("invoices").select("*").eq("user_id", user.id).order("invoice_num", { ascending: false }),
      ]);

      if (entriesData)  setEntries((entriesData as Record<string, unknown>[]).map(rowToEntry));
      if (settingsData) {
        const sd = settingsData as { data: Settings; period_start: string; period_end: string };
        if (sd.data)         setSettings(s => ({ ...DEFAULT_SETTINGS, ...sd.data }));
        if (sd.period_start) setPeriodStart(sd.period_start);
        if (sd.period_end)   setPeriodEnd(sd.period_end);
      }
      if (invoicesData) setInvoiceHistory((invoicesData as Record<string, unknown>[]).map(fromInvoiceRow));
      setLoading(false);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the issue date current: stamp today if unset or if stored date is in the past
  useEffect(() => {
    if (!loading && userId) {
      const today = todayStr();
      if (!settings.invoiceDate || settings.invoiceDate < today) {
        const s = { ...settings, invoiceDate: today };
        setSettings(s);
        saveSettings(s, periodStart, periodEnd, userId);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId]);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const saveEntry = async (entry: Entry, uid: string) => {
    const { error } = await supabase.from("entries").upsert(entryToRow(entry, uid));
    if (error) showToast("Could not save entry", "err");
  };

  const removeEntry = async (id: string) => {
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) showToast("Could not delete entry", "err");
  };

  const saveSettings = async (s: Settings, ps: string, pe: string, uid: string) => {
    const { error } = await supabase.from("settings").upsert({
      user_id: uid, data: s, period_start: ps || null, period_end: pe || null,
    });
    if (error) showToast("Could not save settings", "err");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const updatePeriod = (field: "start" | "end", val: string) => {
    const ps = field === "start" ? val : periodStart;
    const pe = field === "end"   ? val : periodEnd;
    if (field === "start") setPeriodStart(ps); else setPeriodEnd(pe);
    if (userId) saveSettings(settings, ps, pe, userId);
  };

  const handleSave = () => {
    const { date, jobDescription, startTime, endTime, hourlyRate } = form;
    if (!date || !jobDescription.trim() || !startTime || !endTime || !hourlyRate) {
      showToast("All fields are required", "err"); return;
    }
    if (calcHours(startTime, endTime) <= 0) {
      showToast("End time must be after start time", "err"); return;
    }
    const entry: Entry = {
      ...form,
      hourlyRate: parseFloat(hourlyRate),
      breakMins: parseInt(form.breakMins || "0") || 0,
      id: editId || genId(),
    };
    const newEntries = editId
      ? entries.map(e => e.id === editId ? entry : e)
      : [...entries, entry];
    setEntries(newEntries);
    if (userId) saveEntry(entry, userId);
    showToast(editId ? "Entry updated" : "Entry added");
    setEditId(null);
    setForm({ date: form.date, jobDescription: "", startTime: "", endTime: "", hourlyRate: settings.defaultRate || "", breakMins: "" });
  };

  const handleEdit = (entry: ProcessedEntry) => {
    setEditId(entry.id);
    setForm({
      date: entry.date, jobDescription: entry.jobDescription,
      startTime: entry.startTime, endTime: entry.endTime,
      hourlyRate: String(entry.hourlyRate),
      breakMins: entry.breakMins ? String(entry.breakMins) : "",
    });
    setTab("log");
  };

  const handleDelete = (id: string) => {
    const newEntries = entries.filter(e => e.id !== id);
    setEntries(newEntries);
    removeEntry(id);
    showToast("Entry deleted");
  };

  const handleSettingsSave = (s: Settings) => {
    setSettings(s);
    if (userId) saveSettings(s, periodStart, periodEnd, userId);
    showToast("Settings saved");
  };

  const advanceInvoice = async () => {
    const extraItems = settings.invoiceItems || [];
    const abnEntries = processed.filter(e => e.abnPortion > 0);
    const rows: InvLineRow[] = [];
    for (const e of abnEntries) {
      if (e.rABN > 0)  rows.push({ key: e.id + "-r",  date: e.date, description: e.jobDescription,                     rate: e.hourlyRate,       hours: e.rABN,  amount: e.rABN  * e.hourlyRate       });
      if (e.otABN > 0) rows.push({ key: e.id + "-ot", date: e.date, description: `${e.jobDescription} (overtime ×1.5)`, rate: e.hourlyRate * 1.5, hours: e.otABN, amount: e.otABN * e.hourlyRate * 1.5 });
    }
    for (const item of extraItems) rows.push({ key: item.id, date: item.date, description: item.description, rate: null, hours: null, amount: item.amount });
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const subtotal = totals.abnEarnings + extraItems.reduce((a, i) => a + i.amount, 0);
    const issueDate = settings.invoiceDate || todayStr();

    // Archive all active entries in the current period
    const toArchiveIds = allPeriodEntries.filter(e => !e.archived).map(e => e.id);
    if (toArchiveIds.length > 0 && userId) {
      await supabase.from("entries").update({ archived: true }).in("id", toArchiveIds);
      setEntries(prev => prev.map(e => toArchiveIds.includes(e.id) ? { ...e, archived: true } : e));
    }

    if (userId) {
      const { data: saved, error } = await supabase.from("invoices").insert({
        id: genId(), user_id: userId,
        invoice_num: settings.invoiceNum || 1,
        issue_date: issueDate,
        company_name: settings.companyName || "",
        subtotal,
        data: { settings: { ...settings, invoiceItems: [] }, rows, periodStart, periodEnd },
      }).select().single();
      if (error) {
        showToast(`Could not save invoice history: ${error.message}`, "err");
        return;
      }
      if (saved) setInvoiceHistory(prev => [fromInvoiceRow(saved as Record<string, unknown>), ...prev]);
    }

    const s = { ...settings, invoiceNum: (settings.invoiceNum || 1) + 1, invoiceDate: todayStr(), invoiceItems: [] };
    setSettings(s);
    if (userId) saveSettings(s, periodStart, periodEnd, userId);
    showToast(`Invoice #${settings.invoiceNum} saved`);
  };

  const allPeriodEntries = entries.filter(e =>
    (!periodStart || e.date >= periodStart) &&
    (!periodEnd   || e.date <= periodEnd)
  );
  const periodEntries = allPeriodEntries.filter(e => !e.archived);
  const tfnRateParsed = parseFloat(settings.tfnRate || "") || undefined;
  const processed     = processEntries(periodEntries,    settings.tfnLimit, tfnRateParsed, settings.overtimeThreshold || 12);
  const allProcessed  = processEntries(allPeriodEntries, settings.tfnLimit, tfnRateParsed, settings.overtimeThreshold || 12);
  // For the weekly report: show all entries (including archived) but use TFN/ABN values
  // from `processed` for active entries so they reflect the current period's budget,
  // not the budget already consumed by archived entries.
  const processedById = new Map(processed.map(e => [e.id, e]));
  const weeklyData    = allProcessed.map(e => processedById.get(e.id) ?? e);
  const totals = processed.reduce<Totals>((a, e) => ({
    hours:       a.hours       + e.total,
    tfnHours:    a.tfnHours    + e.tfnPortion,
    abnHours:    a.abnHours    + e.abnPortion,
    otHours:     a.otHours     + e.overtime,
    tfnEarnings: a.tfnEarnings + e.tfnEarnings,
    abnEarnings: a.abnEarnings + e.abnEarnings,
    total:       a.total       + e.totalEarnings,
  }), { hours:0, tfnHours:0, abnHours:0, otHours:0, tfnEarnings:0, abnEarnings:0, total:0 });

  const tfnPct = Math.min(100, (totals.tfnHours / (settings.tfnLimit || 30)) * 100);

  const TABS = [
    { id: "dashboard", label: "Dashboard",    icon: "ti-layout-dashboard" },
    { id: "log",       label: "Log Entry",    icon: "ti-clock-plus"       },
    { id: "entries",   label: "Entries",      icon: "ti-list"             },
    { id: "weekly",    label: "Weekly Report", icon: "ti-calendar-week"   },
    { id: "tfn",       label: "TFN Report",   icon: "ti-report"           },
    { id: "abn",       label: "ABN Invoice",  icon: "ti-receipt"          },
    { id: "history",   label: "Invoices",     icon: "ti-history"          },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)" }}>
        <span style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header no-print">
        <div className="logo">
          <i className="ti ti-briefcase" aria-hidden="true" style={{ fontSize: 18, color: "var(--color-text-warning)" }} />
          SplitShift
        </div>
        <div className="period-row">
          <span>Period:</span>
          <input type="date" value={periodStart} onChange={e => updatePeriod("start", e.target.value)} aria-label="Period start date" />
          <span aria-hidden="true">→</span>
          <input type="date" value={periodEnd}   onChange={e => updatePeriod("end",   e.target.value)} aria-label="Period end date" />
        </div>
        <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
          <i className={`ti ${theme === "dark" ? "ti-sun" : "ti-moon"}`} aria-hidden="true" />
        </button>
        <button className="icon-btn" onClick={() => setTab("settings")} aria-label="Open settings">
          <i className="ti ti-settings" aria-hidden="true" />
        </button>
        <button className="icon-btn" onClick={signOut} aria-label="Sign out">
          <i className="ti ti-logout" aria-hidden="true" />
        </button>
      </header>

      {/* Tab bar */}
      <nav className="tabbar no-print" aria-label="Main navigation">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <i className={`ti ${t.icon}`} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </nav>

      {/* Main content */}
      <main className="main-content">
        {tab === "dashboard" && (
          <Dashboard totals={totals} tfnPct={tfnPct} settings={settings} processed={processed} />
        )}
        {tab === "log" && (
          <LogEntry
            form={form} setForm={setForm} editId={editId}
            onSave={handleSave}
            onCancel={() => {
              setEditId(null);
              setForm({ date: todayStr(), jobDescription: "", startTime: "", endTime: "", hourlyRate: "", breakMins: "" });
            }}
          />
        )}
        {tab === "entries" && (
          <EntriesList processed={processed} onEdit={handleEdit} onDelete={handleDelete} />
        )}
        {tab === "weekly" && (
          <WeeklyReport processed={weeklyData} settings={settings} />
        )}
        {tab === "tfn" && (
          <TFNReport processed={processed} totals={totals} settings={settings} periodStart={periodStart} periodEnd={periodEnd} />
        )}
        {tab === "abn" && (
          <ABNInvoice processed={processed} totals={totals} settings={settings}
            periodStart={periodStart} periodEnd={periodEnd} onAdvance={advanceInvoice}
            onItemsChange={items => {
              const s = { ...settings, invoiceItems: items };
              setSettings(s);
              if (userId) saveSettings(s, periodStart, periodEnd, userId);
            }}
          />
        )}
        {tab === "history" && (
          <InvoiceHistory
            invoices={invoiceHistory}
            viewing={viewingInvoice}
            onView={setViewingInvoice}
            pdfNamePattern={settings.pdfNamePattern}
            onDelete={async id => {
              await supabase.from("invoices").delete().eq("id", id);
              setInvoiceHistory(prev => prev.filter(i => i.id !== id));
              if (viewingInvoice?.id === id) setViewingInvoice(null);
              showToast("Invoice deleted");
            }}
          />
        )}
        {tab === "settings" && (
          <SettingsPage settings={settings} onSave={handleSettingsSave} />
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`} role="alert">
          <i className={`ti ${toast.type === "err" ? "ti-alert-circle" : "ti-circle-check"}`} aria-hidden="true" />
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

function Dashboard({ totals, tfnPct, settings, processed }: {
  totals: Totals; tfnPct: number; settings: Settings; processed: ProcessedEntry[];
}) {
  const byDate: Record<string, ProcessedEntry[]> = {};
  processed.forEach(e => { if (!byDate[e.date]) byDate[e.date] = []; byDate[e.date].push(e); });
  const dates = Object.keys(byDate).sort().reverse().slice(0, 10);

  return (
    <div>
      <h2 className="sr-only">Dashboard overview</h2>

      <div className="metric-grid">
        <Metric label="Total hours"   value={fh(totals.hours)}       sub={`${processed.length} entries`}   />
        <Metric label="TFN hours"     value={fh(totals.tfnHours)}    sub={`of ${settings.tfnLimit}h limit`} color="success"  progress={tfnPct} />
        <Metric label="ABN hours"     value={fh(totals.abnHours)}    sub="invoiceable excess"               color="info"     />
        <Metric label="Overtime"      value={fh(totals.otHours)}     sub="×1.5 rate applied"               color="warning"  />
      </div>
      <div className="metric-grid mt-3">
        <Metric label="TFN earnings"  value={fc(totals.tfnEarnings)} color="success" />
        <Metric label="ABN earnings"  value={fc(totals.abnEarnings)} color="info" />
        <Metric label="Total earnings" value={fc(totals.total)}       bold />
      </div>

      {dates.length > 0 ? (
        <div className="card mt-4">
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>Recent days</p>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Jobs</th><th>Hours</th>
                  <th>Overtime</th><th>TFN</th><th>ABN</th><th>Earnings</th>
                </tr>
              </thead>
              <tbody>
                {dates.map(date => {
                  const de = byDate[date];
                  const d = de.reduce((a, e) => ({
                    h:    a.h    + e.total,
                    ot:   a.ot   + e.overtime,
                    tfn:  a.tfn  + e.tfnPortion,
                    abn:  a.abn  + e.abnPortion,
                    earn: a.earn + e.totalEarnings,
                  }), { h:0, ot:0, tfn:0, abn:0, earn:0 });
                  return (
                    <tr key={date}>
                      <td className="mono" style={{ fontSize: 12 }}>{fd(date)}</td>
                      <td>{de.length}</td>
                      <td className="mono">{fh(d.h)}</td>
                      <td>{d.ot  > 0 ? <Bdg type="ot">{fh(d.ot)}</Bdg>   : <span className="muted">—</span>}</td>
                      <td>{d.tfn > 0 ? <Bdg type="tfn">{fh(d.tfn)}</Bdg> : <span className="muted">—</span>}</td>
                      <td>{d.abn > 0 ? <Bdg type="abn">{fh(d.abn)}</Bdg> : <span className="muted">—</span>}</td>
                      <td className="mono">{fc(d.earn)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-state mt-4">
          <i className="ti ti-clock" aria-hidden="true" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} />
          <p>No entries in this period</p>
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            Set a period in the header, then log your first job
          </p>
        </div>
      )}
    </div>
  );
}

// ── Log Entry ──────────────────────────────────────────────────────────────────

function LogEntry({ form, setForm, editId, onSave, onCancel }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editId: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const breakMinsNum  = parseInt(form.breakMins || "0") || 0;
  const previewRaw    = calcHours(form.startTime, form.endTime);
  const previewActual = Math.max(0, previewRaw - breakMinsNum / 60);
  const previewH      = Math.max(MIN_HOURS, previewActual);
  const previewEarn   = previewH * parseFloat(form.hourlyRate || "0");
  const f = (k: keyof FormState, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div>
      <h2 className="sr-only">{editId ? "Edit entry" : "Log work hours"}</h2>
      <div className="card" style={{ maxWidth: 560 }}>
        <p style={{ fontWeight: 500, marginBottom: 16 }}>
          {editId ? "Edit Entry" : "Log Work Hours"}
        </p>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="f-desc">Job description</label>
            <input id="f-desc" type="text" placeholder="What did you work on?" value={form.jobDescription} onChange={e => f("jobDescription", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-date">Date</label>
            <input id="f-date" type="date" value={form.date} onChange={e => f("date", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-rate">Hourly rate (AUD)</label>
            <input id="f-rate" type="number" min="0" step="0.01" placeholder="0.00" value={form.hourlyRate} onChange={e => f("hourlyRate", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-start">Start time</label>
            <input id="f-start" type="time" value={form.startTime} onChange={e => f("startTime", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-end">End time</label>
            <input id="f-end" type="time" value={form.endTime} onChange={e => f("endTime", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-break">Break (mins, unpaid)</label>
            <input id="f-break" type="number" min="0" step="5" placeholder="0" value={form.breakMins} onChange={e => f("breakMins", e.target.value)} />
          </div>
        </div>

        {previewRaw > 0 && (
          <div className="preview-box">
            <span>
              <span className="muted">On site: </span>
              <strong className="mono">{fh(previewRaw)}</strong>
              {breakMinsNum > 0 && (
                <span className="muted"> − {breakMinsNum}m break = <strong className="mono">{fh(previewActual)}</strong></span>
              )}
              {previewActual < MIN_HOURS && (
                <span className="muted"> → billed <strong className="mono" style={{ color: "var(--color-text-warning)" }}>{fh(previewH)}</strong> (min. call)</span>
              )}
            </span>
            {previewH > 12 && (
              <span>
                <span className="muted">Overtime: </span>
                <strong className="mono" style={{ color: "var(--color-text-warning)" }}>
                  {fh(previewH - 12)} ×1.5
                </strong>
              </span>
            )}
            <span>
              <span className="muted">Est. earnings: </span>
              <strong className="mono" style={{ color: "var(--color-text-success)" }}>
                {fc(previewEarn)}
              </strong>
            </span>
          </div>
        )}

        <div className="btn-row">
          <button className="btn-primary" onClick={onSave}>
            <i className="ti ti-check" aria-hidden="true" />
            {editId ? "Update Entry" : "Add Entry"}
          </button>
          {editId && (
            <button className="btn-secondary" onClick={onCancel}>
              <i className="ti ti-x" aria-hidden="true" />
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Entries List ───────────────────────────────────────────────────────────────

function EntriesList({ processed, onEdit, onDelete }: {
  processed: ProcessedEntry[];
  onEdit: (e: ProcessedEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="sr-only">All entries for current period</h2>
      {processed.length === 0 ? (
        <div className="empty-state">
          <i className="ti ti-list" aria-hidden="true" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} />
          <p>No entries in this period</p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th><th>Job</th><th>Time</th>
                <th>Hours</th><th>Rate</th><th>Split</th><th>Earnings</th><th></th>
              </tr>
            </thead>
            <tbody>
              {processed.map(e => (
                <tr key={e.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{fd(e.date)}</td>
                  <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.jobDescription}
                  </td>
                  <td className="mono" style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
                    {e.startTime}–{e.endTime}
                    {e.breakMins > 0 && (
                      <span style={{ marginLeft: 4, color: "var(--color-text-tertiary)" }}>−{e.breakMins}m</span>
                    )}
                  </td>
                  <td className="mono">{fh(e.total)}</td>
                  <td className="mono">{fc(e.hourlyRate)}/h</td>
                  <td style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
                    {e.tfnPortion > 0 && <Bdg type="tfn">TFN {fh(e.tfnPortion)}</Bdg>}
                    {e.abnPortion > 0 && <Bdg type="abn">ABN {fh(e.abnPortion)}</Bdg>}
                    {e.overtime    > 0 && <Bdg type="ot">OT {fh(e.overtime)}</Bdg>}
                  </td>
                  <td className="mono">{fc(e.totalEarnings)}</td>
                  <td>
                    <span style={{ display: "flex", gap: 4 }}>
                      <button className="icon-btn-sm" onClick={() => onEdit(e)} aria-label="Edit">
                        <i className="ti ti-edit" aria-hidden="true" />
                      </button>
                      <button className="icon-btn-sm danger" onClick={() => onDelete(e.id)} aria-label="Delete">
                        <i className="ti ti-trash" aria-hidden="true" />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Weekly Report ──────────────────────────────────────────────────────────────

function weekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function weekEnd(monStr: string): string {
  const d = new Date(monStr + "T12:00:00");
  d.setDate(d.getDate() + 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekLabel(monStr: string): string {
  const mon = new Date(monStr + "T12:00:00");
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return `${mon.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${sun.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;
}

interface WeekSummary {
  weekStart: string;
  entries: ProcessedEntry[];
  hours: number;
  breakMinsTotal: number;
  regular: number;
  overtime: number;
  tfnHours: number;
  abnHours: number;
  tfnEarnings: number;
  abnEarnings: number;
  total: number;
}

function WeeklyReport({ processed, settings }: { processed: ProcessedEntry[]; settings: Settings }) {
  const [expanded,     setExpanded]     = React.useState<Record<string, boolean>>({});
  const [selectedWeek, setSelectedWeek] = React.useState<WeekSummary | null>(null);
  const [downloading,  setDownloading]  = React.useState(false);

  const weekMap: Record<string, ProcessedEntry[]> = {};
  processed.forEach(e => {
    const ws = weekStart(e.date);
    if (!weekMap[ws]) weekMap[ws] = [];
    weekMap[ws].push(e);
  });

  const weeks: WeekSummary[] = Object.keys(weekMap).sort().map(ws => {
    const entries = weekMap[ws];
    return entries.reduce<WeekSummary>((a, e) => ({
      weekStart:      ws,
      entries,
      hours:          a.hours         + e.total,
      breakMinsTotal: a.breakMinsTotal + (e.breakMins || 0),
      regular:        a.regular        + e.regular,
      overtime:       a.overtime       + e.overtime,
      tfnHours:       a.tfnHours       + e.tfnPortion,
      abnHours:       a.abnHours       + e.abnPortion,
      tfnEarnings:    a.tfnEarnings    + e.tfnEarnings,
      abnEarnings:    a.abnEarnings    + e.abnEarnings,
      total:          a.total          + e.totalEarnings,
    }), { weekStart: ws, entries, hours:0, breakMinsTotal:0, regular:0, overtime:0, tfnHours:0, abnHours:0, tfnEarnings:0, abnEarnings:0, total:0 });
  });

  const grandTotal = weeks.reduce<Omit<WeekSummary, "weekStart"|"entries">>((a, w) => ({
    hours:          a.hours          + w.hours,
    breakMinsTotal: a.breakMinsTotal + w.breakMinsTotal,
    regular:        a.regular        + w.regular,
    overtime:       a.overtime       + w.overtime,
    tfnHours:       a.tfnHours       + w.tfnHours,
    abnHours:       a.abnHours       + w.abnHours,
    tfnEarnings:    a.tfnEarnings    + w.tfnEarnings,
    abnEarnings:    a.abnEarnings    + w.abnEarnings,
    total:          a.total          + w.total,
  }), { hours:0, breakMinsTotal:0, regular:0, overtime:0, tfnHours:0, abnHours:0, tfnEarnings:0, abnEarnings:0, total:0 });

  if (weeks.length === 0) {
    return (
      <div className="empty-state">
        <i className="ti ti-calendar-week" aria-hidden="true" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} />
        <p>No entries in this period</p>
      </div>
    );
  }

  if (selectedWeek) {
    return (
      <div>
        <div className="print-actions no-print">
          <button className="btn-secondary" onClick={() => setSelectedWeek(null)}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> All weeks
          </button>
          <button className="btn-secondary" disabled={downloading} onClick={async () => {
            setDownloading(true);
            const filename = `Timesheet-${selectedWeek.weekStart}-${weekEnd(selectedWeek.weekStart)}.pdf`;
            await downloadPdf("week-timesheet-doc", filename);
            setDownloading(false);
          }}>
            <i className="ti ti-download" aria-hidden="true" />
            {downloading ? "Generating…" : "Download PDF"}
          </button>
        </div>
        <WeekTimesheetDoc week={selectedWeek} settings={settings} />
      </div>
    );
  }

  return (
    <div id="weekly-report-doc">
      <h2 className="sr-only">Weekly report</h2>

      <div className="print-actions no-print">
        <button className="btn-secondary" disabled={downloading} onClick={async () => {
          setDownloading(true);
          await downloadPdf("weekly-report-doc", "Weekly-Report.pdf");
          setDownloading(false);
        }}>
          <i className="ti ti-download" aria-hidden="true" />
          {downloading ? "Generating…" : "Download PDF"}
        </button>
      </div>

      {/* Summary table */}
      <div className="card" style={{ overflowX: "auto" }}>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>Period summary by week</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Week</th>
              <th>Entries</th>
              <th>Break</th>
              <th>Billed hrs</th>
              <th>Regular</th>
              <th>Overtime</th>
              <th>TFN hrs</th>
              <th>ABN hrs</th>
              <th>TFN earnings</th>
              <th>ABN earnings</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(w => (
              <React.Fragment key={w.weekStart}>
                <tr>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>{weekLabel(w.weekStart)}</td>
                  <td>{w.entries.length}</td>
                  <td className="mono muted">{w.breakMinsTotal > 0 ? `${w.breakMinsTotal}m` : "—"}</td>
                  <td className="mono">{fh(w.hours)}</td>
                  <td className="mono">{fh(w.regular)}</td>
                  <td className="mono">{w.overtime > 0 ? <Bdg type="ot">{fh(w.overtime)}</Bdg> : <span className="muted">—</span>}</td>
                  <td className="mono">{w.tfnHours > 0 ? <Bdg type="tfn">{fh(w.tfnHours)}</Bdg> : <span className="muted">—</span>}</td>
                  <td className="mono">{w.abnHours > 0 ? <Bdg type="abn">{fh(w.abnHours)}</Bdg> : <span className="muted">—</span>}</td>
                  <td className="mono" style={{ color: "var(--color-text-success)" }}>{fc(w.tfnEarnings)}</td>
                  <td className="mono" style={{ color: "var(--color-text-info)" }}>{fc(w.abnEarnings)}</td>
                  <td className="mono" style={{ fontWeight: 500 }}>{fc(w.total)}</td>
                  <td>
                    <span style={{ display: "flex", gap: 4 }}>
                      <button className="icon-btn-sm no-print" onClick={() => setSelectedWeek(w)} aria-label="Print week report">
                        <i className="ti ti-printer" aria-hidden="true" />
                      </button>
                      <button
                        className="icon-btn-sm no-print"
                        onClick={() => setExpanded(prev => ({ ...prev, [w.weekStart]: !prev[w.weekStart] }))}
                        aria-label={expanded[w.weekStart] ? "Collapse" : "Expand"}
                      >
                        <i className={`ti ${expanded[w.weekStart] ? "ti-chevron-up" : "ti-chevron-down"}`} aria-hidden="true" />
                      </button>
                    </span>
                  </td>
                </tr>

                {/* Expanded entries for this week */}
                {expanded[w.weekStart] && w.entries.map(e => (
                  <tr key={e.id} style={{ background: "var(--color-background-secondary)", opacity: e.archived ? 0.65 : 1 }}>
                    <td className="mono muted" style={{ fontSize: 11, paddingLeft: 24 }}>
                      {fd(e.date)}
                      {e.archived && <span style={{ marginLeft: 6, fontSize: 10, background: "var(--color-background-tertiary)", color: "var(--color-text-tertiary)", padding: "1px 5px", borderRadius: 3 }}>invoiced</span>}
                    </td>
                    <td colSpan={2} style={{ fontSize: 12, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.jobDescription}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {e.startTime}–{e.endTime}
                      {e.breakMins > 0 && <span className="muted"> −{e.breakMins}m</span>}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{fh(e.regular)}</td>
                    <td>{e.overtime > 0 ? <Bdg type="ot">{fh(e.overtime)}</Bdg> : <span className="muted">—</span>}</td>
                    <td>{e.tfnPortion > 0 ? <Bdg type="tfn">{fh(e.tfnPortion)}</Bdg> : <span className="muted">—</span>}</td>
                    <td>{e.abnPortion > 0 ? <Bdg type="abn">{fh(e.abnPortion)}</Bdg> : <span className="muted">—</span>}</td>
                    <td className="mono" style={{ fontSize: 12, color: "var(--color-text-success)" }}>{fc(e.tfnEarnings)}</td>
                    <td className="mono" style={{ fontSize: 12, color: "var(--color-text-info)" }}>{fc(e.abnEarnings)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{fc(e.totalEarnings)}</td>
                    <td />
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "1px solid var(--color-border-secondary)" }}>
              <td style={{ fontWeight: 500, fontSize: 12 }}>Total</td>
              <td>{processed.length}</td>
              <td className="mono muted">{grandTotal.breakMinsTotal > 0 ? `${grandTotal.breakMinsTotal}m` : "—"}</td>
              <td className="mono" style={{ fontWeight: 500 }}>{fh(grandTotal.hours)}</td>
              <td className="mono">{fh(grandTotal.regular)}</td>
              <td className="mono">{grandTotal.overtime > 0 ? <Bdg type="ot">{fh(grandTotal.overtime)}</Bdg> : <span className="muted">—</span>}</td>
              <td className="mono">{grandTotal.tfnHours > 0 ? <Bdg type="tfn">{fh(grandTotal.tfnHours)}</Bdg> : <span className="muted">—</span>}</td>
              <td className="mono">{grandTotal.abnHours > 0 ? <Bdg type="abn">{fh(grandTotal.abnHours)}</Bdg> : <span className="muted">—</span>}</td>
              <td className="mono" style={{ fontWeight: 500, color: "var(--color-text-success)" }}>{fc(grandTotal.tfnEarnings)}</td>
              <td className="mono" style={{ fontWeight: 500, color: "var(--color-text-info)" }}>{fc(grandTotal.abnEarnings)}</td>
              <td className="mono" style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)" }}>{fc(grandTotal.total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Week Timesheet Document ────────────────────────────────────────────────────

function WeekTimesheetDoc({ week, settings }: { week: WeekSummary; settings: Settings }) {
  const sorted = [...week.entries].sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)
  );

  return (
    <div id="week-timesheet-doc" className="invoice-doc">
      {/* Title */}
      <div style={{ textAlign: "right", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>TIMESHEET</h1>
        <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>{weekLabel(week.weekStart)}</div>
      </div>

      {/* Contractor + Company */}
      <div className="inv-header" style={{ marginBottom: 20 }}>
        <div className="inv-from">
          {settings.yourName    && <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{settings.yourName}</div>}
          {settings.abn         && <div>ABN: {settings.abn}</div>}
          {settings.yourAddress && <div>{settings.yourAddress}</div>}
          {settings.yourPhone   && <div>Phone: {settings.yourPhone}</div>}
          {settings.yourEmail   && <div>Email: {settings.yourEmail}</div>}
        </div>
        <div className="inv-from">
          {settings.companyName  && <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{settings.companyName}</div>}
          {settings.companyAbn   && <div>ABN: {settings.companyAbn}</div>}
          {settings.companyEmail && <div>Email: {settings.companyEmail}</div>}
        </div>
      </div>

      {/* Entries table */}
      <table className="inv-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Start</th>
            <th>End</th>
            <th style={{ textAlign: "right" }}>Break</th>
            <th style={{ textAlign: "right" }}>Hours</th>
            <th style={{ textAlign: "right" }}>TFN hrs</th>
            <th style={{ textAlign: "right" }}>ABN hrs</th>
            <th style={{ textAlign: "right" }}>OT hrs</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(e => (
            <tr key={e.id}>
              <td style={{ whiteSpace: "nowrap" }}>{fdInv(e.date)}</td>
              <td>{e.jobDescription}</td>
              <td>{e.startTime}</td>
              <td>{e.endTime}</td>
              <td style={{ textAlign: "right", color: e.breakMins > 0 ? undefined : "#999" }}>{e.breakMins > 0 ? `${e.breakMins}m` : "—"}</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>{e.total.toFixed(2)}</td>
              <td style={{ textAlign: "right", color: e.tfnPortion > 0 ? "#16a34a" : "#999" }}>{e.tfnPortion > 0 ? e.tfnPortion.toFixed(2) : "—"}</td>
              <td style={{ textAlign: "right", color: e.abnPortion > 0 ? "#1d4ed8" : "#999" }}>{e.abnPortion > 0 ? e.abnPortion.toFixed(2) : "—"}</td>
              <td style={{ textAlign: "right", color: e.overtime   > 0 ? "#d97706" : "#999" }}>{e.overtime   > 0 ? e.overtime.toFixed(2)   : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div className="inv-box" style={{ marginTop: 0 }}>
        <div className="inv-box-title">Hours summary</div>
        <div className="inv-totals-line"><span>Regular hours</span><span>{week.regular.toFixed(2)}</span></div>
        {week.overtime > 0 && <div className="inv-totals-line"><span>Overtime hours (×1.5)</span><span>{week.overtime.toFixed(2)}</span></div>}
        {week.tfnHours > 0 && <div className="inv-totals-line"><span style={{ color: "#16a34a" }}>TFN hours</span><span>{week.tfnHours.toFixed(2)}</span></div>}
        {week.abnHours > 0 && <div className="inv-totals-line"><span style={{ color: "#1d4ed8" }}>ABN hours</span><span>{week.abnHours.toFixed(2)}</span></div>}
        {week.breakMinsTotal > 0 && <div className="inv-totals-line"><span>Total break</span><span>{week.breakMinsTotal}m</span></div>}
        <div className="inv-totals-line total"><span>Total billed hours</span><span>{week.hours.toFixed(2)}</span></div>
      </div>
    </div>
  );
}

// ── TFN Report ─────────────────────────────────────────────────────────────────

function TFNReport({ processed, totals, settings, periodStart, periodEnd }: {
  processed: ProcessedEntry[]; totals: Totals; settings: Settings;
  periodStart: string; periodEnd: string;
}) {
  const tfnEntries = processed.filter(e => e.tfnPortion > 0);
  const regHrs = tfnEntries.reduce((a, e) => a + e.rTFN,  0);
  const otHrs  = tfnEntries.reduce((a, e) => a + e.otTFN, 0);

  return (
    <div>
      <h2 className="sr-only">TFN timesheet report</h2>

      <div className="print-actions no-print">
        <button className="btn-secondary" onClick={() => window.print()}>
          <i className="ti ti-printer" aria-hidden="true" /> Print / Save PDF
        </button>
      </div>

      <div className="card report-header">
        <div>
          <div className="report-label tfn">TFN Timesheet</div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 500 }}>{settings.yourName || "Your Name"}</div>
            {settings.companyName && (
              <div className="muted" style={{ fontSize: 13 }}>{settings.companyName}</div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted" style={{ fontSize: 12 }}>Period</div>
          <div className="mono">{fd(periodStart)} — {fd(periodEnd)}</div>
        </div>
      </div>

      {tfnEntries.length === 0 ? (
        <div className="empty-state mt-4"><p>No TFN hours in this period</p></div>
      ) : (
        <>
          <div className="card mt-3" style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Job description</th>
                  <th>Start</th><th>End</th>
                  <th>Regular hrs</th>
                </tr>
              </thead>
              <tbody>
                {tfnEntries.map(e => (
                  <tr key={e.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{fd(e.date)}</td>
                    <td>{e.jobDescription}</td>
                    <td className="mono">{e.startTime}</td>
                    <td className="mono">{e.endTime}</td>
                    <td className="mono">{fh(e.rTFN)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="totals-row mt-3">
            <div className="card" style={{ padding: "12px 16px" }}>
              <div className="muted" style={{ fontSize: 12 }}>Regular hours</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-success)" }}>{fh(regHrs)}</div>
            </div>
            <div className="card" style={{ padding: "12px 16px" }}>
              <div className="muted" style={{ fontSize: 12 }}>Overtime hours</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-warning)" }}>{fh(otHrs)}</div>
            </div>
            <div className="card" style={{ padding: "12px 16px" }}>
              <div className="muted" style={{ fontSize: 12 }}>TFN total</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 500, color: "var(--color-text-success)" }}>{fc(totals.tfnEarnings)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── ABN Invoice ────────────────────────────────────────────────────────────────

function ABNInvoice({ processed, totals, settings, onAdvance, onItemsChange }: {
  processed: ProcessedEntry[]; totals: Totals; settings: Settings;
  periodStart: string; periodEnd: string; onAdvance: () => void;
  onItemsChange: (items: InvoiceItem[]) => void;
}) {
  const [newDate,      setNewDate]      = useState(todayStr());
  const [newDesc,      setNewDesc]      = useState("");
  const [newAmt,       setNewAmt]       = useState("");
  const [downloading,  setDownloading]  = useState(false);

  const abnEntries = processed.filter(e => e.abnPortion > 0);
  const extraItems = settings.invoiceItems || [];
  const invNum  = String(settings.invoiceNum || 1);
  const nextNum = String((settings.invoiceNum || 1) + 1);

  const allRows: InvLineRow[] = [];
  for (const e of abnEntries) {
    if (e.rABN > 0)  allRows.push({ key: e.id + "-r",  date: e.date, startTime: e.startTime, description: e.jobDescription,                      rate: e.hourlyRate,       hours: e.rABN,  amount: e.rABN  * e.hourlyRate       });
    if (e.otABN > 0) allRows.push({ key: e.id + "-ot", date: e.date, startTime: e.startTime, description: `${e.jobDescription} (overtime ×1.5)`,  rate: e.hourlyRate * 1.5, hours: e.otABN, amount: e.otABN * e.hourlyRate * 1.5 });
  }
  for (const item of extraItems) {
    allRows.push({ key: item.id, date: item.date, description: item.description, rate: null, hours: null, amount: item.amount });
  }
  allRows.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : (a.startTime ?? "").localeCompare(b.startTime ?? "");
  });

  const addItem = () => {
    const amt = parseFloat(newAmt);
    if (!newDate || !newDesc.trim() || !amt) return;
    onItemsChange([...extraItems, { id: genId(), date: newDate, description: newDesc.trim(), amount: amt }]);
    setNewDesc(""); setNewAmt("");
  };

  const subtotal = totals.abnEarnings + extraItems.reduce((a, i) => a + i.amount, 0);

  return (
    <div>
      <h2 className="sr-only">ABN tax invoice</h2>

      <div className="print-actions no-print">
        <button className="btn-secondary" disabled={downloading} onClick={async () => {
          setDownloading(true);
          const filename = buildPdfFilename(
            settings.pdfNamePattern,
            settings.invoiceNum,
            settings.companyName,
            settings.invoiceDate || todayStr(),
          );
          await downloadPdf("abn-invoice-doc", filename);
          setDownloading(false);
        }}>
          <i className="ti ti-download" aria-hidden="true" />
          {downloading ? "Generating…" : "Download PDF"}
        </button>
        {abnEntries.length > 0 && (
          <button className="btn-primary" onClick={onAdvance}>
            <i className="ti ti-check" aria-hidden="true" />
            Mark Sent — advance to #{nextNum}
          </button>
        )}
      </div>

      {abnEntries.length === 0 ? (
        <div className="empty-state">
          <i className="ti ti-circle-check" aria-hidden="true" style={{ fontSize: 36, color: "var(--color-text-success)" }} />
          <p>No ABN hours to invoice</p>
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            All hours are within the {settings.tfnLimit}h TFN limit
          </p>
        </div>
      ) : (
        <>
        {/* Extra items manager (screen only) */}
        <div className="card no-print" style={{ maxWidth: 820, margin: "0 auto 16px" }}>
          <p style={{ fontWeight: 500, marginBottom: 12, fontSize: 13 }}>Extra invoice items</p>
          {extraItems.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {extraItems.map(item => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <span style={{ fontSize: 13 }}><span style={{ color: "var(--color-text-secondary)", marginRight: 10 }}>{fdInv(item.date)}</span>{item.description}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>$ {item.amount.toFixed(2)}</span>
                    <button className="icon-btn-sm danger" onClick={() => onItemsChange(extraItems.filter(i => i.id !== item.id))} aria-label="Remove">
                      <i className="ti ti-trash" aria-hidden="true" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ width: 150 }}>
              <label htmlFor="ei-date">Date</label>
              <input id="ei-date" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label htmlFor="ei-desc">Description</label>
              <input id="ei-desc" type="text" placeholder="e.g. Parking, License4Work fee" value={newDesc}
                onChange={e => setNewDesc(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()} />
            </div>
            <div className="field" style={{ width: 130 }}>
              <label htmlFor="ei-amt">Amount (AUD)</label>
              <input id="ei-amt" type="number" min="0" step="0.01" placeholder="0.00" value={newAmt}
                onChange={e => setNewAmt(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()} />
            </div>
            <button className="btn-primary" onClick={addItem} style={{ marginBottom: 1 }}>
              <i className="ti ti-plus" aria-hidden="true" /> Add
            </button>
          </div>
        </div>

        <div id="abn-invoice-doc" className="invoice-doc">
          {/* Header: from (left) + title & to (right) */}
          <div className="inv-header">
            <div className="inv-from">
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{settings.yourName || "Your Name"}</div>
              {settings.abn         && <div>ABN: {settings.abn}</div>}
              {settings.yourAddress && <div>{settings.yourAddress}</div>}
              {settings.yourPhone   && <div>Phone: {settings.yourPhone}</div>}
              {settings.yourEmail   && <div>Email: {settings.yourEmail}</div>}
            </div>
            <div className="inv-title-col">
              <h1 className="inv-title">TAX INVOICE #{invNum}</h1>
              <div style={{ marginTop: 14, lineHeight: 1.55 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Invoice to: {settings.companyName || "Company Name"}</div>
                {settings.companyAbn   && <div>ABN: {settings.companyAbn}</div>}
                {settings.companyEmail && <div>Email: {settings.companyEmail}</div>}
              </div>
              <div style={{ marginTop: 10 }}>
                <strong>Issue date: </strong>{fdInv(settings.invoiceDate || todayStr())}
              </div>
            </div>
          </div>

          {/* Line items */}
          <table className="inv-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th style={{ textAlign: "right" }}>Rate</th>
                <th style={{ textAlign: "right" }}>Hours</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map(row => (
                <tr key={row.key}>
                  <td style={{ whiteSpace: "nowrap" }}>{fdInv(row.date)}</td>
                  <td>{row.description}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap", color: row.rate === null ? "#999" : undefined }}>{row.rate !== null ? `$ ${row.rate.toFixed(2)}` : "—"}</td>
                  <td style={{ textAlign: "right", color: row.hours === null ? "#999" : undefined }}>{row.hours !== null ? row.hours.toFixed(2) : "—"}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>$ {row.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Payment details + totals */}
          <div className="inv-bottom">
            <div className="inv-box">
              <div className="inv-box-title">Payment details</div>
              <div className="inv-box-content">
                {settings.bankName      && <div>{settings.bankName}</div>}
                {settings.bsb           && <div>BSB: {settings.bsb}</div>}
                {settings.accountNumber && <div>Account: {settings.accountNumber}</div>}
                {!settings.bankName && !settings.bsb && !settings.accountNumber && (
                  <span style={{ color: "#999", fontSize: 12 }}>Add details in Settings → Payment</span>
                )}
              </div>
            </div>
            <div className="inv-box">
              <div className="inv-totals-line"><span>Subtotal</span><span>$ {subtotal.toFixed(2)}</span></div>
              <div className="inv-totals-line"><span>Tax (0.00%)</span><span>$ 0.00</span></div>
              <div className="inv-totals-line total"><span>Total</span><span>$ {subtotal.toFixed(2)}</span></div>
            </div>
          </div>

          {/* Notes */}
          <div className="inv-notes-box">
            <div className="inv-box-title">Additional notes</div>
            <div className="inv-box-content">{settings.invoiceNotes || "-"}</div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

// ── Invoice History ────────────────────────────────────────────────────────────

function InvoiceHistory({ invoices, viewing, onView, onDelete, pdfNamePattern }: {
  invoices: SavedInvoice[];
  viewing: SavedInvoice | null;
  onView: (inv: SavedInvoice | null) => void;
  onDelete: (id: string) => void;
  pdfNamePattern: string;
}) {
  const [downloading, setDownloading] = useState(false);

  if (viewing) {
    return (
      <div>
        <div className="print-actions no-print">
          <button className="btn-secondary" onClick={() => onView(null)}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Back to list
          </button>
          <button className="btn-secondary" disabled={downloading} onClick={async () => {
            setDownloading(true);
            const filename = buildPdfFilename(
              pdfNamePattern,
              viewing.invoiceNum,
              viewing.companyName,
              viewing.issueDate,
            );
            await downloadPdf("saved-invoice-doc", filename);
            setDownloading(false);
          }}>
            <i className="ti ti-download" aria-hidden="true" />
            {downloading ? "Generating…" : "Download PDF"}
          </button>
        </div>
        <SavedInvoiceDoc inv={viewing} />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="empty-state">
        <i className="ti ti-history" aria-hidden="true" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} />
        <p>No past invoices</p>
        <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
          Mark an ABN invoice as sent to save it here
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="sr-only">Past invoices</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Issue date</th>
              <th>Company</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td className="mono" style={{ fontWeight: 500 }}>#{inv.invoiceNum}</td>
                <td className="mono" style={{ fontSize: 12 }}>{fdInv(inv.issueDate)}</td>
                <td>{inv.companyName || <span className="muted">—</span>}</td>
                <td className="mono" style={{ fontWeight: 500 }}>$ {inv.subtotal.toFixed(2)}</td>
                <td>
                  <span style={{ display: "flex", gap: 4 }}>
                    <button className="icon-btn-sm" onClick={() => onView(inv)} aria-label="View invoice">
                      <i className="ti ti-eye" aria-hidden="true" />
                    </button>
                    <button className="icon-btn-sm danger" onClick={() => onDelete(inv.id)} aria-label="Delete">
                      <i className="ti ti-trash" aria-hidden="true" />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SavedInvoiceDoc({ inv }: { inv: SavedInvoice }) {
  const s = { ...DEFAULT_SETTINGS, ...inv.data.settings } as Settings;
  const rows = inv.data.rows || [];
  const subtotal = inv.subtotal;

  return (
    <div id="saved-invoice-doc" className="invoice-doc">
      <div className="inv-header">
        <div className="inv-from">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{s.yourName || "Your Name"}</div>
          {s.abn         && <div>ABN: {s.abn}</div>}
          {s.yourAddress && <div>{s.yourAddress}</div>}
          {s.yourPhone   && <div>Phone: {s.yourPhone}</div>}
          {s.yourEmail   && <div>Email: {s.yourEmail}</div>}
        </div>
        <div className="inv-title-col">
          <h1 className="inv-title">TAX INVOICE #{inv.invoiceNum}</h1>
          <div style={{ marginTop: 14, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Invoice to: {s.companyName || "Company Name"}</div>
            {s.companyAbn   && <div>ABN: {s.companyAbn}</div>}
            {s.companyEmail && <div>Email: {s.companyEmail}</div>}
          </div>
          <div style={{ marginTop: 10 }}>
            <strong>Issue date: </strong>{fdInv(inv.issueDate)}
          </div>
        </div>
      </div>

      <table className="inv-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th style={{ textAlign: "right" }}>Rate</th>
            <th style={{ textAlign: "right" }}>Hours</th>
            <th style={{ textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key}>
              <td style={{ whiteSpace: "nowrap" }}>{fdInv(row.date)}</td>
              <td>{row.description}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap", color: row.rate === null ? "#999" : undefined }}>{row.rate !== null ? `$ ${row.rate.toFixed(2)}` : "—"}</td>
              <td style={{ textAlign: "right", color: row.hours === null ? "#999" : undefined }}>{row.hours !== null ? row.hours.toFixed(2) : "—"}</td>
              <td style={{ textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>$ {row.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-bottom">
        <div className="inv-box">
          <div className="inv-box-title">Payment details</div>
          <div className="inv-box-content">
            {s.bankName      && <div>{s.bankName}</div>}
            {s.bsb           && <div>BSB: {s.bsb}</div>}
            {s.accountNumber && <div>Account: {s.accountNumber}</div>}
            {!s.bankName && !s.bsb && !s.accountNumber && <span style={{ color: "#999", fontSize: 12 }}>—</span>}
          </div>
        </div>
        <div className="inv-box">
          <div className="inv-totals-line"><span>Subtotal</span><span>$ {subtotal.toFixed(2)}</span></div>
          <div className="inv-totals-line"><span>Tax (0.00%)</span><span>$ 0.00</span></div>
          <div className="inv-totals-line total"><span>Total</span><span>$ {subtotal.toFixed(2)}</span></div>
        </div>
      </div>

      <div className="inv-notes-box">
        <div className="inv-box-title">Additional notes</div>
        <div className="inv-box-content">{s.invoiceNotes || "-"}</div>
      </div>
    </div>
  );
}

// ── Settings Page ──────────────────────────────────────────────────────────────

function SettingsPage({ settings, onSave }: {
  settings: Settings; onSave: (s: Settings) => void;
}) {
  const [s, setS] = useState<Settings>({ ...DEFAULT_SETTINGS, ...settings });
  const [activeTab, setActiveTab] = useState<"personal" | "company" | "rules" | "payment">("personal");
  const f = (k: keyof Settings, v: string | number) => setS(prev => ({ ...prev, [k]: v }));

  useEffect(() => { setS({ ...DEFAULT_SETTINGS, ...settings }); }, [settings]);

  const STABS = [
    { id: "personal" as const, label: "Personal",   icon: "ti-user"        },
    { id: "company"  as const, label: "Company",    icon: "ti-building"    },
    { id: "rules"    as const, label: "Work Rules", icon: "ti-adjustments" },
    { id: "payment"  as const, label: "Payment",    icon: "ti-credit-card" },
  ];

  const ta = (id: string, key: keyof Settings, placeholder: string, rows = 3) => (
    <textarea
      id={id} rows={rows} placeholder={placeholder}
      value={s[key] as string} onChange={e => f(key, e.target.value)}
      style={{ resize: "vertical", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", padding: "7px 10px", fontSize: 13, fontFamily: "inherit" }}
    />
  );

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 className="sr-only">Settings</h2>

      <div className="tabbar no-print" style={{ marginBottom: 16, borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)" }}>
        {STABS.map(t => (
          <button key={t.id} className={`tab-btn ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
            <i className={`ti ${t.icon}`} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        {activeTab === "personal" && (
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="s-name">Your name</label>
              <input id="s-name" type="text" value={s.yourName} onChange={e => f("yourName", e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="s-abn">Your ABN</label>
              <input id="s-abn" type="text" placeholder="12 345 678 901" value={s.abn} onChange={e => f("abn", e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="s-addr">Your address</label>
              <input id="s-addr" type="text" placeholder="Street, Suburb - State Postcode" value={s.yourAddress} onChange={e => f("yourAddress", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-phone">Phone</label>
              <input id="s-phone" type="text" placeholder="04XX XXX XXX" value={s.yourPhone} onChange={e => f("yourPhone", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-email">Email</label>
              <input id="s-email" type="email" value={s.yourEmail} onChange={e => f("yourEmail", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-tfnrate">TFN hourly rate (AUD/hr)</label>
              <input id="s-tfnrate" type="number" min="0" step="0.01" placeholder="Same as entry rate" value={s.tfnRate} onChange={e => f("tfnRate", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-rate">Default ABN rate (AUD/hr)</label>
              <input id="s-rate" type="number" min="0" step="0.01" value={s.defaultRate} onChange={e => f("defaultRate", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-invnum">Next invoice #</label>
              <input id="s-invnum" type="number" min="1" value={s.invoiceNum} onChange={e => f("invoiceNum", parseInt(e.target.value) || 1)} />
            </div>
            <div className="field">
              <label htmlFor="s-invdate">Invoice issue date</label>
              <input id="s-invdate" type="date" value={s.invoiceDate || ""} onChange={e => f("invoiceDate", e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="s-pdfpat">PDF filename pattern</label>
              <input id="s-pdfpat" type="text" placeholder="Invoice-{num}-{company}-{date}" value={s.pdfNamePattern || ""} onChange={e => f("pdfNamePattern", e.target.value)} />
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 3 }}>
                Variables: {"{num}"} {"{company}"} {"{date}"} {"{year}"} {"{month}"} {"{day}"}
              </span>
            </div>
          </div>
        )}

        {activeTab === "company" && (
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="s-cname">Company name</label>
              <input id="s-cname" type="text" value={s.companyName} onChange={e => f("companyName", e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="s-cabn">Company ABN</label>
              <input id="s-cabn" type="text" placeholder="12 345 678 901" value={s.companyAbn} onChange={e => f("companyAbn", e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="s-cemail">Company email</label>
              <input id="s-cemail" type="email" value={s.companyEmail} onChange={e => f("companyEmail", e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="s-caddr">Company address</label>
              {ta("s-caddr", "companyAddress", "Street, City, State, Postcode")}
            </div>
          </div>
        )}

        {activeTab === "rules" && (
          <div className="form-grid">
            <div className="field">
              <label htmlFor="s-tfnlimit">TFN hour limit</label>
              <input id="s-tfnlimit" type="number" min="1" value={s.tfnLimit} onChange={e => f("tfnLimit", parseFloat(e.target.value) || 30)} />
            </div>
            <div className="field">
              <label htmlFor="s-ot">Overtime after (hrs/day)</label>
              <input id="s-ot" type="number" min="1" step="0.5" value={s.overtimeThreshold} onChange={e => f("overtimeThreshold", parseFloat(e.target.value) || 12)} />
            </div>
          </div>
        )}

        {activeTab === "payment" && (
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="s-bank">Bank name</label>
              <input id="s-bank" type="text" placeholder="Commonwealth Bank" value={s.bankName} onChange={e => f("bankName", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-bsb">BSB</label>
              <input id="s-bsb" type="text" placeholder="062-028" value={s.bsb} onChange={e => f("bsb", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-acc">Account number</label>
              <input id="s-acc" type="text" placeholder="1144-0435" value={s.accountNumber} onChange={e => f("accountNumber", e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="s-notes">Invoice notes</label>
              {ta("s-notes", "invoiceNotes", "Additional notes shown at the bottom of each invoice")}
            </div>
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button className="btn-primary" onClick={() => onSave(s)}>
            <i className="ti ti-check" aria-hidden="true" /> Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small reusables ────────────────────────────────────────────────────────────

function Metric({ label, value, sub, color, progress, bold }: {
  label: string; value: string; sub?: string;
  color?: "success" | "info" | "warning" | "danger";
  progress?: number; bold?: boolean;
}) {
  const colorVars: Record<string, string> = {
    success: "var(--color-text-success)",
    info:    "var(--color-text-info)",
    warning: "var(--color-text-warning)",
    danger:  "var(--color-text-danger)",
  };
  return (
    <div className="metric-card">
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: bold ? 20 : 18, fontWeight: 500, color: colorVars[color ?? ""] || "var(--color-text-primary)" }}>
        {value}
      </div>
      {sub && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>}
      {progress !== undefined && (
        <div style={{ height: 3, background: "var(--color-background-tertiary)", borderRadius: 99, marginTop: 8, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: progress >= 100 ? "var(--color-background-danger)" : "var(--color-background-success)",
            borderRadius: 99,
            transition: "width 0.6s",
          }} />
        </div>
      )}
    </div>
  );
}

function Bdg({ type, children }: { type: "tfn" | "abn" | "ot"; children: React.ReactNode }) {
  const s: Record<string, React.CSSProperties> = {
    tfn: { background: "var(--color-background-success)", color: "var(--color-text-success)" },
    abn: { background: "var(--color-background-info)",    color: "var(--color-text-info)"    },
    ot:  { background: "var(--color-background-warning)", color: "var(--color-text-warning)" },
  };
  return (
    <span style={{ ...s[type], fontSize: 11, padding: "2px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
