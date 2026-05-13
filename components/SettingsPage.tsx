import React, { useState, useEffect } from "react";
import type { Settings } from "@/types";
import { DEFAULT_SETTINGS } from "@/services/settings";

export function SettingsPage({ settings, onSave }: {
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
