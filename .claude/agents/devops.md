# WorkHoursTracker — Agent Specification

> This document is the authoritative reference for any AI agent managing, maintaining, or extending the **WorkHoursTracker** application. Read it in full before touching any code.

---

## 1. What This App Is

A single-file React application (`WorkHoursTracker.jsx`) that runs as a Claude artifact (claude.ai). It allows an Australian contractor to:

- Log jobs with start/end times and hourly rates
- Automatically split logged hours between **TFN salary** (first N hours per period) and **ABN invoiceable excess**
- Apply **overtime at ×1.5** for any hours worked beyond 12 in a single calendar day
- Generate a printable **TFN timesheet** and a **GST tax invoice** for ABN hours
- Persist all data via `window.storage` (Claude artifact storage API) — no backend, no internet required at runtime

The user is a sole contractor paid part-time (30 h/period) by TFN, billing excess hours via ABN.

---

## 2. Deployment Context

| Constraint | Detail |
|---|---|
| Runtime | Claude.ai artifact iframe (React 18, browser JS) |
| Storage | `window.storage` — Claude artifact persistent key-value store |
| Network | None required at runtime (no fetch calls, no external APIs) |
| File count | **Single `.jsx` file** — always deliver one complete file, never split |
| Icons | Tabler Icons outline webfont via `<i class="ti ti-NAME">` (loaded by host) |
| Styling | CSS-in-JS string (`const CSS`) + Claude design system CSS variables |
| Output format | Always replace the full file — never deliver partial diffs or patches |

---

## 3. File Structure

Everything lives in `WorkHoursTracker.jsx`. The layout is:

```
imports
│
├── KEY                     Storage key constant ("wh_tracker_v1")
│
├── Utilities
│   ├── calcHours(start, end) → number     HH:MM → decimal hours, midnight-safe
│   ├── fh(h)               → string       Format hours as "Xh YYm"
│   ├── fc(n)               → string       Format AUD currency (en-AU locale)
│   ├── fd(d)               → string       Format YYYY-MM-DD as "Mon D MMM YYYY"
│   ├── todayStr()          → string       YYYY-MM-DD for today
│   └── genId()             → string       Collision-resistant entry ID
│
├── processEntries(entries, tfnLimit) → ProcessedEntry[]   ← CORE ENGINE
│
├── storageGet(key)         async, returns parsed JSON or null
├── storageSave(key, value) async, returns boolean
│
├── CSS                     const string, injected via <style>
│
├── DEFAULT_SETTINGS        object literal
│
└── React components (all in one file, export default App)
    ├── App                 Root — state, storage, handlers, routing
    ├── Dashboard           Overview metrics + recent-days table
    ├── LogEntry            Add/edit entry form
    ├── EntriesList         Period entry table with edit/delete
    ├── TFNReport           Printable TFN timesheet
    ├── ABNInvoice          Printable ABN tax invoice with GST
    ├── SettingsModal       Modal for all configuration
    ├── Metric              Reusable metric card (label + value + optional progress bar)
    └── Bdg                 Reusable badge (type: "tfn" | "abn" | "ot")
```

---

## 4. Data Schema

### 4.1 Storage payload

Everything is stored under a single key (`wh_tracker_v1`) as a JSON string:

```ts
{
  entries:     Entry[];
  settings:    Settings;
  periodStart: string;   // YYYY-MM-DD or ""
  periodEnd:   string;   // YYYY-MM-DD or ""
}
```

### 4.2 Entry (raw, as stored)

```ts
{
  id:             string;   // genId() — e.g. "m5y3kxr2a"
  date:           string;   // YYYY-MM-DD
  jobDescription: string;
  startTime:      string;   // HH:MM (24h)
  endTime:        string;   // HH:MM (24h)
  hourlyRate:     number;   // AUD, always a parsed float
}
```

### 4.3 ProcessedEntry (computed by `processEntries`, never stored)

Extends Entry with:

```ts
{
  total:        number;   // total hours for this entry
  regular:      number;   // non-overtime hours (≤ 12h/day boundary)
  overtime:     number;   // hours beyond 12h in the day
  tfnPortion:   number;   // hours within TFN limit (period scope)
  abnPortion:   number;   // hours beyond TFN limit
  rTFN:         number;   // regular ∩ TFN
  otTFN:        number;   // overtime ∩ TFN
  rABN:         number;   // regular ∩ ABN
  otABN:        number;   // overtime ∩ ABN
  tfnEarnings:  number;   // rTFN×r + otTFN×r×1.5
  abnEarnings:  number;   // rABN×r + otABN×r×1.5
  totalEarnings: number;  // tfnEarnings + abnEarnings
}
```

