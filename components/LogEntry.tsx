import React from "react";
import type { FormState } from "@/types";
import { calcHours, MIN_HOURS } from "@/lib/calculations";
import { fh, fc } from "@/lib/formatters";

export const LogEntry = React.memo(function LogEntry({ form, setForm, editId, onSave, onCancel }: {
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
});
