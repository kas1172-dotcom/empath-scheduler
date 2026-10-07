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

Three tiers, picked automatically at load, in this order:

- **Deployed to its own backend (Fly.io, see below)**: real server-side persistence in
  a file on a Fly Volume, independent of any one browser, synced across every device
  that opens the URL (polls for changes every 5s). This is the tier you want for actual
  multi-device, multi-person use. Still no transactions: two saves in the same instant,
  the second wins entirely, not just the fields that collided — fine for a manager plus
  a handful of staff, not fine at real scale.
- **Inside Claude's own viewer**, this saves to a real shared document (the `db`
  capability) and syncs live between everyone who has it open. Same no-transactions
  caveat as above.
- **Anywhere else** (GitHub Pages, opened straight from disk, with no backend
  reachable), it falls back to this browser's own `localStorage`. Your data survives a
  refresh and follows you between tabs of the *same* browser, but does not sync to
  anyone else and does not follow you to a different device.

A status indicator next to Undo always says which of these is active and whether it's
Saved, Saving…, or erroring. It never fails silently.
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
- Import past shifts from a **photo** of a schedule (printed or handwritten) — needs
  the Fly.io backend deployed with an `ANTHROPIC_API_KEY` secret set (see below), since
  reading a photo takes a vision-model call a static page can't make on its own. Shows
  you a preview of everything it read, matched and ready to confirm, before anything
  touches the schedule.
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

## Deploying your own copy to Fly.io

This runs the same `index.html` behind a small Node/Express server (`server.js`) that
persists state to a file on a Fly Volume, so it's no longer tied to one browser or one
device. Total cost at the settings below is under $4/month — a `shared-cpu-1x` machine
at 512MB RAM (~$3.69/mo) plus a 1GB Volume (~$0.15/mo). No managed database needed.

**One-time setup**, from a terminal with [`flyctl`](https://fly.io/docs/flyctl/install/)
installed and `fly auth login` already run:

```sh
cd empath-scheduler
fly launch --no-deploy   # picks a unique app name if "empath-scheduler" is taken;
                          # when it asks, say no to Postgres/Redis — the app doesn't need them
fly volumes create empath_data --region iad --size 1   # 1GB volume for the SQLite-free JSON store
fly deploy
```

`fly launch` will offer to create/overwrite `fly.toml` — the one already in this repo
already has the right machine size (`shared-cpu-1x`, 512MB), the volume mount, and
`auto_stop_machines` turned on so you're billed only while it's actually serving a
request. If `fly launch` regenerates it differently, just restore the settings above
before running `fly deploy`.

**To turn on photo-based schedule import** (optional): get your own API key from
[console.anthropic.com](https://console.anthropic.com), then:

```sh
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
```

That's it — no redeploy needed, Fly restarts the machine with the new secret
automatically. Until you set this, the photo-import panel stays visibly disabled with
an explanation, and every other feature works normally without it.

**After deploying**, open the app at `https://<your-app-name>.fly.dev` instead of the
GitHub Pages copy or the Claude artifact — that's the one with real, synced, multi-
device persistence. The GitHub Pages copy and the Claude artifact keep working exactly
as before (falling back to localStorage / the `db` capability respectively); nothing
about deploying this changes them.

**First-time setup on a fresh deploy** — the app ships with no staff, no shifts, and no
census data, by design, so there's nothing demo-ish to clear out before real use:
1. **Roster tab**: add every nurse, manager, and aide (role, FTE, cert status, preferred
   shift start). This is the one thing that has to be done by hand first, everything
   else matches people up against it by name.
2. **Census & FTE tab**: bring in real history for the ratio/FTE tracking to mean
   anything, either the spreadsheet import, the photo import (once the API key's set),
   or typing it in directly.
3. Going forward, build each week in the Coverage tab (manually or with Auto-fill), and
   have staff submit their own census from the Employee portal, or keep entering it
   yourself.

## Known gaps, in priority order

1. **No real accounts or access control.** Anyone with the link sees everything.
2. **Persistence has no transactions** on any path (server, Claude-hosted, or
   localStorage) — two saves in the same instant, the second wins entirely, not just
   the fields that collided.
3. **No daily/weekly automated backup export** — if the Fly Volume (or the Claude `db`
   document, or the browser's localStorage) is ever lost, so is the history.
4. **Photo import's accuracy depends on the photo.** A vision model can misread a name
   or a time, which is why it always shows a preview to confirm before anything is
   added to the schedule — but it's still only as good as what it was asked to read.

The natural next step, once this is used enough that these matter, is real sign-in and
row-level access rules on top of the Fly.io backend — that removes the account-boundary
problem and the transaction problem in one move, but it's a genuine extension of the
server, not a small patch.
