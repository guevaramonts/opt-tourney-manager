# OPT App — Technical Requirements

## Purpose
This document defines a recommended technical architecture and concrete choices so the OPT App can run on an iPad and a MacBook without requiring Apple App Store distribution. It focuses on a web-first, local-first design that supports offline operation and local deployment.

## High-level constraint
- No App Store distribution. The app must run on an iPad and MacBook without requiring the Apple App Store.

## Recommended architecture (summary)
- Web-first Progressive Web App (PWA) as the primary client. A PWA can be installed to an iPad home screen and used offline in Safari without App Store involvement.
- Local-first storage in the browser (IndexedDB) via a lightweight wrapper (Dexie.js) to support offline use and fast local operations.
- Optional Mac desktop native wrapper (Electron) that bundles the PWA and an embedded Node.js process to provide local file-based persistence, optional USB/LAN host services, and easier access to printing/exporting. Electron is optional for Mac only — it does not affect iPad usage.
- Optional local server mode: a small Node.js/Express server (SQLite) that can be run on a MacBook (or any laptop/host) to centralize data for multiple local clients on the same LAN; iPads can connect to that host via browser on the same Wi‑Fi (no App Store needed).
- Sync strategy: local-first + optional manual or LAN sync. For multi-device realtime sync, implement an optional WebSocket or WebRTC-based sync to a host machine running the local server.

## Why PWA-first
- Runs in Safari on iPad and in any modern browser on MacBook without App Store.
- Installable to home screen; can operate in a standalone window.
- Can use Service Worker + IndexedDB for offline capability.
- Avoids Apple signing/app-distribution complexity.

## Limitations to be aware of on iPad
- PWAs on iPadOS have platform limitations (push notifications are limited, background execution is restricted, file system access is limited compared to native apps).
- Safari PWA may have stricter memory/time limits than desktop browsers; design UI for progressive enhancement and short running tasks.
- For real-time local network discovery, mDNS/Bonjour is not available in the browser — local server will need a discoverable URL or manual host entry.

## Suggested stack
- Frontend: React + TypeScript + Vite (fast dev, small bundle)
- PWA tooling: Vite PWA plugin (workbox or similar) to generate service worker and manifest
- Local storage: IndexedDB via Dexie.js; use a schema that supports versioned migrations
- State & sync: React Query for server sync/queries; Zustand or context for UI state; consider Automerge/CRDT only if you need robust offline merge behavior
- Backend (optional): Node.js + Express + SQLite (local file) or Postgres for hosted deployment
- Desktop wrapper (optional Mac): Electron (Node + Chromium) that includes the PWA and an embedded server for local-only centralized mode
- Data import/export: CSV and JSON export/import endpoints and UI
- Build/test: Vitest / Playwright for E2E tests

## Data model (high-level entities)
- Player (player_id, name, alias, contact, season_registered boolean, season_payment records)
- Season (season_id, name, start/end dates, scoring configuration, number_of_events)
- Tournament (tournament_id, season_id, date, buy_in_amount, starting_stack, clock_template_id, chip_template_id, registration_open boolean)
- Entry (entry_id, tournament_id, player_id, seat, chip_count, finish_position, KOs, payment_status)
- Payment (payment_id, player_id, season_id?, tournament_id?, amount, method, date, txn_reference, admin_id, notes)
- ChipTemplate (template_id, name, denominations[])
- ClockTemplate (template_id, name, levels[], breaks[])
- Table (table_id, tournament_id, seats[], current_button_seat)
- EventLog (log_id, timestamp, admin_id|system, kind, payload)

## Local storage & backup
- Primary local persistence on client: IndexedDB (Dexie). Keep a single source-of-truth DB per device.
- Export/backup: JSON and CSV export of full DB or selected tables (players, tournaments, payments, logs) for manual backup or importing into another device.
- Migration plan: version the DB schema and ship migration routines.

