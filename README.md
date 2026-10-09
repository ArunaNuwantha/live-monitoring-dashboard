# Live Monitor: real-time monitoring dashboard

A real-time service-monitoring dashboard built with **React 19 + TypeScript + Vite**, structured with **clean architecture**. It stays smooth at **15,000 events/s** with bounded memory, treats every streamed byte as untrusted, and recovers from dropped connections on its own.

```bash
npm install
npm run dev        # → http://localhost:5173  (built-in simulated stream, no backend needed)
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with the simulated live feed |
| `npm test` | Vitest + React Testing Library (62 tests) |
| `npm run bench` | Hot-path timings (ingest, publish, derive) |
| `npm run lint` / `npm run typecheck` | ESLint (incl. architecture rules) / `tsc -b` |
| `npm run build` && `npm run preview` | Production build, served with a strict CSP |
| `npm run mock:server` | Local WebSocket feed on `ws://localhost:8787` |

Requires Node 20.19+ or 22.12+ (Vite 8 requirement; developed on Node 24).

---

## 1. Configuration

Copy `.env.example` to `.env.local`. **Every `VITE_*` value is bundled into the client, so it is public. No secrets go here.**

| Variable | Default | Purpose |
|---|---|---|
| `VITE_STREAM_MODE` | `simulated` | `simulated` or `websocket` |
| `VITE_SIM_RATE` | `200` | Simulated events/s (1–20,000). Also adjustable live in **Stream settings** |
| `VITE_STREAM_URL` | none | WebSocket URL. `wss://` only, except `ws://` on localhost. Credentials in the URL are rejected |
| `VITE_STREAM_TOKEN_URL` | none | Optional **same-origin** endpoint returning `{"token":"…"}` (cookie session) |
| `VITE_DEBUG` | `false` | Logs fixed diagnostic codes (never payloads or tokens) |

An invalid stream URL falls back to the simulated feed and shows a visible warning banner.

**Real WebSocket mode:**

```bash
npm run mock:server                      # terminal 1 (RATE=2000 npm run mock:server for more load)
VITE_STREAM_MODE=websocket VITE_STREAM_URL=ws://localhost:8787 npm run dev   # terminal 2
```

The mock server drops every client every 45–75 s, so reconnection gets exercised.

---

## 2. Architecture

Dependencies point **inward only**. ESLint enforces this (`no-restricted-imports` per layer in `eslint.config.js`), so a violation fails lint instead of slipping through review.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ presentation/   React: components, hooks, context, styles                    │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │ infrastructure/   adapters: SimulatedTransport, WebSocketTransport,  │   │
│   │                   config, logger, createServices (composition root)  │   │
│   │   ┌──────────────────────────────────────────────────────────────┐   │   │
│   │   │ application/   use cases + ports: LiveFeed, ConnectionManager, │   │   │
│   │   │                IngestPipeline, RingBuffer, TimeBuckets, ports  │   │   │
│   │   │   ┌──────────────────────────────────────────────────────┐   │   │   │
│   │   │   │ domain/   entities + pure rules: event types,         │   │   │   │
│   │   │   │           validate (untrusted → trusted), metrics     │   │   │   │
│   │   │   └──────────────────────────────────────────────────────┘   │   │   │
│   │   └──────────────────────────────────────────────────────────────┘   │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Layer | Knows about | Never imports |
|---|---|---|
| `domain/` | nothing | React, browser APIs, any outer layer |
| `application/` | domain, its own **ports** (`StreamTransport`, `Logger`) | React, concrete transports |
| `infrastructure/` | application + domain | React/UI |
| `presentation/` | everything, via **context injection** (no singletons) | n/a |

`main.tsx` is the **composition root**. It reads config, picks a transport adapter, builds the `LiveFeed`, and hands it to React through `ServicesProvider`. Swapping the simulated feed for WebSocket (or SSE) is a new adapter implementing `StreamTransport`; nothing else changes. Tests use the same seam with a `FakeTransport`.

### Mapping to the suggested structure

