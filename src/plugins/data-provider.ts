import { getBackend, getBackendType } from '../db/get-backend'
import type { QueryOptions } from '../db/backend'
import type { OpenMCT } from 'openmct'

export type Datum = {
  key: string
  value: number
  /** Unix timestamp in ms */
  timestampMs: number
}

/** A single value→label mapping for an `enum`-formatted telemetry signal. */
export type Enumeration = {
  value: number
  string: string
}

export type DataKey = {
  key: string
  /**
   * Minimum x-axis gap (ms) treated as a data break in plots.
   * 0 disables gap detection.
   */
  gapThreshold: number
  /** Human-readable label shown in the UI. Defaults to {@link key}. */
  name?: string
  /** Engineering unit string, e.g. `"V"`, `"m"`, `"C"`, `"m/s"`. */
  unit?: string
  /**
   * OpenMCT formatter id or printf-style format string.
   * Examples: `"float"` (default), `"enum"`, `"%.2f"`, `"%.1f"`, `"%.0f"`.
   */
  format?: string
  /** Expected lower bound — drives plot autoscaling / gauges. */
  min?: number
  /** Expected upper bound — drives plot autoscaling / gauges. */
  max?: number
  /** Value→label mappings for `format: "enum"` signals. */
  enumerations?: Enumeration[]
}

export interface DataSource {
  /**
   * Returns every key this source may emit, with per-key plot metadata.
   * @returns array of data key descriptors
   */
  allKeys(): DataKey[]

  /**
   * Start producing data. Calls `onData` for each new datum.
   * @param onData callback invoked for every new datum
   */
  subscribe(onData: (data: Datum) => void): void
}

export const NAMESPACE = 'nick'

type OpenMCTDatum = {
  utc: number
  value: number
}

/** One entry in a domain object's `telemetry.values[]` array. */
type TelemetryValue = {
  key: string
  name: string
  format: string
  hints: { range?: number; domain?: number }
  gapThreshold?: number
  unit?: string
  min?: number
  max?: number
  enumerations?: Enumeration[]
}

/** Build per-key telemetry value descriptors, embedding gapThreshold on the range value. */
function telemetryValues(dataKey: DataKey): TelemetryValue[] {
  const value: TelemetryValue = {
    key: 'value',
    name: dataKey.name ?? 'Value',
    format: dataKey.format ?? 'float',
    hints: { range: 1 },
    gapThreshold: dataKey.gapThreshold,
  }
  if (dataKey.unit !== undefined) value.unit = dataKey.unit
  if (dataKey.min !== undefined) value.min = dataKey.min
  if (dataKey.max !== undefined) value.max = dataKey.max
  if (dataKey.enumerations !== undefined) value.enumerations = dataKey.enumerations

  return [
    value,
    { key: 'utc', name: 'Timestamp', format: 'utc', hints: { domain: 1 } },
  ]
}

function toOpenMCTDatum(d: {
  timestampMs: number
  value: number
}): OpenMCTDatum {
  return { utc: d.timestampMs, value: d.value }
}

/** Keys eagerly registered via {@link registerDataSource}. */
const registeredKeys = new Map<string, DataKey>()

/** Per-key subscriber sets for OpenMCT realtime subscriptions. */
const keySubscribers = new Map<string, Set<(datum: OpenMCTDatum) => void>>()

/**
 * Registers a data source's keys so OpenMCT can resolve their objects,
 * and starts its subscription to insert and forward live data.
 *
 * @param source  the data source to register
 */
export function registerDataSource(source: DataSource): void {
  for (const dataKey of source.allKeys()) {
    registeredKeys.set(dataKey.key, dataKey)
  }

  source.subscribe((datum: Datum) => {
    getBackend()
      .then((backend) =>
        backend.insertTelemetry(datum.key, datum.timestampMs, datum.value)
      )
      .catch(console.error)

    const subscribers = keySubscribers.get(datum.key)
    if (subscribers) {
      const mapped = toOpenMCTDatum(datum)
      for (const cb of subscribers) {
        cb(mapped)
      }
    }
  })
}

/**
 * Registers keys so OpenMCT can resolve their objects without starting
 * a live data subscription. Use this when the backend does not produce
 * local data (e.g. InfluxDB) but the layout still references these keys.
 *
 * @param keys  the data key descriptors to register
 */
export function registerDataSourceKeys(keys: DataKey[]): void {
  for (const dataKey of keys) {
    registeredKeys.set(dataKey.key, dataKey)
  }
}

export function DataProviderPlugin(openmct: OpenMCT) {
  openmct.types.addType(`${NAMESPACE}.telemetry`, {
    name: 'NICK Telemetry Point',
    description: 'A telemetry measurement from the NICK',
    cssClass: 'icon-telemetry',
  })

  openmct.objects.addProvider(NAMESPACE, {
    get(identifier: { namespace: string; key: string }) {
      const dataKey = registeredKeys.get(identifier.key)
      if (!dataKey) return Promise.resolve(undefined)
      return Promise.resolve({
        identifier,
        name: dataKey.name ?? identifier.key,
        type: `${NAMESPACE}.telemetry`,
        location: `${NAMESPACE}:root`,
        telemetry: { values: telemetryValues(dataKey) },
      })
    },
  })

  openmct.telemetry.addProvider({
    supportsRequest(domainObject: { identifier: { namespace: string } }) {
      return domainObject.identifier.namespace === NAMESPACE
    },

    async request(
      domainObject: { identifier: { key: string } },
      options: { start: number; end: number; strategy?: string; size?: number }
    ) {
      const key = domainObject.identifier.key
      const queryOpts: QueryOptions = {}
      if (options.strategy === 'minmax' || options.strategy === 'latest') {
        queryOpts.strategy = options.strategy
      }
      if (options.size) {
        queryOpts.size = options.size
      }
      const backend = await getBackend()
      const data = await backend.queryTelemetry(
        key,
        options.start,
        options.end,
        queryOpts
      )
      return data.map(toOpenMCTDatum)
    },

    supportsSubscribe(domainObject: { identifier: { namespace: string } }) {
      if (getBackendType() === 'influxdb') return false
      return domainObject.identifier.namespace === NAMESPACE
    },

    subscribe(
      domainObject: { identifier: { key: string } },
      callback: (datum: OpenMCTDatum) => void
    ): () => void {
      const key = domainObject.identifier.key
      if (!keySubscribers.has(key)) {
        keySubscribers.set(key, new Set())
      }
      // Always present — just ensured above
      const subscribers = keySubscribers.get(key)!
      subscribers.add(callback)
      return () => {
        subscribers.delete(callback)
      }
    },
  })
}
