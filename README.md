# OPT App — Scaffold

This repository contains the OPT App (PWA-first) for managing poker players and season data.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Run development server:

```bash
npm run dev
```

3. Open the URL printed by Vite. On iPad, use the network URL and add to home screen for PWA behavior.

## Build Preview

```bash
npm run build
npm run preview
```

## Notes

- Requirements are documented in `OPT_Requirements.md` and `TECHNICAL_Requirements.md`.
- Data is persisted client-side and the app is intended to be installable/offline-capable as a PWA.
## Development roadmap — phases

This project will be developed in focused phases. Each phase has clear deliverables and acceptance criteria so we can iterate quickly and release a reliable MVP.

Phase 1 — Discovery & requirements (1 week)
- Finalize `OPT_Requirements.md`: confirm scoring rules, single-entry policies, payment flows, and table balancing rules.
- Deliverables: final requirements doc, CSV import/export schema, and acceptance criteria for MVP.

Phase 2 — MVP: PWA local-first (2–4 weeks)
- Implement core data model in IndexedDB (Dexie): Player, Season, Tournament, Entry, Payment, ChipTemplate, ClockTemplate, EventLog.
- UI: Players CRUD, Season setup, Tournament setup (chip & clock templates), Participant management & payments, leaderboard calculation.
- Run-mode: authoritative local clock, record results, basic table balancing (headcount diff <= 1).
- Deliverables: working PWA that runs offline on iPad & Mac, seed data import/export, and a minimal run-view.
- Acceptance: core flows work offline, data persists, single-entry enforced, templates save/load, payments tracked, leaderboard correct.

Phase 3 — Local sync / LAN host (optional, 1–2 weeks)
- Add an optional Node.js local server (Express + SQLite) to act as a host for multiple local clients on the same LAN.
- Implement simple sync endpoints and an optional WebSocket for realtime updates (level changes, table moves, leaderboard).
- Deliverables: host server, client sync logic, simple authentication (shared PIN).

Phase 4 — Desktop convenience & printing (optional, 1 week)
- Provide an Electron wrapper for Mac users who want a native-feeling app, easier printing, and bundled local-host mode.
- Deliverables: Electron dev bundle and packaging scripts.

Phase 5 — Testing, QA & documentation (1–2 weeks)
- Unit tests for scoring, DB migrations, and key logic (Vitest).
- E2E tests for run-mode and leaderboard (Playwright).
- Manual QA checklist for live event flows and migration tests.

Phase 6 — Deployment & handoff
- Finalize docs, README, and a short operations guide for running local host and installing the PWA on iPad.
- Deliverables: packaged builds, export/import instructions, and a small troubleshooting guide.

Optional Phase 7 — Advanced sync & cloud (future)
- Add CRDT-based peer sync (Automerge) or a cloud-hosted backend for remote centralized data.
- Add user auth, backups, analytics, or integration with third-party payment processors.

## Roadmap checklist (quick view)
- [ ] Finalize requirements (rules, scoring, payments)
- [ ] Implement IndexedDB schema and migrations
- [ ] Players CRUD and Season/Tournament setup UI
- [ ] Chip & clock templates save/load
- [ ] Participant payments and payment ledger
- [ ] Tournament run-view with authoritative clock
- [ ] Table balancing algorithm and auto/manual modes
- [ ] Export/import CSV & JSON
- [ ] Optional: Local host sync (Express + SQLite)
- [ ] Optional: Electron packaging for Mac
- [ ] Tests: unit + E2E

If you want, I can start Phase 2 by adding the Players CRUD UI and the rest endpoints for the local server stub — tell me which one to implement first.