| Suggested | Here | Why it moved |
|---|---|---|
| `types/event.ts` | `domain/event.ts` | Entities belong to the domain |
| `utils/validate.ts` | `domain/validate.ts` | Validation is a business rule, not a utility |
| `utils/helpers.ts` | `domain/metrics.ts`, `presentation/format/` | Pure derivations vs. display formatting are different concerns |
| `services/streamClient.ts` | `application/LiveFeed.ts` + `ConnectionManager.ts` + `infrastructure/transports/*` | Split into the use case (what) and the adapters (how) |
| `hooks/useLiveStream.ts` | `presentation/hooks/useLiveStream.ts` | Same, plus `useFeedData` / `useStore` selector hooks |
| `components/*.tsx` | `presentation/components/*.tsx` | Same names: `KpiCards`, `LiveChart`, `EventsList`, `ConnectionBar`, `Loading` |

### Data flow

```
transport ─raw frame→ ConnectionManager ─→ IngestPipeline ── O(1) per frame ──┐
 (WS / sim)            (state machine,      rate-limit → validate →            │
                        backoff, watchdog)  RingBuffer + TimeBuckets           │
                                                                               ▼
React widgets ←─ useSyncExternalStore(selector) ←─ LiveFeed.flush() every N ms (default 250)
                                                   publishes ONE immutable snapshot
```

`LiveFeed` exposes four small observable stores, each consumed with `useSyncExternalStore` plus a selector, so each widget re-renders only when **its slice** changes:

| Store | Changes | Consumers |
|---|---|---|
| `data` | once per flush (frozen while paused) | KPIs, charts, events list |
| `health` | once per flush (even while paused) | footer stats, "last event 2s ago", paused backlog |
| `connection` | only on state transitions | status pill, banners, buttons |
| `control` | on pause/resume and settings changes | pause button, settings panel |

`App.tsx` subscribes to **none** of them. It holds only filter state, so the page shell never re-renders because of streaming data.

---

## 3. Real-time handling

The connection lifecycle is an explicit state machine (`application/ConnectionManager.ts`):

```
idle → connecting → live ⇄ reconnecting → error (manual “Retry”)
                      ↑ paused is layered on top of live (UI status), not a transport state
```

- **Exponential backoff with equal jitter** (0.5 s → 30 s cap). Clients spread out and never retry in a tight loop.
- **Retry budget** (8 attempts) then `error` with a visible "Retry" button. **Auth and protocol failures are fatal**: no retry loop with a bad token.
- **Anti-flapping**: the retry counter resets only after a connection has been **stable for 5 s**. A connection that opens and immediately drops keeps backing off.
- **Connect timeout** (8 s) and a **stale watchdog**: a "live" socket that goes silent for 10 s is treated as dead. A half-open connection can't freeze the UI silently.
- **Generation guard**: callbacks from superseded connections are ignored, so there are no races between an old socket's late `close` and a new one.
- The browser's `online` event triggers an immediate retry.
- **Visible indicator**: status pill (Connecting / Live / Paused / Reconnecting / Offline), retry countdown, attempt counter, time since the last event.

**Pause semantics.** Pause freezes the *view*, not the *pipeline*. Ingest continues into the bounded buffers, a banner shows "N new events buffered", and Resume publishes the latest snapshot immediately. Totals stay correct and nothing goes stale. While paused, the dashboard is a consistent point-in-time snapshot: filters still work against it.

---

## 4. Performance

| Technique | Where | Effect |
|---|---|---|
| **Batching / throttling**: ingest is synchronous and cheap; React is notified at most once per flush interval (configurable 100 ms–1 s) | `LiveFeed` | Render rate is independent of message rate |
| **Pre-aggregated time buckets** (per second × severity, typed arrays, 15 min ring) | `TimeBuckets` | KPIs and charts cost O(window seconds), not O(events) |
| **Selector subscriptions** (`useSyncExternalStore`) + `React.memo` + primitive props | hooks, components | A widget re-renders only when its displayed values change |
| **Isolated tickers**: "last event Xs ago", retry countdown, FPS, backlog are leaf components | `ConnectionBar`, `PerfFooter` | Per-second ticks don't re-render parents |
| **Canvas chart driven imperatively** (uPlot `setData`), cursor readout written to the DOM | `LiveChart` | No VDOM diff or SVG nodes per point; hover never re-renders React |
| **Virtualized list** (fixed row height, overscan, rAF-coalesced scroll) | `useVirtualRows` | ~20 DOM rows whether the buffer holds 1k or 50k events |
| **Scroll anchoring**: when reading older events, prepended rows don't shift the view (binary search on `seq`) | `EventsList` | Stable reading under live updates |
| **Early-exit filtering**: list is newest-first, so the window scan stops at the first old event | `filterEvents` | Window filtering is O(visible) |
| **`useDeferredValue`** for search | `EventsList` | Typing stays responsive under load |
| **Bounded memory**: `RingBuffer` (configurable 1k–50k), fixed-size bucket ring | application | Memory is flat for any duration and rate |
| **Load shedding**: per-second ingest ceiling (20k) drops excess frames *before* `JSON.parse` | `IngestPipeline` | A flood can't monopolize the main thread |
| Heartbeat publishes reuse the previous `events` array | `LiveFeed` | Idle seconds don't re-filter the list |

