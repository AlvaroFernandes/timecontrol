import React, { useState } from "react";
import type { SavedInvoice, Settings, InvLineRow } from "@/types";
import { fdInv, buildPdfFilename, downloadPdf } from "@/lib/formatters";
import { DEFAULT_SETTINGS } from "@/services/settings";

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
          {rows.map((row: InvLineRow) => (
            <tr key={row.key}>
              <td style={{ whiteSpace: "nowrap" }}>{fdInv(row.date)}</td>
              <td>
                {row.description}
                {row.client && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{row.client}</div>}
              </td>
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

export const InvoiceHistory = React.memo(function InvoiceHistory({ invoices, viewing, onView, onDelete, pdfNamePattern }: {
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
});
