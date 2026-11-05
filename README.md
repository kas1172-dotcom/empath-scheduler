# EMPATH Unit Clinical Staffing & Operations Platform

An interactive portfolio demonstration of nurse scheduling, scheduling equity, and unit-level operational analytics. Built by Kapil Sharma from firsthand healthcare operational experience.

[Open the demonstration](https://kas1172-dotcom.github.io/empath-scheduler/)

## Data and intended use

The public demonstration uses **fictional staff labels and synthetic unit totals generated from formulas**. It contains no patient records, diagnoses, medical record numbers, clinical notes, or real staff roster. The figures are not hospital results or evidence of actual staffing outcomes.

Use synthetic inputs only. The demo runs in browser memory: edits reset when the page reloads. It does not read old browser storage, contact a shared state service, or send data to an AI provider. The employee view is a demonstration of a workflow, not an authenticated account.

## What to explore

- **Operations:** average completed-stay length, occupancy, nursing hours per patient day (NHPPD), discharges, aggregate financial averages, illustrative acuity workload, hourly census, and a weekly summary.
- **Staffing scenarios:** change additional FTE and hourly cost to estimate hours, cost, and NHPPD. The model does not predict clinical outcomes or financial return.
- **Coverage:** edit hourly coverage, explore automatic gap filling, and distinguish nursing coverage from aide coverage.
- **Census and budget:** inspect synthetic historical trends and scheduling-based labor estimates.
- **Roster, requests, equity, and call-offs:** explore manager and employee workflows with fictional staff.
- **Export:** download clearly labeled synthetic unit totals as CSV; existing scheduling reports remain available.

Operations uses an independent 56-day illustrative aggregate dataset. Schedule edits do not change its historical totals. The dashboard explicitly labels this distinction. Both 7-day and 28-day windows compare against the preceding equal-length period.

## Metric definitions

| Metric | Calculation |
| --- | --- |
| Average length of stay | Sum of completed-stay hours / discharges |
| Occupancy | Patient-hours / (12 spaces × 24 hours × days) |
| NHPPD | Productive nursing hours / (patient-hours / 24); excludes aides |
| Revenue or cost per discharge | Illustrative unit total / discharges |
| Higher-acuity share | Illustrative higher-acuity patient-hours / total patient-hours |
| Additional staffing hours | Additional FTE × 36 productive weekly hours × days / 7 |

Ratios use summed numerators and denominators. Empty denominators display unavailable values. The higher-acuity category is an illustrative workload assumption, not a clinical instrument. The staffing bands and wage defaults are scenario assumptions, not legal standards or clinical recommendations.

## Run locally

Requires Node.js 20 or newer for the optional local server and tests.

```sh
npm ci
npm test
npm start
# Open http://localhost:8080
```

Alternatively, serve this directory with any static HTTP server. No build step is required. Keep `index.html`, `analytics.js`, and `operations.js` together. Spreadsheet import/export loads its existing spreadsheet dependency on demand; operational analytics has no external library dependency.

## Architecture

- `index.html`: scheduling UI, employee workflow, and ephemeral demonstration state.
- `analytics.js`: dependency-free metric, scenario, and labor-cost calculations; shared with Node tests.
- `operations.js`: aggregate dashboard, period selection, scenario controls, and synthetic CSV export.
- `server.js`: optional Express host. Only public application assets are served.
- `tests/analytics.test.js`: weighted metrics, empty denominators, deterministic data, workweek boundaries, partial reports, overnight shifts, and staffing scenarios.

Labor estimates split shifts at calendar boundaries and reset overtime on Mondays. They count preceding hours in the same week for partial reporting ranges and use a separate aide wage. These calculations are planning estimates; payroll agreements, regular-rate rules, benefits, and local requirements need independent implementation and review.

## Private backend status

Legacy shared-state and AI routes remain in the server for further private development, but **are disabled by default**. They require both `ENABLE_PRIVATE_API=true` and an `APP_ACCESS_TOKEN`, and requests must supply that token as a bearer credential. The public UI never uses those routes. Do not embed a token in static source.

This gate is not a complete hospital deployment: user accounts, role-based access, audit logging, transactional storage, backup/recovery, and an approved data-governance process are not implemented. Do not use this public demonstration as a clinical system. No paid service or AI key is needed for the demo.

## Deployment

The GitHub Pages workflow publishes only the three application assets after the calculation tests pass. It does not publish backend source, configuration, or stored state. The repository slug is retained for stable links; the application name above matches the resume.