### Measurements

**Hot path** (`npm run bench`, Node 24, Apple Silicon; your numbers will differ):

| Operation | Time |
|---|---|
| Ingest 100k frames (parse + validate + store) | 75 ms → **0.75 µs/frame** (~1.3M frames/s capacity) |
| Publish: copy 5k-event buffer | 0.024 ms |
| Publish: copy 50k-event buffer | 0.62 ms |
| Publish: time-bucket snapshot (901 s × 4) | 0.12 ms |
| Derive: KPI summary, 15 min window | 0.09 ms |
| Derive: chart data, 15 min window | 0.13 ms |
| Derive: filter 5k events + text query | 0.24 ms |

**In the browser** (headless Chromium, simulated feed set to 15,000 events/s with fault injection on, read from the on-page diagnostics footer):

| | 200 events/s | 15,000 events/s |
|---|---|---|
| Ingest | 200/s | 15K/s |
| React publishes | 4/s | **4/s** |
| Frame rate | 60 FPS | **60 FPS** |
| Event buffer | grows to cap | **pinned at 5,000 / 5,000** (≈84K evicted in 6 s) |
| Malformed frames | rejected, counted | ≈380 rejected, no errors |

**Before/after batching.** A naive "setState per message" design commits once per message: 15,000 React commits/s at this load. The render-budget test (`Dashboard.test.tsx`) pushes 2,000 messages in one second and asserts the KPI row commits **≤ 4 times** (one per flush). That is 500× fewer commits, and the count is enforced in CI, not just measured once.

The diagnostics footer (Ingest · UI updates · FPS · Buffer · Evicted · Rejected · Shed) is always visible, so these numbers can be checked live during review. Use **Stream settings → Simulated load** to stress it.

---

## 5. Security

| Concern | Implementation |
|---|---|
| **Untrusted input** | Every frame goes through `domain/validate.ts`: size cap (8 KB) checked before `JSON.parse`; non-text/binary frames rejected; schema allow-list (`id`, `ts`, `service`, `severity`, `latencyMs`, `message`); type, range and pattern checks; result is a **fresh object**, so extra keys never flow through |
| **Prototype pollution** | Fields read with `Object.hasOwn` only; no spreading or merging of parsed input; `__proto__` payloads are tested |
| **XSS** | Stream text is rendered **only** as React text children/attributes (auto-escaped). `dangerouslySetInnerHTML` and `innerHTML` are banned by ESLint rules. The chart readout uses `textContent`. A test asserts that an `<img onerror>` / `<script>` payload renders as inert text, and fault-injection mode streams such payloads continuously |
| **Text spoofing** | Control characters, zero-width characters and **Unicode bidi overrides** ("Trojan Source") are stripped; length is capped on code-point boundaries |
| **Key collisions** | Source ids are untrusted and may repeat, so React keys use a client-assigned `seq` |
| **Clock abuse** | Timestamps more than 5 min from the client clock are replaced; windows and buckets use the client receive time |
| **No secrets in the client** | Nothing secret in env or code. Optional token comes from a same-origin endpoint (cookie session), is held **in memory for one connect**, sent as the **first socket frame (never in the URL)**, and never logged |
| **Transport hardening** | `wss://` required (plain `ws://` only for localhost); URLs with embedded credentials rejected; token endpoint must be same-origin |
| **Resilience against floods and flapping** | Bounded ring buffer, per-second ingest ceiling with load shedding, backoff with jitter, retry budget, stability window before resetting retries, connect timeout, stale watchdog |
| **No leaky errors or logs** | UI errors are generic ("Connection lost"); the logger accepts fixed codes only, is off by default, and never logs per message (a flood of bad frames must not become a flood of console output) |
| **CSP and headers** | `npm run preview` serves a strict CSP (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `connect-src` limited to the stream origin), `nosniff`, `no-referrer`, and a Permissions-Policy. Mirror these on the production server. Not applied in `vite dev` because Fast Refresh injects an inline script |
| **Supply chain** | One runtime dependency besides React (`uplot`, zero transitive dependencies); source maps disabled in production |