### 4.4 Settings (as stored)

```ts
{
  yourName:      string;   // appears on reports
  companyName:   string;   // appears on invoice "Bill To"
  abn:           string;   // appears on invoice
  tfnLimit:      number;   // default 30 — hours before ABN kicks in
  defaultRate:   string;   // pre-fills the rate field (kept as string for form)
  invoicePrefix: string;   // default "INV"
  invoiceNum:    number;   // increments on "Mark Sent"
}
```

---

## 5. Core Calculation Engine — `processEntries`

This is the most critical function. Do not modify its logic without re-running the invariant checks below.

### 5.1 How it works

Entries are sorted by `date` then `startTime` before processing. Two running counters are maintained:

- `dayRun[date]` — cumulative hours logged on each calendar date
- `periodRun` — cumulative hours logged across the whole period

For each entry in order:

**Step 1 — Overtime split (day scope)**
```
regular  = max(0, min(12, dayBefore + total) - dayBefore)
overtime = total - regular
```
This yields how many of this entry's hours are at the standard rate vs. 1.5× rate.

**Step 2 — TFN/ABN split (period scope)**
```
tfnPortion = max(0, min(tfnLimit, periodRun + total) - periodRun)
abnPortion = total - tfnPortion
```
This yields how many of this entry's hours fall within the TFN salary ceiling.

**Step 3 — 4-bucket intersection**

Model the entry as a number line `[0, total)`. Overtime occupies the tail `[regular, total)`. TFN occupies the head `[0, tfnPortion)`.

```
rTFN  = max(0, min(regular, tfnPortion))
otTFN = max(0, min(total, tfnPortion) - regular)
rABN  = max(0, min(regular, total) - tfnPortion)
otABN = max(0, total - max(regular, tfnPortion))
```

**Invariant:** `rTFN + otTFN + rABN + otABN === total` (within floating-point tolerance).

**Step 4 — Earnings**
```
tfnEarnings = rTFN × rate + otTFN × rate × 1.5
abnEarnings = rABN × rate + otABN × rate × 1.5
```

### 5.2 Invariant checks (run mentally before shipping any engine change)

| Scenario | Expected |
|---|---|
| 8h day, 8h in TFN | rTFN=8, otTFN=0, rABN=0, otABN=0 |
| 14h day, all in TFN | rTFN=12, otTFN=2, rABN=0, otABN=0 |
| 5h, straddles TFN boundary at 3h | rTFN=3, otTFN=0, rABN=2, otABN=0 |
| 14h day, entry straddles TFN boundary at h=10 | rTFN=10, otTFN=0, rABN=2, otABN=2 |
| 14h day, all in ABN | rTFN=0, otTFN=0, rABN=12, otABN=2 |
| 14h day, TFN boundary at h=13 | rTFN=12, otTFN=1, rABN=0, otABN=1 |
| All zeros (empty entry) | All fields 0, no crash |

### 5.3 Midnight-crossing entries

`calcHours` adds 1440 minutes when the result is ≤ 0 (e.g. 23:00–01:00 = 2h). This is intentional. Entries are treated as belonging to the `date` field, not split across two days.

---

## 6. CSS & Design System

### 6.1 Variables (provided by Claude.ai host — never define these yourself)

```
Backgrounds:  --color-background-primary / -secondary / -tertiary
              --color-background-success / -info / -warning / -danger
Text:         --color-text-primary / -secondary / -tertiary
              --color-text-success / -info / -warning / -danger
Borders:      --color-border-tertiary / -secondary / -primary
              --color-border-success / -info / -warning / -danger
Fonts:        --font-sans / --font-mono / --font-serif
Radius:       --border-radius-md (8px) / --border-radius-lg (12px)
```

All CSS lives in the `CSS` constant (a template literal string injected via `<style>`). It is minified/compact intentionally to save tokens. Keep it that way.

### 6.2 Rules

- Never hardcode colors like `#333` or `rgba(0,0,0,0.8)` in JSX inline styles — use CSS variables. Exception: the modal overlay background (`rgba(0,0,0,0.5)`) which is intentionally not a variable.
- Borders are always `0.5px solid var(--color-border-tertiary)` (or `-secondary` for emphasis).
- No gradients, shadows, blur, or glow effects.
- `font-weight` is either 400 (body) or 500 (headings/labels). Never 600 or 700.
- Icons are Tabler **outline** webfont only: `<i class="ti ti-NAME" aria-hidden="true" />`. Never use `-filled` variants. Find icon names at https://tabler.io/icons.
- Print styles live inside a `@media print` block at the end of `CSS`. Always maintain them.
- Every interactive element visible to the user must have an `aria-label` or associated `<label>`.

