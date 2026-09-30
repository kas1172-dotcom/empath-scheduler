# EMPATH Unit Scheduler

A single-file, self-contained nurse scheduler for a 12-capacity EMPATH-model crisis
stabilization unit attached to an ED. Built to do two things: make weekly scheduling
less painful, and give the manager enough real data over time to argue for the FTE
the unit actually needs.

## Running it

Open `index.html` in a browser. No build step, no install, no dependencies to fetch
up front (the spreadsheet library loads on its own, lazily, only if you use Import or
Export). Works from disk, from GitHub Pages, or published as a Claude artifact.

## Persistence — read this before relying on it

- **Inside Claude's own viewer**, this saves to a real shared document (the `db`
  capability) and syncs live between everyone who has it open. It has no transactions:
  if two people save in the same instant, the second write wins entirely, not just on
  the fields that actually collided. Fine for a manager plus a handful of staff saving
  occasionally; not fine at real multi-user scale.
- **Anywhere else** (GitHub Pages, opened straight from disk), it falls back to this
  browser's own `localStorage`. Your data survives a refresh and follows you between
  tabs of the *same* browser, but does not sync to anyone else and does not follow you
  to a different device.
- A status indicator next to Undo always says which of these is happening: Saved,
  Saving…, or a visible error. It never fails silently.
- **There is no real sign-in yet.** The "Employee portal" is a dropdown that lets
  anyone preview any nurse's view from the same browser tab. It is not access control.
  Anyone who can open the page can open the Manager view, the Roster, wages, everyone's
  equity scores. Do not rely on this for anything you wouldn't want a nurse to see
  just by clicking a dropdown.

## What's actually in it

**Scheduling**
- Editable hourly coverage grid, tap/click to assign, tap a second hour in the same
  day to select a range, visible breaks where one shift ends and the next begins
- A separate, always-on coverage floor for psychiatric aides, tracked apart from the
  RN/Manager ratio requirement, since an aide doesn't satisfy that ratio
- Auto-fill for RN/Manager gaps only (aides self-schedule, this never touches them):
  rule-based, not an optimizer, ranks by shift-time preference, manager-on-days
  priority, fewest hours this week, then lowest equity score
- Roles: RN, MHRN, Manager, Aide, Other (agency/fill-in)
- FLSA overtime (40 hr/week) and holiday pay, differentials stack, both configurable
- Undo for every data change, with a visible count

**Staff-facing**
- Employee portal with a real monthly calendar: past shifts shown as history, future
  days for requesting PTO / Off / a desired shift (single day or a tapped range),
  patient census submission for days actually worked
- A review queue on the manager side for both requests and submitted census, with
  edit-before-approve and conflict flags
- Equity/fairness scoring (nights, weekends, holidays, PTO, desired shifts), editable
  directly for backdating, or synced from a week's actual worked shifts going forward
- Aides are intentionally excluded from equity scoring; they pick their own hours

**Data in and out**
- Import census/FTE from a spreadsheet (`.xlsx`/`.csv`), loosely-matched columns
- Import past shifts from a spreadsheet, matched against your Roster by name, safe to
  re-run (skips exact duplicates, reports what it skipped and why)
- Export the current week's shifts to `.xlsx`
- Print: grid, daily list, or a census/FTE history report, portrait or landscape

**Making the FTE case**
- Census & FTE tracks your own ratio target against actual staffing, retrospectively
  (this unit's census is ED-driven and can't be forecast, so it's not used to set a
  forward staffing target, only to check past staffing against what actually happened)
- Trends & Budget aggregates real recorded data week-over-week or month-over-month,
  no simulated placeholder numbers, it's blank until you've actually recorded more
  than one period
- Labor cost tracking with real wage/differential/overtime math

## Known gaps, in priority order

1. **No real accounts or access control.** Anyone with the link sees everything.
2. **Persistence has no transactions** on the Claude-hosted path, and no cross-device
   sync at all on the localStorage-fallback path.
3. **No daily/weekly automated backup export** — if the store is ever lost, so is the
   history.

The natural next step, once this is used enough that these matter, is a real backend
(e.g. Supabase) with actual sign-in and row-level access rules — that removes both the
account-boundary problem and the transaction problem in one move, but it's a genuine
rebuild of the data layer, not a small patch on top of this file.
