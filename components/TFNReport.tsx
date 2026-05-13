import React from "react";
import type { ProcessedEntry, Totals, Settings } from "@/types";
import { fh, fc, fd } from "@/lib/formatters";

export function TFNReport({ processed, totals, settings, periodStart, periodEnd }: {
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
