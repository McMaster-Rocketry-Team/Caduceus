/**
 * Ground Station Downlink Console.
 *
 * A live, packet-type-aware mirror of the previous ground-station CLI's downlink
 * display (`prev-rocket-cli/src/gs/downlink_packet_display.rs`). It renders the
 * same telemetry labels in the same order, grouped per packet type, with the
 * same two dynamic-styling behaviors:
 *
 *   - **change-flash**: discrete status fields flash orange and fade when their
 *     value changes (CLI `FieldWidget` highlight) — done in React via the
 *     `nick-flash` keyframe, since OpenMCT condition sets can't express
 *     "changed recently";
 *   - **value color**: AMP / EPS power-output status is colored gray (Disabled),
 *     green (PowerGood), or red (PowerBad). The same value-based coloring is
 *     also published as native OpenMCT Condition Sets (see
 *     `downlink-condition-sets.ts`) for use in Display Layouts.
 *
 * The layout follows the live `gsd_packet_type` ("Auto"), or a manually selected
 * packet type, so all five packet layouts can be inspected.
 */
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { NAMESPACE } from './data-provider'
import type { DataKey } from './data-provider'
import { ROCKET_SIGNALS } from '../sources/rocket-telemetry'
import {
  PACKET_LAYOUTS,
  ALL_DOWNLINK_KEYS,
  HEADER_KEYS,
} from './downlink-packets'
import type { DownlinkField, PacketLayout } from './downlink-packets'
import { mountReactInShadow } from './react-utils'
import type { OpenMCT } from 'openmct'

export const DOWNLINK_CONSOLE_NAMESPACE = 'downlink-console'
export const DOWNLINK_CONSOLE_TYPE = `${NAMESPACE}.downlink-console`
const DOWNLINK_CONSOLE_ROOT_KEY = 'console'

const SIGNAL_BY_KEY = new Map(ROCKET_SIGNALS.map((s) => [s.key, s]))

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function decimalPlaces(dk: DataKey): number | undefined {
  const match = dk.format?.match(/%\.(\d+)f/)
  return match ? Number(match[1]) : undefined
}

/** Format a numeric value with its catalog decimals + unit (no spurious unit). */
function formatValue(dk: DataKey | undefined, val: number | undefined): string {
  if (val === undefined || Number.isNaN(val)) return '—'
  if (!dk) return String(val)
  const dp = decimalPlaces(dk)
  const num = dp !== undefined ? val.toFixed(dp) : String(val)
  const unit = dk.unit && dk.unit !== 'count' ? dk.unit : ''
  return `${num}${unit}`
}

function enumLabel(dk: DataKey | undefined, val: number | undefined): string {
  if (val === undefined || Number.isNaN(val)) return '—'
  return dk?.enumerations?.find((en) => en.value === val)?.string ?? String(val)
}

/** Value-color for a power-output status value (Disabled/PowerGood/PowerBad). */
function powerStatusColor(status: number | undefined): string {
  switch (status) {
    case 1:
      return 'text-green-600 dark:text-green-400'
    case 2:
      return 'text-red-500'
    case 0:
      return 'text-gray-400 dark:text-gray-500'
    default:
      return ''
  }
}

type Values = Record<string, number | undefined>

