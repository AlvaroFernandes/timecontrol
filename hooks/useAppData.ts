"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type {
  Entry, ManagedUser, ProcessedEntry, Settings, Totals,
  FormState, Toast, InvLineRow, SavedInvoice,
} from "@/types";
import { calcHours, processEntries } from "@/lib/calculations";
import { todayStr, genId } from "@/lib/formatters";
import { getEntries, getAdminEntries, upsertEntry, deleteEntry, archiveEntries } from "@/services/entries";
import { DEFAULT_SETTINGS, getSettings, getWorkerSettings, saveSettings as saveSettingsSvc, saveWorkerSettings as saveWorkerSettingsSvc } from "@/services/settings";
import { ensureProfile, getProfile, getManagedUsers, getManagedAdmins } from "@/services/profiles";
import { getInvoices, saveInvoice, deleteInvoice } from "@/services/invoices";

export function useAppData() {
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;
  const router      = useRouter();

  const [tab,             setTab]             = useState("dashboard");
  const [entries,         setEntries]         = useState<Entry[]>([]);
  const [settings,        setSettings]        = useState<Settings>(DEFAULT_SETTINGS);
  const [periodStart,     setPeriodStart]     = useState("");
  const [periodEnd,       setPeriodEnd]       = useState("");
  const [toast,           setToast]           = useState<Toast | null>(null);
  const [editId,          setEditId]          = useState<string | null>(null);
  const [form,            setForm]            = useState<FormState>({
    date: todayStr(), jobDescription: "", startTime: "", endTime: "", hourlyRate: "", breakMins: "",
  });
  const [theme,           setTheme]           = useState<"light" | "dark">("light");
  const [userId,          setUserId]          = useState<string | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [invoiceHistory,  setInvoiceHistory]  = useState<SavedInvoice[]>([]);
  const [viewingInvoice,  setViewingInvoice]  = useState<SavedInvoice | null>(null);
  const [userRole,        setUserRole]        = useState<"user" | "admin">("user");
  const [managedUsers,    setManagedUsers]    = useState<ManagedUser[]>([]);
  const [managedAdmins,   setManagedAdmins]   = useState<ManagedUser[]>([]);
  const [adminEditEntry,  setAdminEditEntry]  = useState<Entry | null>(null);
  const [adminUserFilter, setAdminUserFilter] = useState<string>("all");
  const [workerSettings,  setWorkerSettings]  = useState<Record<string, Settings>>({});

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

      await ensureProfile(supabase, user.id, user.email);

      const { role } = await getProfile(supabase, user.id);
      setUserRole(role);

      if (role === "admin") {
        const users = await getManagedUsers(supabase, user.id);
        setManagedUsers(users);

        const workerIds = users.map(u => u.id);
        const [fetchedEntries, settingsRow, fetchedWorkerSettings, admins] = await Promise.all([
          getAdminEntries(supabase, workerIds),
          getSettings(supabase, user.id),
          getWorkerSettings(supabase, workerIds),
          getManagedAdmins(supabase, user.id),
        ]);
        setEntries(fetchedEntries);
        setWorkerSettings(fetchedWorkerSettings);
        setManagedAdmins(admins);
        if (settingsRow) {
          setSettings(settingsRow.settings);
          if (settingsRow.periodStart) setPeriodStart(settingsRow.periodStart);
          if (settingsRow.periodEnd)   setPeriodEnd(settingsRow.periodEnd);
        }
      } else {
        const [fetchedEntries, settingsRow, invoices] = await Promise.all([
          getEntries(supabase, user.id),
          getSettings(supabase, user.id),
          getInvoices(supabase, user.id),
        ]);
        setEntries(fetchedEntries);
        if (settingsRow) {
          setSettings(settingsRow.settings);
          if (settingsRow.periodStart) setPeriodStart(settingsRow.periodStart);
          if (settingsRow.periodEnd)   setPeriodEnd(settingsRow.periodEnd);
        }
        setInvoiceHistory(invoices);
      }

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

  const saveEntry = async (entry: Entry, uid: string): Promise<boolean> => {
    return upsertEntry(supabase, entry, uid);
  };

  const removeEntry = async (id: string): Promise<boolean> => {
    return deleteEntry(supabase, id);
  };

  const saveSettings = async (s: Settings, ps: string, pe: string, uid: string) => {
    const ok = await saveSettingsSvc(supabase, uid, s, ps, pe);
    if (!ok) showToast("Could not save settings", "err");
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

  const handleSave = async () => {
    const { date, jobDescription, startTime, endTime, hourlyRate } = form;
    if (!date || !jobDescription.trim() || !startTime || !endTime || !hourlyRate) {
      showToast("All fields are required", "err"); return;
    }
    const hourlyRateNum = parseFloat(hourlyRate);
    if (isNaN(hourlyRateNum) || hourlyRateNum < 0) {
      showToast("Hourly rate must be a valid positive number", "err"); return;
    }
    const breakMinsNum = Math.max(0, parseInt(form.breakMins || "0") || 0);
    if (calcHours(startTime, endTime) <= 0) {
      showToast("End time must be after start time", "err"); return;
    }
    const entry: Entry = {
      ...form,
      hourlyRate: hourlyRateNum,
      breakMins:  breakMinsNum,
      id: editId || genId(),
    };
    if (userId) {
      const ok = await saveEntry(entry, userId);
      if (!ok) { showToast("Could not save entry", "err"); return; }
    }
    const newEntries = editId
      ? entries.map(e => e.id === editId ? entry : e)
      : [...entries, entry];
    setEntries(newEntries);
    showToast(editId ? "Entry updated" : "Entry added");
    setEditId(null);
    setForm({ date: form.date, jobDescription: "", startTime: "", endTime: "", hourlyRate: settings.defaultRate || "", breakMins: "" });
  };

  const handleEdit = (entry: ProcessedEntry) => {
    if (userRole === "admin") {
      setAdminEditEntry(entry);
    } else {
      setEditId(entry.id);
      setForm({
        date: entry.date, jobDescription: entry.jobDescription,
        startTime: entry.startTime, endTime: entry.endTime,
        hourlyRate: String(entry.hourlyRate),
        breakMins: entry.breakMins ? String(entry.breakMins) : "",
      });
      setTab("log");
    }
  };

  const handleAdminSave = async (updated: Entry) => {
    if (!userId) return;
    const ok = await saveEntry(updated, updated.ownerId ?? userId);
    if (!ok) { showToast("Could not save entry", "err"); return; }
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
    setAdminEditEntry(null);
    showToast("Entry updated");
  };

  const handleDelete = async (id: string) => {
    const ok = await removeEntry(id);
    if (!ok) { showToast("Could not delete entry", "err"); return; }
    setEntries(prev => prev.filter(e => e.id !== id));
    showToast("Entry deleted");
  };

  const handleSettingsSave = (s: Settings) => {
    setSettings(s);
    if (userId) saveSettings(s, periodStart, periodEnd, userId);
    showToast("Settings saved");
  };

  const handleSaveWorkerRules = async (
    rules: { userId: string; tfnLimit: number; overtimeThreshold: number }[],
  ) => {
    const results = await Promise.all(
      rules.map(({ userId: wid, tfnLimit, overtimeThreshold }) => {
        const existing = workerSettings[wid] ?? DEFAULT_SETTINGS;
        const updated  = { ...existing, tfnLimit, overtimeThreshold };
        setWorkerSettings(prev => ({ ...prev, [wid]: updated }));
        return saveWorkerSettingsSvc(supabase, wid, updated);
      })
    );
    if (results.some(ok => !ok)) showToast("Could not save some worker rules", "err");
    else showToast("Worker rules saved");
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  // Memoised so processEntries (sort + multi-pass accumulation) only re-runs
  // when entries or the relevant settings actually change, not on every form
  // keystroke or editId update.

  const { allPeriodEntries, processed, weeklyData, totals, tfnPct } = useMemo(() => {
    const allPeriodEntries = entries.filter(e =>
      (!periodStart || e.date >= periodStart) &&
      (!periodEnd   || e.date <= periodEnd)
    );
    const periodEntries = allPeriodEntries.filter(e => !e.archived);

    let processed: ReturnType<typeof processEntries>;
    let allProcessed: ReturnType<typeof processEntries>;

    if (userRole === "admin") {
      // Process each worker's entries independently so their own tfnLimit,
      // tfnRate, and overtimeThreshold are respected rather than the admin's.
      const workerIds = [...new Set(allPeriodEntries.map(e => e.ownerId).filter(Boolean))] as string[];
      const procParts: ReturnType<typeof processEntries> = [];
      const allProcParts: ReturnType<typeof processEntries> = [];
      for (const uid of workerIds) {
        const ws  = workerSettings[uid] ?? DEFAULT_SETTINGS;
        const tfnRateParsed = parseFloat(ws.tfnRate || "") || undefined;
        const ot  = ws.overtimeThreshold || 12;
        const lim = ws.tfnLimit || 30;
        procParts.push(   ...processEntries(periodEntries.filter(e => e.ownerId === uid),    lim, tfnRateParsed, ot));
        allProcParts.push(...processEntries(allPeriodEntries.filter(e => e.ownerId === uid), lim, tfnRateParsed, ot));
      }
      processed   = procParts;
      allProcessed = allProcParts;
    } else {
      const tfnRateParsed = parseFloat(settings.tfnRate || "") || undefined;
      processed    = processEntries(periodEntries,    settings.tfnLimit, tfnRateParsed, settings.overtimeThreshold || 12);
      allProcessed = processEntries(allPeriodEntries, settings.tfnLimit, tfnRateParsed, settings.overtimeThreshold || 12);
    }

    // Weekly report: all entries visible, but active entries use current-period TFN/ABN budget
    const processedById = new Map(processed.map(e => [e.id, e]));
    const weeklyData    = allProcessed.map(e => processedById.get(e.id) ?? e);
    const totals        = processed.reduce<Totals>((a, e) => ({
      hours:       a.hours       + e.total,
      tfnHours:    a.tfnHours    + e.tfnPortion,
      abnHours:    a.abnHours    + e.abnPortion,
      otHours:     a.otHours     + e.overtime,
      tfnEarnings: a.tfnEarnings + e.tfnEarnings,
      abnEarnings: a.abnEarnings + e.abnEarnings,
      total:       a.total       + e.totalEarnings,
    }), { hours: 0, tfnHours: 0, abnHours: 0, otHours: 0, tfnEarnings: 0, abnEarnings: 0, total: 0 });
    const tfnPct = Math.min(100, (totals.tfnHours / (settings.tfnLimit || 30)) * 100);
    return { allPeriodEntries, processed, weeklyData, totals, tfnPct };
  }, [entries, periodStart, periodEnd, settings.tfnLimit, settings.tfnRate, settings.overtimeThreshold, userRole, workerSettings]);

  const TABS = useMemo(() => userRole === "admin"
    ? [
        { id: "dashboard", label: "Dashboard",    icon: "ti-layout-dashboard" },
        { id: "entries",   label: "Entries",       icon: "ti-list"             },
        { id: "weekly",    label: "Weekly Report", icon: "ti-calendar-week"    },
      ]
    : [
        { id: "dashboard", label: "Dashboard",    icon: "ti-layout-dashboard" },
        { id: "log",       label: "Log Entry",    icon: "ti-clock-plus"       },
        { id: "entries",   label: "Entries",      icon: "ti-list"             },
        { id: "weekly",    label: "Weekly Report", icon: "ti-calendar-week"   },
        { id: "tfn",       label: "TFN Report",   icon: "ti-report"           },
        { id: "abn",       label: "ABN Invoice",  icon: "ti-receipt"          },
        { id: "history",   label: "Invoices",     icon: "ti-history"          },
      ],
  [userRole]);

  const handleInvite = async (email: string, role: "user" | "admin") => {
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? "Could not send invitation", "err"); return; }
    showToast(`Invitation sent to ${email}`);
    if (role === "admin") {
      const admins = await getManagedAdmins(supabase, userId!);
      setManagedAdmins(admins);
    } else {
      const users = await getManagedUsers(supabase, userId!);
      setManagedUsers(users);
    }
  };

  // ── Invoice advance ────────────────────────────────────────────────────────

  const advanceInvoice = async () => {
    const extraItems = settings.invoiceItems || [];
    const abnEntries = processed.filter(e => e.abnPortion > 0);
    const rows: InvLineRow[] = [];
    for (const e of abnEntries) {
      if (e.rABN > 0)  rows.push({ key: e.id + "-r",  date: e.date, startTime: e.startTime, description: e.jobDescription,                      rate: e.hourlyRate,       hours: e.rABN,  amount: e.rABN  * e.hourlyRate       });
      if (e.otABN > 0) rows.push({ key: e.id + "-ot", date: e.date, startTime: e.startTime, description: `${e.jobDescription} (overtime ×1.5)`,  rate: e.hourlyRate * 1.5, hours: e.otABN, amount: e.otABN * e.hourlyRate * 1.5 });
    }
    for (const item of extraItems) rows.push({ key: item.id, date: item.date, description: item.description, rate: null, hours: null, amount: item.amount });
    rows.sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });
    const subtotal  = totals.abnEarnings + extraItems.reduce((a, i) => a + i.amount, 0);
    const issueDate = settings.invoiceDate || todayStr();

    const toArchiveIds = allPeriodEntries.filter(e => !e.archived).map(e => e.id);
    if (toArchiveIds.length > 0 && userId) {
      const ok = await archiveEntries(supabase, toArchiveIds);
      if (!ok) { showToast("Could not archive entries", "err"); return; }
      setEntries(prev => prev.map(e => toArchiveIds.includes(e.id) ? { ...e, archived: true } : e));
    }

    if (userId) {
      const saved = await saveInvoice(supabase, {
        id: genId(), userId,
        invoiceNum:  settings.invoiceNum || 1,
        issueDate,
        companyName: settings.companyName || "",
        subtotal,
        settings: { ...settings, invoiceItems: [] },
        rows, periodStart, periodEnd,
      });
      if (!saved) { showToast("Could not save invoice history", "err"); return; }
      setInvoiceHistory(prev => [saved, ...prev]);
    }

    const s = { ...settings, invoiceNum: (settings.invoiceNum || 1) + 1, invoiceDate: todayStr(), invoiceItems: [] };
    setSettings(s);
    if (userId) saveSettings(s, periodStart, periodEnd, userId);
    showToast(`Invoice #${settings.invoiceNum} saved`);
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setForm({ date: todayStr(), jobDescription: "", startTime: "", endTime: "", hourlyRate: "", breakMins: "" });
  };

  const handleDeleteInvoice = async (id: string) => {
    const ok = await deleteInvoice(supabase, id);
    if (!ok) { showToast("Could not delete invoice", "err"); return; }
    setInvoiceHistory(prev => prev.filter(i => i.id !== id));
    if (viewingInvoice?.id === id) setViewingInvoice(null);
    showToast("Invoice deleted");
  };

  return {
    // state
    tab, setTab,
    settings, setSettings,
    periodStart, periodEnd,
    form, setForm,
    editId,
    toast,
    theme,
    loading,
    invoiceHistory,
    viewingInvoice, setViewingInvoice,
    userRole,
    managedUsers,
    adminEditEntry, setAdminEditEntry,
    adminUserFilter, setAdminUserFilter,
    // derived
    processed, weeklyData, totals, tfnPct, TABS,
    // handlers
    toggleTheme, signOut, updatePeriod,
    handleSave, handleEdit, handleAdminSave,
    handleDelete, handleSettingsSave, handleSaveWorkerRules, handleInvite,
    workerSettings, managedAdmins,
    advanceInvoice, handleDeleteInvoice, handleCancelEdit,
    // inline settings update for ABN invoice items
    updateInvoiceItems: (items: Settings["invoiceItems"]) => {
      const s = { ...settings, invoiceItems: items };
      setSettings(s);
      if (userId) saveSettings(s, periodStart, periodEnd, userId);
    },
  };
}
