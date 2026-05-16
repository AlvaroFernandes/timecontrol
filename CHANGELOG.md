# Changelog

All notable changes to SplitShift are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.5.17] - 2026-05-16

### Performance
- Wrapped all tab-panel components and `ui.tsx` primitives with `React.memo`: `Dashboard`, `LogEntry`, `EntriesList`, `WeeklyReport`, `TFNReport`, `ABNInvoice`, `InvoiceHistory`, `AdminEditModal`, `SettingsPage`, `Metric`, `Bdg` — components now bail out of re-rendering when their props have not changed (e.g., when a toast appears/disappears or the admin modal opens while the active tab's data is unchanged)

---

## [0.5.16] - 2026-05-16

### Performance
- `hooks/useAppData.ts` admin init — replaced two sequential calls (`getManagedUsers` then `getManagedAdmins`, each triggering a separate `resolveRootAdminId` round-trip) with a single `getManagedTeam` call; `getManagedTeam` resolves the root admin ID once and fetches workers and co-admins in parallel. `getSettings` runs concurrently in the same batch, cutting admin startup from 3 sequential round-trips to 2.

---

## [0.5.15] - 2026-05-16

### Fixed
- `components/AdminEditModal.tsx` — `breakMins` clamped to `Math.max(0, ...)` so negative values cannot reach the calculation engine or DB; `hourlyRate` is now validated with `isNaN` + `< 0` guard before `onSave` is called, consistent with the same fix applied to `handleSave` in v0.5.11

---

## [0.5.14] - 2026-05-16

### Fixed
- `handleDeleteInvoice` in `hooks/useAppData.ts` — DB result is now checked before updating UI state; a failed delete no longer silently removes the invoice from the list and shows a success toast

---

## [0.5.13] - 2026-05-16

### Security
- `supabase/migrations/008_profiles_email_unique.sql` — added a partial unique index on `profiles.email` (where email is not null); previously the same address could be invited multiple times, creating duplicate or orphaned auth users

---

## [0.5.12] - 2026-05-16

### Security
- `app/api/invite/route.ts` — email address is now trimmed and lowercased before being passed to `inviteUserByEmail`; trailing spaces or mixed-case addresses previously created duplicate accounts

---

## [0.5.11] - 2026-05-16

### Fixed
- `handleSave` in `hooks/useAppData.ts` — `hourlyRate` is now parsed and validated before building the entry: non-numeric strings (e.g. "abc") that previously passed the truthy check and stored NaN to the DB now show an error toast instead; `breakMins` is clamped to `Math.max(0, ...)` so negative values from a crafted request cannot reach the calculation engine

---

## [0.5.10] - 2026-05-16

### Fixed
- `handleSave` in `hooks/useAppData.ts` — DB write is now awaited before updating UI state and showing a success toast; silently-failed saves no longer mark an entry as saved on screen
- `handleAdminSave` in `hooks/useAppData.ts` — same fix: the modal now stays open and shows an error toast if the DB upsert fails, instead of closing and toasting success unconditionally
- `handleDelete` in `hooks/useAppData.ts` — entry is only removed from UI state after the DB delete confirms success; previously the list updated immediately and the error (if any) was invisible

### Security
- `supabase/migrations/007_profiles_managed_select.sql` — replaced the hardcoded `admin_id = auth.uid()` check on `profiles_managed_select` with `manages_user(user_id)`, so sub-admins can now read the profiles of workers they manage (the entries/settings policies already used `manages_user`; the profiles policy was the only one left behind)
- `app/auth/confirm/route.ts` — closed open-redirect: the `?next=` query param is now validated to be a relative path before use; absolute URLs, protocol-relative URLs (`//attacker.com`), and `javascript:` URIs all fall back to `/`

---

## [0.5.6] - 2026-05-16

### Security
- `genId()` in `lib/formatters.ts` now uses `crypto.randomUUID()` instead of `Date.now().toString(36) + Math.random()` — UUIDs are cryptographically random and unguessable, whereas the old scheme was predictable from wall-clock time
- Added HTTP security headers in `next.config.ts` applied to all routes: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation off)

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