/** Resolve a field to its label, a change-detection key, and rendered value. */
function fieldView(
  field: DownlinkField,
  values: Values
): { label: string; changeKey: string; highlight: boolean; node: ReactNode } {
  switch (field.kind) {
    case 'value': {
      const text = formatValue(SIGNAL_BY_KEY.get(field.key), values[field.key])
      return { label: field.label, changeKey: text, highlight: field.highlight, node: text }
    }
    case 'bool': {
      const val = values[field.key]
      const text = val === undefined ? '—' : val === 1 ? 'T' : 'F'
      return { label: field.label, changeKey: text, highlight: field.highlight, node: text }
    }
    case 'enum': {
      const text = enumLabel(SIGNAL_BY_KEY.get(field.key), values[field.key])
      return { label: field.label, changeKey: text, highlight: field.highlight, node: text }
    }
    case 'powerStatus': {
      const status = values[field.statusKey]
      const overwrote = values[field.overwroteKey]
      const prefix = overwrote === undefined ? '' : overwrote === 1 ? 'overwrote, ' : 'auto, '
      const statusText = enumLabel(SIGNAL_BY_KEY.get(field.statusKey), status)
      return {
        label: field.label,
        changeKey: `${overwrote}:${status}`,
        highlight: field.highlight,
        node: (
          <>
            <span className="text-gray-400 dark:text-gray-500">{prefix}</span>
            <span className={powerStatusColor(status)}>{statusText}</span>
          </>
        ),
      }
    }
    case 'nodeStatus': {
      const health = enumLabel(SIGNAL_BY_KEY.get(field.healthKey), values[field.healthKey])
      const mode = enumLabel(SIGNAL_BY_KEY.get(field.modeKey), values[field.modeKey])
      const rebooted = values[field.rebootedKey] === 1 ? ' rebooted' : ''
      const text = `${health}, ${mode}${rebooted}`
      return { label: field.label, changeKey: text, highlight: field.highlight, node: text }
    }
  }
}

// ---------------------------------------------------------------------------
// Live values hook
// ---------------------------------------------------------------------------

type LiveDatum = { value: number }

