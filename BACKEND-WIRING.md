# Backend Wiring — Current Dummy-Data Architecture & Path to Real Data

This document describes, in full, how NICK currently produces, stores, and
displays telemetry — all of which runs on **generated dummy data** — and what
work remains to wire the app to a real ground station for live flight data.

Terminology used below (from the code comments): **Layer A** is everything in
this repo — the OpenMCT UI, the telemetry catalog, and the storage backends.
**Layer B** is the not-yet-existing ground-station backend: the process that
talks to the LoRa radio, decodes/encodes VLP packets, and exposes them to the
browser.

---

## 1. Architecture today (all data is fake)

```
┌────────────────────────────── Browser (NICK) ──────────────────────────────┐
│                                                                            │
│  FakeDataGenerator ─┐                                                      │
│  (sine wave, 20 ms) │        registerDataSource()                          │
│                     ├──► data-provider.ts ──┬──► TelemetryBackend.insert   │
│  RocketTelemetry-   │    (Datum fan-out)    │    (DuckDB-WASM, OPFS)       │
│  Generator          │                       │                             │
│  (all ~200 rocket   │                       └──► live subscriber fan-out   │
│  signals, 500 ms)  ─┘                            (OpenMCT plots/consoles)  │
│                                                                            │
│  OpenMCT views ──► telemetry.request() ──► TelemetryBackend.query          │
│                                            (DuckDB local │ InfluxDB HTTP)  │
│                                                                            │
│  Uplink consoles ──► sendUplink() ──► setTimeout + Math.random  ◄── STUB   │
└────────────────────────────────────────────────────────────────────────────┘
```

There is **no network path to a rocket or ground station anywhere**. Every
datum on screen originates from `setInterval` loops inside the browser, and
every uplink "ACK" is a random number.

---

## 2. The dummy-data components

### 2.1 `RocketTelemetryGenerator` — `src/sources/rocket-telemetry.ts`

The main fake source. Every 500 ms (`TICK_MS`) it emits one datum for **every
signal in the rocket catalog** (`ROCKET_SIGNALS`, the flattened
`ROCKET_TREE`):

- Numeric signals sweep a sine wave inside their declared `[min, max]`.
- Boolean signals sit mostly `TRUE`, dipping `FALSE` out of phase per signal.
- Enum signals cycle through their enumeration values every 3 s.

This is what populates the Downlink Console, the Send Uplink readback badges,
the Rocket Telemetry tree plots — everything.

### 2.2 `FakeDataGenerator` — `src/sources/fake-data-generator.ts`

The original demo source: a 20 ms sine wave alternating between two keys
(`vl_battery_v_gps` / `vl_battery_v_received`) every 2 s, to demonstrate the
measured-vs-received timestamp convention on the Avionics Dashboard overlay
plot.

### 2.3 `sendUplink()` stubs — two copies

| Location                         | Used by                                      |
| -------------------------------- | -------------------------------------------- |
| `src/plugins/uplink-console.tsx` | Send Uplink Console (the newer, typed panel) |
| `src/plugins/uplink-panel.tsx`   | Send Uplink panel on the Avionics Dashboard  |

Both fake the ground-station round trip: 700 ms latency, ~20 % simulated
"No ACK received (link timeout)" failure (so the retry UI is exercisable), and
a randomized ACK `{ rssi, snr }`. Commands are logged to `console.debug` and go
nowhere. The typed command model both should share lives in
`src/plugins/uplink-command.ts` (`UplinkCommand`, mirroring the firmware's
`VLPUplinkPacket` variants) — but `uplink-panel.tsx` predates it and still
carries its own duplicate copy of the command/enum catalogs.

### 2.4 Registration — `src/main.ts`

```ts
if (getBackendType() === 'duckdb') {
  registerDataSource(new FakeDataGenerator())
  registerDataSource(new RocketTelemetryGenerator())
} else {
  registerDataSourceKeys(FakeDataGenerator.allKeys())
  registerDataSourceKeys(RocketTelemetryGenerator.allKeys())
}
```

In DuckDB (local) mode the generators run and their output is persisted; in
InfluxDB (remote) mode only the **key metadata** is registered so the object
tree resolves, and all values come from whatever is already in the remote
bucket (i.e. previously uploaded fake data).

---

## 3. The infrastructure that is already real

These parts are production-shaped and should survive the wiring work
unchanged (they are the seams Layer B plugs into):

