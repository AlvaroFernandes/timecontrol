import React, { useState } from "react";
import type { SavedInvoice, Settings } from "@/types";
import { fdInv, buildPdfFilename, downloadPdf } from "@/lib/formatters";
import { DEFAULT_SETTINGS } from "@/services/settings";
import { SavedInvoiceDoc } from "./SavedInvoiceDoc";

export const InvoiceHistory = React.memo(function InvoiceHistory({ invoices, viewing, onView, onDelete, onShare, pdfNamePattern }: {
  invoices: SavedInvoice[];
  viewing: SavedInvoice | null;
  onView: (inv: SavedInvoice | null) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
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
          <button className="btn-secondary" onClick={() => onShare(viewing.id)}>
            <i className="ti ti-link" aria-hidden="true" /> Copy share link
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
                <td className="mono" style={{ fontWeight: 500 }}>
                  $ {(inv.subtotal * (({ ...DEFAULT_SETTINGS, ...inv.data.settings } as Settings).gstRegistered ? 1.1 : 1)).toFixed(2)}
                </td>
                <td>
                  <span style={{ display: "flex", gap: 4 }}>
                    <button className="icon-btn-sm" onClick={() => onView(inv)} aria-label="View invoice">
                      <i className="ti ti-eye" aria-hidden="true" />
                    </button>
                    <button className="icon-btn-sm" onClick={() => onShare(inv.id)} aria-label="Copy share link"
                      title={inv.shareToken ? "Copy share link" : "Generate & copy share link"}>
                      <i className={`ti ${inv.shareToken ? "ti-link" : "ti-share"}`} aria-hidden="true" />
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
