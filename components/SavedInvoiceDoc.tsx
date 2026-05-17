import React from "react";
import type { SavedInvoice, Settings, InvLineRow } from "@/types";
import { fdInv } from "@/lib/formatters";
import { DEFAULT_SETTINGS } from "@/services/settings";

export function SavedInvoiceDoc({ inv, docId = "saved-invoice-doc" }: { inv: SavedInvoice; docId?: string }) {
  const s = { ...DEFAULT_SETTINGS, ...inv.data.settings } as Settings;
  const rows        = inv.data.rows || [];
  const subtotal    = inv.subtotal;
  const gst         = s.gstRegistered ? subtotal * 0.1 : 0;
  const invTotal    = subtotal + gst;

  return (
    <div id={docId} className="invoice-doc">
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
          {rows.map((row: InvLineRow) => (
            <tr key={row.key}>
              <td style={{ whiteSpace: "nowrap" }}>{fdInv(row.date)}</td>
              <td>
                {row.description}
                {row.client && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{row.client}</div>}
              </td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap", color: row.rate === null ? "#999" : undefined }}>
                {row.rate !== null ? `$ ${row.rate.toFixed(2)}` : "—"}
              </td>
              <td style={{ textAlign: "right", color: row.hours === null ? "#999" : undefined }}>
                {row.hours !== null ? row.hours.toFixed(2) : "—"}
              </td>
              <td style={{ textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                $ {row.amount.toFixed(2)}
              </td>
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
          <div className="inv-totals-line">
            <span>{s.gstRegistered ? "GST (10%)" : "GST (N/A)"}</span>
            <span>$ {gst.toFixed(2)}</span>
          </div>
          <div className="inv-totals-line total"><span>Total</span><span>$ {invTotal.toFixed(2)}</span></div>
        </div>
      </div>

      <div className="inv-notes-box">
        <div className="inv-box-title">Additional notes</div>
        <div className="inv-box-content">{s.invoiceNotes || "-"}</div>
      </div>
    </div>
  );
}