### 3.1 The `DataSource` contract — `src/plugins/data-provider.ts`

```ts
interface DataSource {
  allKeys(): DataKey[] // every key + plot metadata (unit, range, enum, gap)
  subscribe(onData: (d: Datum) => void): void // push live data
}
```

`registerDataSource(source)` does two things with every datum: (1) inserts it
into the active `TelemetryBackend`, and (2) fans it out to any OpenMCT
realtime subscribers for that key. **A real ground-station source only needs to
implement this interface and be registered in `main.ts`.**

### 3.2 The OpenMCT provider — `src/plugins/data-provider.ts`

- Object provider: resolves any registered key under the `nick` namespace with
  its `telemetry.values[]` metadata (format, unit, min/max, enumerations,
  gapThreshold).
- Telemetry provider: `request()` maps OpenMCT historical queries (including
  `minmax` decimation and `latest` strategies) onto
  `TelemetryBackend.queryTelemetry()`; `subscribe()` registers realtime
  callbacks (disabled in InfluxDB mode — see §4.4).

### 3.3 Storage backends — `src/db/`

| Backend           | File          | Notes                                                                                                                                                        |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DuckDBBackend`   | `duckdb.ts`   | DuckDB-WASM persisted to OPFS (`opfs://nick.db`), one table per key, 1 s `CHECKPOINT` loop. SQL lives in `duckdb-store.ts` (shared with Node tests). Tested. |
| `InfluxDBBackend` | `influxdb.ts` | InfluxDB 2.x over HTTP: line-protocol writes (single + 5000-row batches), Flux queries with `latest`/windowed min-max strategies. Tested via testcontainers. |

Backend selection is a `localStorage` flag read once at boot
(`get-backend.ts`); switching reloads the page.

### 3.4 The Data Source Switcher — `src/plugins/data-source-switcher.tsx`

Working UI for: switching DuckDB ⇄ InfluxDB (with connection test), editing
Influx credentials, batch-uploading local DuckDB data to Influx with a
last-upload watermark, and wiping local data. This is the intended
field-ops flow: record locally during flight, upload to the shared Influx
after.

### 3.5 The telemetry catalog — `src/sources/rocket-telemetry.ts`

The full signal dictionary transcribed from the previous Rust ground station
(`prev-rocket-cli`) and `OPENMCT_GROUND_STATION_DOWNLINK_TELEMETRY.md`:

- `uplink_*` keys — the Send Uplink command set modeled as signals
  (target apogee, five modes, 16 reset devices, AMP/EPS overwrites, pyros,
  local radio config).
- `gsd_*` keys — the Ground Station Downlink dictionary (link quality, GPS,
  flight dynamics, power/pyro, AMP, bulkheads, ICARUS, OZYS 1/2, EPS 1/2,
  avionics status, self-test results). Key suffixes match the Rust
  `TelemetryPacket::to_json()` field names.

`docs/TELEMETRY_KEYS.md` is generated from this catalog by
`scripts/gen-telemetry-keys.ts` so documentation cannot drift.

### 3.6 The consoles — already wired to live telemetry

Both the Send Uplink Console and the Downlink Console read their state through
the normal OpenMCT telemetry API (`request({ strategy: 'latest' })` to seed +
`subscribe()` for updates, via their `useLiveValues` hook). **They do not know
or care that the data is fake** — once real `gsd_*` data flows through the
provider, the consoles are done.

---

## 4. Work required to wire real data

### 4.1 Build/choose the ground-station backend (Layer B) — the prerequisite

Everything below assumes a host-side process that owns the LoRa radio
(the role `prev-rocket-cli` played) and exposes it to the browser. Decisions
to make:

- **Process**: reuse/extend the Rust CLI as a headless daemon vs. a new
  service. Packet encode/decode must come from `firmware-common-new`
  (`vlp::packets`), so a Rust process (or WASM build of that crate) avoids
  reimplementing the wire format.
- **Transport to the browser**: WebSocket (or SSE) for downlink push +
  HTTP POST for uplink commands is the natural fit for the existing seams.
- **Deployment**: same LAN as the browser; CORS and (if needed) auth for the
  field network; where InfluxDB runs in this picture.

### 4.2 Downlink path (real data display)

