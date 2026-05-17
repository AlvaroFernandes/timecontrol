"use client";

import React, { useState } from "react";
import type { SavedInvoice } from "@/types";
import { buildPdfFilename, downloadPdf } from "@/lib/formatters";
import { SavedInvoiceDoc } from "./SavedInvoiceDoc";

export function PublicInvoiceView({ invoice }: { invoice: SavedInvoice }) {
  const [downloading, setDownloading] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", padding: "24px 16px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 16, flexWrap: "wrap", gap: 10,
        }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            Shared invoice · read-only
          </span>
          <button
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              await downloadPdf(
                "shared-invoice-doc",
                buildPdfFilename("", invoice.invoiceNum, invoice.companyName, invoice.issueDate),
              );
              setDownloading(false);
            }}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#111827", color: "#fff",
              border: "none", borderRadius: 8,
              padding: "8px 16px", fontSize: 13, fontWeight: 500,
              cursor: downloading ? "not-allowed" : "pointer",
              opacity: downloading ? 0.7 : 1,
            }}
          >
            <i className="ti ti-download" aria-hidden="true" />
            {downloading ? "Generating…" : "Download PDF"}
          </button>
        </div>

        <SavedInvoiceDoc inv={invoice} docId="shared-invoice-doc" />
      </div>
    </div>
  );
}