---

## 6. Edge cases covered

| Case | Behaviour |
|---|---|
| Empty feed / first load | Skeleton KPIs and "Connecting to live feed…" spinners. Once connected with no data: "Waiting for the first event" |
| Filters match nothing | Explanatory empty state with **Reset filters** |
| Malformed or hostile frames | Rejected and counted ("Rejected" in footer); stream continues |
| Burst / flood | Batching keeps renders constant; ring buffer evicts; load shedding above 20k frames/s |
| Dropped connection | Reconnecting with countdown + attempt n/8; last data stays visible |
| Silent (half-open) connection | Watchdog detects within 10 s and reconnects |
| Flapping connection | Backoff keeps growing until a connection is stable for 5 s |
| Gave up / auth failure | Offline banner + **Retry**; no retry storm |
| Paused | View frozen, backlog counted, filters still work, Resume catches up instantly |
| Network back online | Immediate retry |
| Reading older events while live | Scroll anchoring keeps the row in view; "N newer" button jumps to the top |
| React StrictMode double-mount | `start`/`stop` are idempotent; superseded connections are ignored |

---

## 7. Tests

`npm test` runs 62 tests in about 1 s:

- **Domain**: validation (malformed JSON, wrong types, oversized frames, `__proto__`, bidi stripping, timestamp clamping, code-point-safe truncation), KPI/chart math, filtering, binary search.
- **Application**: ring buffer bounds (1M pushes), backoff curve, connection state machine (backoff timing, give-up, flapping, stability reset, fatal auth, connect timeout, stale watchdog, late-callback guard, stop), `LiveFeed` batching, heartbeat, eviction, load shedding, rejection counts, unique keys, settings clamping, pause/resume.
- **Presentation**: XSS payload renders as text, empty state and reset, virtualization bound (3,000 events → under 40 DOM rows), **render budget under load**, connection bar transitions.

---

## 8. Libraries and why

| Library | Why |
|---|---|
| `uplot` (~50 KB, no transitive dependencies) | Canvas time-series built for streaming. Charting libraries that render SVG through React diff thousands of nodes per update; uPlot redraws a canvas from typed arrays in under 1 ms |
| `vitest`, `@testing-library/react`, `jsdom` (dev) | Native Vite test runner; RTL tests behaviour, not implementation |
| `ws` (dev) | Only for the local mock WebSocket server |

**Deliberately not used:**
- **A state library** (Redux/Zustand). The live data already lives in a framework-agnostic store; `useSyncExternalStore` is React's own primitive for exactly this. UI state (filters) is a `useReducer`.
- **A virtualization library.** With fixed row heights the windowing logic is about 40 lines, and owning it made scroll anchoring for prepended rows straightforward.

## 9. Design notes

- Colour carries meaning only together with an icon and a label (severity badges, chips, status pill), so severity reads correctly for colour-blind users.
- Status colours are reserved for severity and state; chart series use separate categorical colours.
- Throughput and latency are **two small-multiple charts with a shared crosshair** rather than one dual-axis chart, because their scales differ by orders of magnitude.
- Light and dark themes follow the OS (`prefers-color-scheme`, overridable with `data-theme`). The canvas chart re-reads its colour tokens when the scheme changes.
- Responsive from 360 px phones to wide desktops; `prefers-reduced-motion` disables animation.

## 10. Trade-offs and next steps

- **Parse in a Web Worker** at sustained rates above ~50k frames/s. The pipeline is already isolated behind `ingest()`, so it could move to a worker that posts batched snapshots.
- **Server-side aggregation** for long time windows. The client keeps 15 minutes of per-second buckets by design.
- Variable-height rows (expanded event details) would need measured virtualization.
- Playwright E2E tests for reconnect flows in a real browser.
