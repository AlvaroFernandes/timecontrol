# Changelog

All notable changes to SplitShift are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.5.5] - 2026-05-16

### Performance
- Derived values (`processed`, `weeklyData`, `totals`, `tfnPct`, `allPeriodEntries`) in `hooks/useAppData.ts` are now wrapped in `useMemo` keyed on `[entries, periodStart, periodEnd, settings.tfnLimit, settings.tfnRate, settings.overtimeThreshold]` — `processEntries` no longer re-runs on every form keystroke or `editId` change
- `TABS` array is now memoised on `[userRole]` — the tab definition object is stable across renders
- Supabase client moved from a bare `createClient()` call (re-executed on every render) to `useRef(createClient())` — the client is now created once per mount

---

## [0.5.4] - 2026-05-16

### Security
- `upsertEntry` in `services/entries.ts` now always writes to the explicitly passed `userId` — previously it fell back to `entry.ownerId`, allowing the call site to silently route writes to any user's row
- `handleAdminSave` in `hooks/useAppData.ts` now explicitly passes `updated.ownerId` as the target user ID when saving an admin-edited entry, making the intent clear at the call site rather than relying on a hidden fallback in the service layer

---

## [0.5.3] - 2026-05-16

### Security
- Enabled RLS on the `settings` table and added user-ownership policies (`settings_own_select/insert/update/delete`) — without these, any authenticated user could read or modify any other user's settings (`supabase/migrations/003_settings_invoices_rls.sql`)
- Enabled RLS on the `invoices` table and added user-ownership policies (`invoices_own_select/insert/update/delete`) — without these, any authenticated user could read or delete any other user's invoice history

---

## [0.5.2] - 2026-05-16

### Security
- Added explicit user-level RLS policies on the `entries` table (`entries_own_select`, `entries_own_insert`, `entries_own_update`, `entries_own_delete`) — the previous migration referenced these policies without defining them (`supabase/migrations/002_entries_rls.sql`)

---

## [0.5.1] - 2026-05-14

### Changed
- Removed unused default Next.js SVGs from `public/` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`)
- Rewrote `CLAUDE.md` to reflect the current architecture (hooks, services, split components, proxy middleware, user roles)

---

## [0.5.0] - 2026-05-14

### Security
- Added `proxy.ts` (Next.js 16 middleware) — unauthenticated requests are now redirected to `/login` server-side before any client JS runs, eliminating the loading-screen flash for unauthenticated users
- Added `lib/supabase-server.ts` — server-side Supabase client using `next/headers` cookies, ready for Server Components and Route Handlers

---

## [0.4.0] - 2026-05-13

### Changed (internal refactor — no user-facing changes)
- Extracted all TypeScript interfaces to `types/index.ts`
- Extracted calculation engine (`calcHours`, `processEntries`, `MIN_HOURS`) to `lib/calculations.ts`
- Extracted display helpers (`fh`, `fc`, `fd`, `fdInv`, `todayStr`, `genId`, `buildPdfFilename`, `downloadPdf`) to `lib/formatters.ts`
- Extracted all Supabase queries to `services/` (`entries.ts`, `settings.ts`, `profiles.ts`, `invoices.ts`)
- Extracted all app state, effects, and handlers to `hooks/useAppData.ts`
- Split `components/WorkHoursTracker.tsx` (1 818 lines) into 10 focused component files: `Dashboard`, `LogEntry`, `EntriesList`, `WeeklyReport`, `TFNReport`, `ABNInvoice`, `InvoiceHistory`, `AdminEditModal`, `SettingsPage`, `ui` (Metric + Bdg)
- `WorkHoursTracker.tsx` reduced to a 120-line pure rendering shell

---

## [0.3.0] - 2026-05-12

### Added
- Admin role system: admins see a combined view of all managed workers' entries; workers are linked to an admin via `admin_id` in the `profiles` table
- `supabase/migrations/001_admin.sql` — `profiles` table, security-definer helpers (`is_admin`, `manages_user`), RLS policies for profiles and admin entry access, signup trigger, back-fill for existing users
- Admin dashboard: users summary table (hours + earnings per worker) and recent-days breakdown
- `AdminEditModal` — overlay form allowing admins to edit any managed worker's entry
- Entries tab user filter for admin view
- Admin-specific tab set (no Log Entry, TFN Report, or ABN Invoice tabs)

---

## [0.2.0] - 2026-05-12

### Fixed
- All entry lists (Dashboard, Entries, ABN Invoice) now sort by date then start time
- Weekly report now shows all entries across all weeks, not just the current week
- Weekly report TFN/ABN hours and earnings were incorrect when archived entries had consumed part of the TFN budget — fixed by merging active-entry processed values over the all-entries baseline (`weeklyData` merge pattern)
- ABN invoice line items now sort by date then start time

---

## [0.1.0] - 2026-05-12

### Added
- Initial project: Next.js 16, Supabase Auth, Tailwind CSS
- Work entry logging (date, job description, start/end time, hourly rate, break minutes)
- Calculation engine: TFN/ABN split with configurable hour limit, overtime at ×1.5 above configurable daily threshold, 4-hour minimum call
- Dashboard with metrics grid (total hours, TFN/ABN hours, overtime, earnings)
- Entries list with edit and delete
- Weekly report with expandable per-entry rows and PDF download
- TFN timesheet report (printable)
- ABN tax invoice with extra line-item manager and PDF download
- Invoice history with saved invoice viewer and PDF re-download
- Settings (personal info, company info, work rules, payment details, PDF filename pattern)
- Light/dark theme toggle with system preference detection
- Supabase-backed persistence (entries, settings, invoices tables)
- Login page via Supabase Auth UI
