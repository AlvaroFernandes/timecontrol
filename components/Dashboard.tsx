import React from "react";
import type { ManagedUser, ProcessedEntry, Settings, Totals } from "@/types";
import { fh, fc, fd } from "@/lib/formatters";
import { Metric, Bdg } from "./ui";

export const Dashboard = React.memo(function Dashboard({ totals, tfnPct, settings, processed, isAdmin, users }: {
  totals: Totals; tfnPct: number; settings: Settings; processed: ProcessedEntry[];
  isAdmin?: boolean; users?: ManagedUser[];
}) {
  const byDate: Record<string, ProcessedEntry[]> = {};
  processed.forEach(e => { if (!byDate[e.date]) byDate[e.date] = []; byDate[e.date].push(e); });
  const dates = Object.keys(byDate).sort().reverse().slice(0, 10);

  if (isAdmin && users) {
    const userStats = users.map(u => {
      const ue = processed.filter(e => e.ownerId === u.id);
      return {
        ...u,
        entries: ue.length,
        hours:   ue.reduce((a, e) => a + e.total, 0),
        earnings: ue.reduce((a, e) => a + e.totalEarnings, 0),
      };
    }).sort((a, b) => b.hours - a.hours);

    return (
      <div>
        <h2 className="sr-only">Admin dashboard</h2>
        <div className="metric-grid">
          <Metric label="Total hours"    value={fh(totals.hours)}      sub={`${processed.length} entries`} />
          <Metric label="Total earnings" value={fc(totals.total)}       bold />
          <Metric label="Users"          value={String(users.length)}  sub="managed" />
        </div>

        {userStats.length > 0 && (
          <div className="card mt-4" style={{ overflowX: "auto" }}>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>Users summary</p>
            <table className="data-table">
              <thead>
                <tr><th>User</th><th>Entries</th><th>Hours</th><th>Earnings</th></tr>
              </thead>
              <tbody>
                {userStats.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{u.email}</div>
                    </td>
                    <td>{u.entries}</td>
                    <td className="mono">{fh(u.hours)}</td>
                    <td className="mono">{fc(u.earnings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {dates.length > 0 && (
          <div className="card mt-4" style={{ overflowX: "auto" }}>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>Recent days</p>
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>User</th><th>Jobs</th><th>Hours</th><th>Earnings</th></tr>
              </thead>
              <tbody>
                {dates.map(date => {
                  const de = byDate[date];
                  return de.map((e, i) => (
                    <tr key={e.id}>
                      {i === 0 && <td className="mono" style={{ fontSize: 12 }} rowSpan={de.length}>{fd(date)}</td>}
                      <td style={{ fontSize: 12 }}>{users.find(u => u.id === e.ownerId)?.name ?? "—"}</td>
                      <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{e.jobDescription}</td>
                      <td className="mono">{fh(e.total)}</td>
                      <td className="mono">{fc(e.totalEarnings)}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className="sr-only">Dashboard overview</h2>

      <div className="metric-grid">
        <Metric label="Total hours"  value={fh(totals.hours)}    sub={`${processed.length} entries`}    />
        <Metric label="TFN hours"    value={fh(totals.tfnHours)} sub={`of ${settings.tfnLimit}h limit`} color="success" progress={tfnPct} />
        <Metric label="ABN hours"    value={fh(totals.abnHours)} sub="invoiceable excess"                color="info"    />
        <Metric label="Overtime"     value={fh(totals.otHours)}  sub="×1.5 rate applied"               color="warning" />
      </div>
      <div className="metric-grid mt-3">
        <Metric label="TFN earnings"   value={fc(totals.tfnEarnings)} color="success" />
        <Metric label="ABN earnings"   value={fc(totals.abnEarnings)} color="info" />
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
});