### 6.3 Badge types

The `Bdg` component accepts `type: "tfn" | "abn" | "ot"`:
- `tfn` → success (green) background/text
- `abn` → info (blue) background/text
- `ot` → warning (amber) background/text

---

## 7. Storage API Contract

The artifact uses `window.storage` (Claude's persistent storage API). Always wrap in try/catch:

```js
// Read
async function storageGet(key) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}

// Write
async function storageSave(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}
```

**Do not use `localStorage` or `sessionStorage`** — they are not supported in the artifact sandbox and will silently fail.

The storage key is `"wh_tracker_v1"`. If a schema migration is ever needed, increment the version suffix (`v2`, etc.) and write a migration in the `useEffect` load block.

---

## 8. How to Apply Changes

### 8.1 Always deliver the complete file

Never output partial updates, diffs, or "replace X with Y" instructions. Always output the entire `WorkHoursTracker.jsx` from line 1 to end. The user pastes it wholesale into the Claude artifact editor.

### 8.2 Change checklist

Before shipping any change:

- [ ] `processEntries` invariants still hold (run mentally for boundary cases)
- [ ] All storage read/write paths have try/catch
- [ ] No hardcoded colors — CSS variables used throughout
- [ ] `window.storage` used, not `localStorage`
- [ ] `aria-label` on all interactive elements without visible text labels
- [ ] `@media print` block preserved and updated if new sections were added
- [ ] `const KEY = "wh_tracker_v1"` unchanged (or intentional migration written)
- [ ] No new external fetches introduced
- [ ] `DEFAULT_SETTINGS` updated if new settings fields were added
- [ ] New settings fields handled gracefully when absent (spread + fallback defaults in load `useEffect`)

### 8.3 Adding a new tab

1. Add `{ id, label, icon }` entry to the `TABS` array in `App`.
2. Add `{tab === "id" && <NewComponent ... />}` in the `<main>` render block.
3. Define `function NewComponent({ ... }) { ... }` at the bottom of the file.
4. If the new view is printable, add `<button onClick={() => window.print()}>` with `.no-print` class and update `@media print`.

### 8.4 Adding a new settings field

1. Add to `DEFAULT_SETTINGS`.
2. Add a `<div class="field">` block in `SettingsModal`'s form grid.
3. Ensure the `useEffect` load path merges with defaults: `setSettings(s => ({ ...DEFAULT_SETTINGS, ...data.settings }))` — this already handles missing fields gracefully.

### 8.5 Storage migration pattern

When the schema changes in a breaking way:

```js
// In App's useEffect:
const data = await storageGet(KEY);
if (data?.version === 1) {
  // migrate: data.entries.forEach(e => e.newField = defaultValue)
  data.version = 2;
  await storageSave(KEY, data);
}
```

---

## 9. Period Logic

The period is a date range (`periodStart`, `periodEnd`) stored as `YYYY-MM-DD` strings or empty string. Filtering:

```js
const periodEntries = entries.filter(e =>
  (!periodStart || e.date >= periodStart) &&
  (!periodEnd   || e.date <= periodEnd)
);
```

String comparison works correctly for ISO date strings. An empty string means "no filter on that boundary" (open range).

The period is **not** a billing cycle object — it is a simple UI filter. The user sets it manually each time. The `processEntries` engine always treats the filtered set as a fresh period starting at hour 0.

---

## 10. Invoice Logic

The ABN invoice is generated from `processed.filter(e => e.abnPortion > 0)`.

- Invoice number: `${settings.invoicePrefix}-${String(settings.invoiceNum).padStart(4, "0")}`
- "Mark Sent" calls `advanceInvoice()` which increments `settings.invoiceNum` and persists.
- GST is always 10% of the ABN subtotal (Australian standard). Total = subtotal + GST.
- The invoice is printed via `window.print()`. The `@media print` block hides nav/buttons and cleans up the layout.

---

## 11. Known Limitations

| Limitation | Notes |
|---|---|
| No multi-period history | All entries exist in one flat array. Period is a filter, not a container. If history across many periods is needed, the schema needs a `periods[]` structure. |
| No duplicate-entry detection | Overlapping time ranges on the same day are accepted silently. Overtime math handles the total hours correctly but doesn't warn about logical overlaps. |
| Midnight-cross is single-day | A shift from 22:00–06:00 is treated as belonging to the entry's `date` field. The 14-hour gap is calculated correctly, but it won't appear on the next day's daily total. |
| Print layout is basic | `window.print()` prints the current tab. Only one section (TFN or ABN) is in focus; there is no "print all" combined PDF. |
| No data export | There is no CSV/JSON export beyond printing. |
| Storage is per-Claude-account | `window.storage` is scoped to the artifact and user. Data does not roam between devices unless Claude.ai syncs it. |

---

## 12. Improvement Backlog

Possible features the agent may be asked to build. Approach each carefully against the constraints in Section 8.

**High priority**
- [ ] Duplicate/overlap detection when adding an entry (warn but do not block)
- [ ] "Quick entry" — start a timer now, stop it later, auto-fill start/end
- [ ] CSV export of all entries for a period
- [ ] Weekly summary chart (bar chart, hours per day)

**Medium priority**
- [ ] Multiple hourly rates per client (settings: rate name + value list)
- [ ] Period presets ("This week", "This fortnight", "This month")
- [ ] Confirmation dialog before deleting an entry
- [ ] Invoice payment status tracking (paid / unpaid / overdue)
- [ ] Notes field on entries (optional free-text)

**Low priority / speculative**
- [ ] Multi-period archive (close a period, archive it, start fresh)
- [ ] Dark/light mode preference stored in settings
- [ ] Combined print view (TFN report + ABN invoice on one print)
- [ ] ABN invoice due-date field

---

## 13. Responding to User Requests

### "Add a feature"
- Confirm understanding of the request before coding if it is ambiguous.
- Check the backlog above for prior art.
- Implement in the single `.jsx` file.
- State clearly what changed and any assumptions made.

### "Fix a bug"
- First reproduce the bug mentally using the calculation engine invariants.
- If the bug is in `processEntries`, trace through the four-bucket math with the specific inputs.
- If the bug is in the UI, identify which component and what state transition is wrong.
- Always deliver the complete fixed file.

### "The numbers look wrong"
- Ask for: the date, the start/end times, the hourly rate, the period start/end, and the TFN limit.
- Trace `processEntries` manually for that day's entries in chronological order.
- Show your working before touching code.

### "Change the design"
- Respect the CSS variable system — no hardcoded colors.
- Respect the font-weight ceiling (max 500).
- Do not introduce gradients, shadows, or blur.
- Update `@media print` if the change affects printable views.

### "Migrate / change the data schema"
- Write a migration in the `useEffect` load block.
- Increment the storage key version suffix if the change is breaking.
- Ensure new fields default gracefully when absent from old saved data.

---

## 14. Testing Reference

There is no automated test suite. Validate manually using these scenarios after any change:

**Scenario A — basic TFN-only week**
- 3 entries, same week, 8h each, no day exceeds 12h, period total = 24h (under 30h limit)
- Expected: all hours TFN, zero ABN, zero overtime

**Scenario B — overtime in a day**
- 1 entry, 14h, rate $50/h, all within TFN limit
- Expected: regular=12, overtime=2, tfnPortion=14
- tfnEarnings = 12×50 + 2×50×1.5 = 600 + 150 = **$750.00**

**Scenario C — TFN/ABN boundary mid-entry**
- Period has 28h already. New entry is 5h.
- Expected: tfnPortion=2, abnPortion=3
- If rate=$60: tfnEarnings=2×60=$120, abnEarnings=3×60=$180

**Scenario D — overtime AND ABN boundary in same entry**
- Period has 25h already (tfnLimit=30). New entry is 10h on a day with 8h already logged.
- dayBefore=8 → regular=min(12,18)-8=4, overtime=6
- tfnPortion=min(30,35)-25=5, abnPortion=5
- rTFN=min(4,5)=4, otTFN=min(10,5)-4=1, rABN=min(4,10)-5=0 → wait, rABN=max(0,min(4,10)-5)=0 ... hmm, 4<5 so 0. otABN=max(0,10-max(4,5))=max(0,10-5)=5
- Check: 4+1+0+5=10 ✓
- Earnings at $80/h: tfn=4×80 + 1×80×1.5 = 320+120=440, abn=0×80 + 5×80×1.5=600

**Scenario E — empty period**
- No entries (or period filter excludes all entries)
- Expected: all totals 0, empty-state UI shown on all tabs, no crash

---

*Last updated: reflects `WorkHoursTracker.jsx` as delivered in the initial build.*
