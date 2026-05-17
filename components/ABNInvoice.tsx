import React, { useState } from "react";
import type { ProcessedEntry, Totals, Settings, InvoiceItem, InvLineRow } from "@/types";
import { fh, fdInv, todayStr, genId, buildPdfFilename, downloadPdf } from "@/lib/formatters";
import { weekStart } from "@/lib/calculations";

export const ABNInvoice = React.memo(function ABNInvoice({ processed, totals, settings, onAdvance, onItemsChange }: {
  processed: ProcessedEntry[]; totals: Totals; settings: Settings;
  periodStart: string; periodEnd: string; onAdvance: () => void;
  onItemsChange: (items: InvoiceItem[]) => void;
}) {
  const [newDate,     setNewDate]     = useState(todayStr());
  const [newDesc,     setNewDesc]     = useState("");
  const [newAmt,      setNewAmt]      = useState("");
  const [downloading, setDownloading] = useState(false);
  const [addError,    setAddError]    = useState<string | null>(null);

  const abnEntries = processed.filter(e => e.abnPortion > 0);
  const extraItems = settings.invoiceItems || [];

  // Count distinct weeks with ABN entries to know how many invoices will be created
  const weekKeys   = [...new Set(abnEntries.map(e => weekStart(e.date)))].sort();
  const weekCount  = weekKeys.length;
  const firstNum   = settings.invoiceNum || 1;
  const afterNum   = firstNum + weekCount; // invoice number after all are saved

  const allRows: InvLineRow[] = [];
  for (const e of abnEntries) {
    if (e.rABN > 0)  allRows.push({ key: e.id + "-r",  date: e.date, startTime: e.startTime, description: e.jobDescription,                     client: e.client, rate: e.hourlyRate,       hours: e.rABN,  amount: e.rABN  * e.hourlyRate       });
    if (e.otABN > 0) allRows.push({ key: e.id + "-ot", date: e.date, startTime: e.startTime, description: `${e.jobDescription} (overtime ×1.5)`, client: e.client, rate: e.hourlyRate * 1.5, hours: e.otABN, amount: e.otABN * e.hourlyRate * 1.5 });
  }
  for (const item of extraItems) {
    allRows.push({ key: item.id, date: item.date, description: item.description, rate: null, hours: null, amount: item.amount });
  }
  allRows.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : (a.startTime ?? "").localeCompare(b.startTime ?? "");
  });

  const addItem = () => {
    if (!newDate)        { setAddError("Date is required"); return; }
    if (!newDesc.trim()) { setAddError("Description is required"); return; }
    const amt = parseFloat(newAmt);
    if (isNaN(amt) || amt <= 0) { setAddError("Amount must be a positive number"); return; }
    setAddError(null);
    onItemsChange([...extraItems, { id: genId(), date: newDate, description: newDesc.trim(), amount: amt }]);
    setNewDesc(""); setNewAmt("");
  };

  const subtotal     = totals.abnEarnings + extraItems.reduce((a, i) => a + i.amount, 0);
  const gst          = settings.gstRegistered ? subtotal * 0.1 : 0;
  const invoiceTotal = subtotal + gst;

  return (
    <div>
      <h2 className="sr-only">ABN tax invoice</h2>

      <div className="print-actions no-print">
        <button className="btn-secondary" disabled={downloading} onClick={async () => {
          setDownloading(true);
          const filename = buildPdfFilename(
            settings.pdfNamePattern,
            settings.invoiceNum,
            settings.companyName,
            settings.invoiceDate || todayStr(),
          );
          await downloadPdf("abn-invoice-doc", filename);
          setDownloading(false);
        }}>
          <i className="ti ti-download" aria-hidden="true" />
          {downloading ? "Generating…" : "Download PDF"}
        </button>
        {abnEntries.length > 0 && (
          <button className="btn-primary" onClick={onAdvance}>
            <i className="ti ti-check" aria-hidden="true" />
            {weekCount === 1
              ? `Mark Sent — advance to #${afterNum}`
              : `Save ${weekCount} Invoices (#${firstNum}–#${afterNum - 1}) → next #${afterNum}`}
          </button>
        )}
      </div>

      {abnEntries.length === 0 ? (
        <div className="empty-state">
          <i className="ti ti-circle-check" aria-hidden="true" style={{ fontSize: 36, color: "var(--color-text-success)" }} />
          <p>No ABN hours to invoice</p>
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            All hours are within the {settings.tfnLimit}h TFN limit
          </p>
        </div>
      ) : (
        <>
          <div className="card no-print" style={{ maxWidth: 820, margin: "0 auto 16px" }}>
            <p style={{ fontWeight: 500, marginBottom: 12, fontSize: 13 }}>Extra invoice items</p>
            {extraItems.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {extraItems.map(item => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    <span style={{ fontSize: 13 }}><span style={{ color: "var(--color-text-secondary)", marginRight: 10 }}>{fdInv(item.date)}</span>{item.description}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>$ {item.amount.toFixed(2)}</span>
                      <button className="icon-btn-sm danger" onClick={() => onItemsChange(extraItems.filter(i => i.id !== item.id))} aria-label="Remove">
                        <i className="ti ti-trash" aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ width: 150 }}>
                <label htmlFor="ei-date">Date</label>
                <input id="ei-date" type="date" value={newDate} onChange={e => { setNewDate(e.target.value); setAddError(null); }} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 180 }}>
                <label htmlFor="ei-desc">Description</label>
                <input id="ei-desc" type="text" placeholder="e.g. Parking, License4Work fee" value={newDesc}
                  onChange={e => { setNewDesc(e.target.value); setAddError(null); }} onKeyDown={e => e.key === "Enter" && addItem()} />
              </div>
              <div className="field" style={{ width: 130 }}>
                <label htmlFor="ei-amt">Amount (AUD)</label>
                <input id="ei-amt" type="number" min="0" step="0.01" placeholder="0.00" value={newAmt}
                  onChange={e => { setNewAmt(e.target.value); setAddError(null); }} onKeyDown={e => e.key === "Enter" && addItem()} />
              </div>
              <button className="btn-primary" onClick={addItem} style={{ marginBottom: 1 }}>
                <i className="ti ti-plus" aria-hidden="true" /> Add
              </button>
            </div>
            {addError && (
              <p style={{ color: "var(--color-text-danger)", fontSize: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <i className="ti ti-alert-circle" aria-hidden="true" />
                {addError}
              </p>
            )}
          </div>

          <div id="abn-invoice-doc" className="invoice-doc">
            <div className="inv-header">
              <div className="inv-from">
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{settings.yourName || "Your Name"}</div>
                {settings.abn         && <div>ABN: {settings.abn}</div>}
                {settings.yourAddress && <div>{settings.yourAddress}</div>}
                {settings.yourPhone   && <div>Phone: {settings.yourPhone}</div>}
                {settings.yourEmail   && <div>Email: {settings.yourEmail}</div>}
              </div>
              <div className="inv-title-col">
                <h1 className="inv-title">
                  {weekCount === 1 ? `TAX INVOICE #${firstNum}` : `TAX INVOICES #${firstNum}–#${afterNum - 1}`}
                </h1>
                <div style={{ marginTop: 14, lineHeight: 1.55 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Invoice to: {settings.companyName || "Company Name"}</div>
                  {settings.companyAbn   && <div>ABN: {settings.companyAbn}</div>}
                  {settings.companyEmail && <div>Email: {settings.companyEmail}</div>}
                </div>
                <div style={{ marginTop: 10 }}>
                  <strong>Issue date: </strong>{fdInv(settings.invoiceDate || todayStr())}
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
                {(() => {
                  let lastWeek = "";
                  let wkNum = firstNum - 1;
                  return allRows.map(row => {
                    const rw = weekStart(row.date);
                    const isNewWeek = rw !== lastWeek;
                    if (isNewWeek) { lastWeek = rw; wkNum++; }
                    const wkSunDate = new Date(rw + "T12:00:00");
                    wkSunDate.setDate(wkSunDate.getDate() + 6);
                    const wkSun = wkSunDate.toISOString().slice(0, 10);
                    return (
                      <React.Fragment key={row.key}>
                        {isNewWeek && weekCount > 1 && (
                          <tr>
                            <td colSpan={5} style={{ padding: "8px 6px 4px", fontSize: 11, fontWeight: 700, color: "#888", letterSpacing: "0.04em", borderTop: lastWeek !== rw ? "1px solid #e5e7eb" : undefined, background: "transparent" }}>
                              INVOICE #{wkNum} · {fdInv(rw)} – {fdInv(wkSun)}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td style={{ whiteSpace: "nowrap" }}>{fdInv(row.date)}</td>
                          <td>
                            {row.description}
                            {row.client && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{row.client}</div>}
                          </td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap", color: row.rate === null ? "#999" : undefined }}>{row.rate !== null ? `$ ${row.rate.toFixed(2)}` : "—"}</td>
                          <td style={{ textAlign: "right", color: row.hours === null ? "#999" : undefined }}>{row.hours !== null ? row.hours.toFixed(2) : "—"}</td>
                          <td style={{ textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>$ {row.amount.toFixed(2)}</td>
                        </tr>
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>

            <div className="inv-bottom">
              <div className="inv-box">
                <div className="inv-box-title">Payment details</div>
                <div className="inv-box-content">
                  {settings.bankName      && <div>{settings.bankName}</div>}
                  {settings.bsb           && <div>BSB: {settings.bsb}</div>}
                  {settings.accountNumber && <div>Account: {settings.accountNumber}</div>}
                  {!settings.bankName && !settings.bsb && !settings.accountNumber && (
                    <span style={{ color: "#999", fontSize: 12 }}>Add details in Settings → Payment</span>
                  )}
                </div>
              </div>
              <div className="inv-box">
                <div className="inv-totals-line"><span>Subtotal</span><span>$ {subtotal.toFixed(2)}</span></div>
                <div className="inv-totals-line">
                  <span>{settings.gstRegistered ? "GST (10%)" : "GST (N/A)"}</span>
                  <span>$ {gst.toFixed(2)}</span>
                </div>
                <div className="inv-totals-line total"><span>Total</span><span>$ {invoiceTotal.toFixed(2)}</span></div>
              </div>
            </div>

            <div className="inv-notes-box">
              <div className="inv-box-title">Additional notes</div>
              <div className="inv-box-content">{settings.invoiceNotes || "-"}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