1. **Layer B**: on each received `VLPDownlinkPacket`, decode it and flatten it
   into `(key, value, timestampMs)` triples using the `gsd_*` dictionary —
   the flattening rules (booleans as 0/1, enums as their numeric values,
   fixed-point fields as floats) are exactly what the catalog already
   declares. Include the link-quality pseudo-signals (RSSI, SNR,
   `gsd_packet_type`, packet counters) which come from the LoRa
   `PacketStatus`, not the payload.
2. **NICK**: implement `GroundStationSource implements DataSource` —
   `allKeys()` returns `ROCKET_SIGNALS`; `subscribe()` opens the WebSocket and
   calls `onData` per triple. Reconnect/backoff logic lives here.
3. **Register it** in `main.ts` in place of `RocketTelemetryGenerator` (keep
   the generators behind a demo flag rather than deleting them — they are the
   only way to exercise the UI without hardware).
4. **Timestamps**: follow the existing two-key convention (AGENTS.md) — emit
   measured-timestamp keys (e.g. GPS time) and received-timestamp keys as
   separate signals where both exist.
5. Persistence and plot fan-out then come for free via
   `registerDataSource()` → DuckDB → OpenMCT.

### 4.3 Uplink path (real command transmit)

1. **Layer B**: an endpoint that accepts a JSON `UplinkCommand`, serializes it
   to the `VLPUplinkPacket` wire format, transmits, waits for the ACK, and
   returns the real `{ rssi, snr }` (or a timeout error).
2. **NICK**: create a single shared transport module (e.g.
   `src/plugins/uplink-transport.ts`) exporting the real
   `sendUplink(command: UplinkCommand): Promise<Ack>`; both consoles keep
   their existing resolve-Ack / reject-Error contract, so **only the stub
   bodies change**.
3. **Command echo (decide)**: the `uplink_*` tree keys are currently populated
   only by the fake generator. Decide whether the GS backend (or the browser,
   on ACK) writes sent commands into those keys so command history is
   plottable; otherwise they will be empty in real operation.
4. **Radio config**: Frequency/Power under `Send Uplink → Config` is local
   ground-station radio configuration, not an uplink packet — it needs its own
   small get/set endpoint on Layer B.

### 4.4 Realtime display in InfluxDB mode

`supportsSubscribe()` deliberately returns `false` when the backend is
InfluxDB, so remote mode is currently history-only (plots refresh on time
conductor ticks; the consoles' `useLiveValues` never update after seeding).
If live viewing in remote mode matters (e.g. mission control away from the
LAN), add either a polling subscribe in the provider or have Layer B fan the
WebSocket out to remote clients.

### 4.5 Firmware reconciliation (correctness of decoded values)

- `NODE_HEALTH_ENUM` and `NODE_MODE_ENUM` are marked **PROVISIONAL** — only
  one variant of each is confirmed. Reconcile order/values with
  `firmware-common-new::can_bus::messages::node_status` before real self-test
  packets are decoded, or statuses will display wrong labels.
- Verify every `gsd_*` fixed-point range in the catalog against the current
  firmware encode (the ranges drive plot autoscaling and min-max decimation).

### 4.6 Cleanup enabled by the wiring

- Retire `src/plugins/uplink-panel.tsx` (the Avionics Dashboard copy) or
  rebuild it on `uplink-command.ts` + the shared transport; today it
  duplicates the command model, catalogs, and stub.
- Replace the Avionics Dashboard's fake VL-battery demo plot with a real
  flight layout once real keys flow.
- Drop `FakeDataGenerator` or fold it into a demo-mode flag alongside
  `RocketTelemetryGenerator`.

---

## 5. Quick status matrix

| Component                                       | Status                              |
| ----------------------------------------------- | ----------------------------------- |
| Telemetry catalog (`uplink_*`, `gsd_*`)         | ✅ Real (2 enums provisional)       |
| OpenMCT object/telemetry provider               | ✅ Real                             |
| DuckDB local storage + queries                  | ✅ Real, tested                     |
| InfluxDB remote storage + queries + upload flow | ✅ Real, tested                     |
| Backend switcher UI                             | ✅ Real                             |
| Uplink & Downlink console UIs                   | ✅ Real (consume provider normally) |
| Telemetry values displayed                      | ❌ Fake (`setInterval` generators)  |
| Uplink transmit / ACK                           | ❌ Fake (random stub, ×2 copies)    |
| Ground-station backend (Layer B)                | ❌ Does not exist                   |
| Realtime updates in InfluxDB mode               | ❌ Intentionally disabled           |