## Sync & multi-device usage (optional)
- Local-only mode (no sync): the PWA is fully functional on a single device. Use export/import to move data between devices.
- LAN-hosted mode: run Node/Express + SQLite on a MacBook acting as host; clients (iPad) connect to the host URL on the same Wi‑Fi to sync or post results. Authentication can be simple (shared PIN) for local networks.
- Realtime mode: optional WebSocket endpoint on the host to push level changes, table moves, and leaderboard updates to connected clients.
- Peer-to-peer: WebRTC data channel can be used for direct browser-browser sync when needed (more complex to implement and test).

## Security & authentication
- Local-first default: no external auth required. Use a simple admin PIN or passphrase stored locally (hashed) for admin actions.
- For LAN-hosted mode, require a short-lived access token (entered on client) or a shared passphrase. TLS is recommended if clients access host via IP on untrusted networks.
- Sanitize inputs for CSV/JSON import and treat imports as admin-only actions.

## Offline & reliability strategy
- All core flows (register player, mark payment, run clock, record results, export logs) must work fully offline.
- Service Worker and IndexedDB enable offline UI and queued writes. If a server is configured, queued writes are synchronized when a connection is available.
- Implement conflict resolution rules for sync (last-write-wins for administrative changes, with audit log; for scoring/tournament results prefer admin confirmation on conflicts).

## UX and operational considerations
- Responsive design tuned for touch (iPad) and mouse/keyboard (Mac).
- Big touch targets for tournament run-view (clock, next level, break, table moves).
- Low-latency local UI for live runs — avoid heavy network round trips during active play.
- Exportable receipts and printable tables/chip lists (desktop Electron can enable direct printing/printer drivers).

## Development & deployment options
- Local dev: run `npm run dev` (Vite) on a dev machine; access from iPad via local network IP if needed.
- Local host deployment: provide a single-command script to start the local server and serve the built PWA and the optional REST API (e.g., `npm run serve-local`).
- Desktop packaging: Electron build for Mac (`electron-builder`) to produce a signed app or a development-only bundle.
- Hosted deployment (optional): host the backend and static client on a cloud provider for remote access. This is optional and can be added if the group wants centralized historic data.

## API surface (recommended minimal endpoints for local server)
- GET /api/season/:id
- POST /api/season
- GET /api/players
- POST /api/player
- GET /api/tournament/:id
- POST /api/tournament
- POST /api/tournament/:id/result (upload results CSV / record placements)
- GET /api/leaderboard/:season_id
- POST /api/sync/changes (for queued client sync)
- GET /api/templates/chips
- GET /api/templates/clock
- POST /api/export (request server-side CSV/JSON bundle)

## Acceptance criteria (technical)
- PWA runs on iPad Safari and can be installed to home screen. Core offline flows (roster, register players, run clock, record results) function while offline.
- Local persistence: data persists across app restarts using IndexedDB and supports export/import of JSON/CSV.
- Single-entry tournament rules, participant/payment tracking, chip/clock templates, table balancing, scoring/leaderboard functions implemented and testable locally.
- Optional Mac desktop Electron wrapper can bundle the PWA and provide a local server mode and printing/export conveniences.
- LAN-hosted sync mode (optional): a Mac-hosted Node server can accept connections from iPads on the same Wi‑Fi for centralization and realtime updates.

## Migration & testing plan
- Start with a minimal PWA skeleton and IndexedDB schema for Season, Player, Tournament, Entry, Payment, Templates, and EventLog.
- Implement unit tests for DB migrations and core scoring logic (Vitest). Implement an E2E test with Playwright for the run-view and leaderboard.
- Add manual QA checklist for running a live local event: registration, payments, starting stacks, saving templates, running clock, table balancing, recording results, and exporting reports.

## Next steps (recommended implementation roadmap)
1. Scaffold repo: Vite + React + TypeScript + Vite PWA plugin + Dexie + React Query.
2. Implement data model and IndexedDB schema with migration tests.
3. Build the minimal CRUD UI for players and seasons and implement local export/import.
4. Implement tournament setup (chip/clock templates) and run view with authoritative local clock.
5. Add table balancing and run-mode logs.
6. (Optional) Build a tiny Node/Express local server with SQLite and WebSocket support for LAN-hosted mode.
7. (Optional) Package an Electron build for Mac that bundles the PWA and the local server.

---

Last updated: 2026-01-26
