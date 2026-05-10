# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build (also type-checks)
npm run lint     # ESLint
npm run start    # serve the production build
```

## Architecture

Single-page app built with Next.js 15 App Router. The entire UI lives in one client component (`components/WorkHoursTracker.tsx`) rendered directly from `app/page.tsx`. There is no API layer — all data is persisted to `localStorage` under the key `wh_tracker_v1`.

**Key files:**

- `components/WorkHoursTracker.tsx` — the whole application: state management, calculation engine, and all view components
- `app/globals.css` — CSS custom properties (design tokens for light/dark mode) and all app-shell styles; Tabler Icons webfont is imported here
- `app/layout.tsx` — Geist fonts, metadata

**Calculation engine (`processEntries`):**

Entries are sorted chronologically, then processed in a single pass with two running accumulators:
- `dayRun` — cumulative hours per calendar date (overtime kicks in at 12h/day at ×1.5)
- `periodRun` — cumulative hours across the whole period (first `tfnLimit` hours → TFN salary; excess → ABN invoice)

These two splits are independent, producing four buckets per entry: `rTFN`, `otTFN`, `rABN`, `otABN`. The order entries appear in `processEntries` output is date+time sorted — this matters because TFN/ABN allocation is sequential.

**Tabs:** Dashboard · Log Entry · Entries · TFN Report · ABN Invoice

**Styling approach:** Component uses plain CSS class names (`.card`, `.metric-grid`, `.data-table`, etc.) defined in `globals.css`. Tailwind is available but the existing component does not use utility classes — keep this consistent when extending the component. Design tokens follow the pattern `--color-{background|border|text}-{semantic}`.

**Icons:** `@tabler/icons-webfont` — use `<i className="ti ti-{icon-name}" />`.

**Currency/locale:** Australian (AUD, `en-AU`). GST on ABN invoices is 10%.
