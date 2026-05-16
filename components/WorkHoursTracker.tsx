"use client";

import React from "react";
import { useAppData } from "@/hooks/useAppData";
import { Dashboard }      from "./Dashboard";
import { LogEntry }       from "./LogEntry";
import { EntriesList }    from "./EntriesList";
import { WeeklyReport }   from "./WeeklyReport";
import { TFNReport }      from "./TFNReport";
import { ABNInvoice }     from "./ABNInvoice";
import { InvoiceHistory } from "./InvoiceHistory";
import { AdminEditModal } from "./AdminEditModal";
import { SettingsPage }   from "./SettingsPage";

export default function WorkHoursTracker() {
  const {
    tab, setTab,
    settings,
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
    processed, weeklyData, totals, tfnPct, TABS,
    toggleTheme, signOut, updatePeriod,
    handleSave, handleEdit, handleAdminSave,
    handleDelete, handleSettingsSave, handleSaveWorkerRules, handleInvite,
    workerSettings, managedAdmins,
    advanceInvoice, handleDeleteInvoice, handleCancelEdit,
    updateInvoiceItems,
  } = useAppData();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)" }}>
        <span style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header no-print">
        <div className="logo">
          <i className="ti ti-briefcase" aria-hidden="true" style={{ fontSize: 18, color: "var(--color-text-warning)" }} />
          SplitShift
          {userRole === "admin" && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, background: "var(--color-text-warning)", color: "#fff", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.04em" }}>
              ADMIN
            </span>
          )}
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

      <nav className="tabbar no-print" aria-label="Main navigation">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <i className={`ti ${t.icon}`} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main-content">
        {tab === "dashboard" && (
          <Dashboard totals={totals} tfnPct={tfnPct} settings={settings} processed={processed}
            isAdmin={userRole === "admin"} users={managedUsers} />
        )}
        {tab === "log" && userRole !== "admin" && (
          <LogEntry form={form} setForm={setForm} editId={editId}
            onSave={handleSave} onCancel={handleCancelEdit} />
        )}
        {tab === "entries" && (
          <EntriesList processed={processed} onEdit={handleEdit} onDelete={handleDelete}
            isAdmin={userRole === "admin"} users={managedUsers}
            userFilter={adminUserFilter} onUserFilterChange={setAdminUserFilter} />
        )}
        {tab === "weekly" && (
          <WeeklyReport processed={weeklyData} settings={settings} isAdmin={userRole === "admin"} users={managedUsers} />
        )}
        {tab === "tfn" && userRole !== "admin" && (
          <TFNReport processed={processed} totals={totals} settings={settings}
            periodStart={periodStart} periodEnd={periodEnd} />
        )}
        {tab === "abn" && userRole !== "admin" && (
          <ABNInvoice processed={processed} totals={totals} settings={settings}
            periodStart={periodStart} periodEnd={periodEnd}
            onAdvance={advanceInvoice} onItemsChange={updateInvoiceItems} />
        )}
        {tab === "history" && userRole !== "admin" && (
          <InvoiceHistory invoices={invoiceHistory} viewing={viewingInvoice}
            onView={setViewingInvoice} pdfNamePattern={settings.pdfNamePattern}
            onDelete={handleDeleteInvoice} />
        )}
        {tab === "settings" && (
          <SettingsPage
            settings={settings} onSave={handleSettingsSave}
            isAdmin={userRole === "admin"}
            managedUsers={managedUsers}
            managedAdmins={managedAdmins}
            workerSettings={workerSettings}
            onSaveWorkerRules={handleSaveWorkerRules}
            onInvite={handleInvite}
          />
        )}
      </main>

      {adminEditEntry && (
        <AdminEditModal
          entry={adminEditEntry}
          userName={managedUsers.find(u => u.id === adminEditEntry.ownerId)?.name ?? "Unknown"}
          onSave={handleAdminSave}
          onClose={() => setAdminEditEntry(null)}
        />
      )}

      {toast && (
        <div className={`toast ${toast.type}`} role="alert">
          <i className={`ti ${toast.type === "err" ? "ti-alert-circle" : "ti-circle-check"}`} aria-hidden="true" />
          {toast.msg}
        </div>
      )}
    </div>
  );
}