/** Subscribe to a fixed set of telemetry keys; returns the latest value per key. */
function useLiveValues(openmct: OpenMCT, keys: string[]): Values {
  const [values, setValues] = useState<Values>({})

  useEffect(() => {
    const unsubscribers: Array<() => void> = []
    let cancelled = false

    const setValue = (key: string, value: number) =>
      setValues((prev) => ({ ...prev, [key]: value }))

    for (const key of keys) {
      const identifier = { namespace: NAMESPACE, key }
      openmct.objects.get(identifier).then((domainObject) => {
        if (cancelled || !domainObject) return

        openmct.telemetry
          .request(domainObject, { size: 1, strategy: 'latest' })
          .then((data: LiveDatum[]) => {
            const latest = data?.[data.length - 1]
            if (latest && !cancelled) setValue(key, latest.value)
          })
          .catch(() => {})

        const unsubscribe = openmct.telemetry.subscribe(
          domainObject,
          (datum: LiveDatum) => setValue(key, datum.value)
        )
        if (cancelled) unsubscribe()
        else unsubscribers.push(unsubscribe)
      })
    }

    return () => {
      cancelled = true
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [openmct, keys])

  return values
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/**
 * Renders a field value, flashing the background on change when `highlight`.
 * Keying the span by `changeKey` makes React remount it whenever the value
 * changes, which restarts the `nick-flash` CSS animation — no ref/state/effect
 * needed, and it stays still when the value is unchanged.
 */
function FlashCell({
  changeKey,
  highlight,
  children,
}: {
  changeKey: string
  highlight: boolean
  children: ReactNode
}) {
  if (!highlight) return <span>{children}</span>
  return (
    <span key={changeKey} className="nick-flash px-1">
      {children}
    </span>
  )
}

function Field({ field, values }: { field: DownlinkField; values: Values }) {
  const { label, changeKey, highlight, node } = fieldView(field, values)
  return (
    <span className="text-[11px] whitespace-nowrap">
      <span className="text-gray-400 dark:text-gray-500">{label}: </span>
      <FlashCell changeKey={changeKey} highlight={highlight}>
        {node}
      </FlashCell>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Console view
// ---------------------------------------------------------------------------

function DownlinkConsole({ openmct }: { openmct: OpenMCT }) {
  const values = useLiveValues(openmct, ALL_DOWNLINK_KEYS)
  const [selected, setSelected] = useState<'auto' | number>('auto')

  const livePacketType = values[HEADER_KEYS.packetType]
  const autoLayout = PACKET_LAYOUTS.find((l) => l.type === livePacketType)
  const layout: PacketLayout =
    selected === 'auto'
      ? (autoLayout ?? PACKET_LAYOUTS[0])
      : (PACKET_LAYOUTS.find((l) => l.type === selected) ?? PACKET_LAYOUTS[0])

  const rssi = formatValue(SIGNAL_BY_KEY.get(HEADER_KEYS.rssi), values[HEADER_KEYS.rssi])
  const snr = formatValue(SIGNAL_BY_KEY.get(HEADER_KEYS.snr), values[HEADER_KEYS.snr])
  const secondsSince = values[HEADER_KEYS.secondsSince]
  const noLivePacket = selected === 'auto' && autoLayout === undefined

  return (
    <div className="h-full overflow-y-auto text-gray-800 dark:text-gray-100 text-[12px] font-sans p-3.5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <p className="text-[13px] font-semibold">Ground Station Downlink</p>
        <select
          value={String(selected)}
          onChange={(e) =>
            setSelected(e.target.value === 'auto' ? 'auto' : Number(e.target.value))
          }
          className="rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-[11px] px-2 py-1 outline-none focus:border-blue-500"
        >
          <option value="auto">Auto (follow link)</option>
          {PACKET_LAYOUTS.map((l) => (
            <option key={l.type} value={l.type}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between text-[11px] border-b border-gray-200 dark:border-gray-700 pb-1.5 mb-2">
        <span>
          <span className="font-semibold">{layout.name}</span>
          <span className="text-gray-400 dark:text-gray-500">
            {'  '}rssi: {rssi} snr: {snr}
            {noLivePacket ? ' (no live packet)' : ''}
          </span>
        </span>
        <span className="text-gray-400 dark:text-gray-500 tabular-nums">
          {secondsSince !== undefined ? `${Math.round(secondsSince)}s ago` : '—'}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {layout.lines.map((line, i) => (
          <div key={i} className="flex flex-wrap gap-x-4 gap-y-0.5">
            {line.map((field, j) => (
              <Field key={j} field={field} values={values} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function DownlinkConsolePlugin(openmct: OpenMCT) {
  openmct.types.addType(DOWNLINK_CONSOLE_TYPE, {
    name: 'Ground Station Downlink Console',
    description:
      'Live downlink telemetry, grouped per packet type, mirroring the rocket-cli display',
    cssClass: 'icon-arrow-down',
  })

  openmct.objectViews.addProvider({
    key: `${DOWNLINK_CONSOLE_TYPE}.view`,
    name: 'Ground Station Downlink Console',
    cssClass: 'icon-arrow-down',

    canView(domainObject: { type: string }) {
      return domainObject.type === DOWNLINK_CONSOLE_TYPE
    },

    view(_domainObject: unknown) {
      let unmount: (() => void) | null = null

      return {
        show(element: HTMLElement) {
          unmount = mountReactInShadow(element, <DownlinkConsole openmct={openmct} />)
        },
        destroy() {
          unmount?.()
          unmount = null
        },
        priority() {
          return openmct.priority.HIGH
        },
      }
    },
  })

  openmct.objects.addRoot(
    { namespace: DOWNLINK_CONSOLE_NAMESPACE, key: DOWNLINK_CONSOLE_ROOT_KEY },
    openmct.priority.HIGH
  )

  openmct.objects.addProvider(DOWNLINK_CONSOLE_NAMESPACE, {
    get(identifier: { namespace: string; key: string }) {
      if (identifier.key === DOWNLINK_CONSOLE_ROOT_KEY) {
        return Promise.resolve({
          identifier,
          name: 'Ground Station Downlink Console',
          type: DOWNLINK_CONSOLE_TYPE,
          location: 'ROOT',
        })
      }
      return Promise.resolve(undefined)
    },
  })
}
