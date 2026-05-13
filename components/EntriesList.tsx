import React from "react";
import type { ManagedUser, ProcessedEntry } from "@/types";
import { fh, fc, fd } from "@/lib/formatters";
import { Bdg } from "./ui";

export function EntriesList({ processed, onEdit, onDelete, isAdmin, users, userFilter, onUserFilterChange }: {
  processed: ProcessedEntry[];
  onEdit: (e: ProcessedEntry) => void;
  onDelete: (id: string) => void;
  isAdmin?: boolean;
  users?: ManagedUser[];
  userFilter?: string;
  onUserFilterChange?: (v: string) => void;
}) {
  const visible = isAdmin && userFilter && userFilter !== "all"
    ? processed.filter(e => e.ownerId === userFilter)
    : processed;

  return (
    <div>
      <h2 className="sr-only">All entries for current period</h2>

      {isAdmin && users && users.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="user-filter" style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Filter by user:</label>
          <select
            id="user-filter"
            value={userFilter ?? "all"}
            onChange={e => onUserFilterChange?.(e.target.value)}
            style={{ fontSize: 13, padding: "4px 8px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)" }}
          >
            <option value="all">All users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{visible.length} entries</span>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty-state">
          <i className="ti ti-list" aria-hidden="true" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} />
          <p>No entries{isAdmin ? " for this selection" : " in this period"}</p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                {isAdmin && <th>User</th>}
                <th>Job</th><th>Time</th>
                <th>Hours</th><th>Rate</th>
                {!isAdmin && <th>Split</th>}
                <th>Earnings</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(e => (
                <tr key={e.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{fd(e.date)}</td>
                  {isAdmin && (
                    <td style={{ fontSize: 12 }}>
                      {users?.find(u => u.id === e.ownerId)?.name ?? "—"}
                    </td>
                  )}
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
                  {!isAdmin && (
                    <td style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
                      {e.tfnPortion > 0 && <Bdg type="tfn">TFN {fh(e.tfnPortion)}</Bdg>}
                      {e.abnPortion > 0 && <Bdg type="abn">ABN {fh(e.abnPortion)}</Bdg>}
                      {e.overtime    > 0 && <Bdg type="ot">OT {fh(e.overtime)}</Bdg>}
                    </td>
                  )}
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
