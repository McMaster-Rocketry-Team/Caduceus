/**
 * Generates TELEMETRY_KEYS.md from the live ROCKET_TREE so the documented keys
 * never drift from the catalog. Run: `node scripts/gen-telemetry-keys.ts`.
 */
import {
  ROCKET_TREE,
  BOOL_ENUM,
  FLIGHT_STAGE_ENUM,
  PACKET_TYPE_ENUM,
  POWER_OUTPUT_OVERWRITE_ENUM,
  POWER_OUTPUT_STATUS_ENUM,
} from '../src/sources/rocket-telemetry.ts'
import {
  VL_BATTERY_GPS,
  VL_BATTERY_RECEIVED,
} from '../src/sources/fake-data-generator.ts'
import type { TreeNode } from '../src/sources/rocket-telemetry.ts'
import type { DataKey, Enumeration } from '../src/plugins/data-provider.ts'

const ENUM_NAMES = new Map<Enumeration[], string>([
  [BOOL_ENUM, 'Bool'],
  [FLIGHT_STAGE_ENUM, 'FlightStage'],
  [PACKET_TYPE_ENUM, 'PacketType'],
  [POWER_OUTPUT_OVERWRITE_ENUM, 'PowerOutputOverwrite'],
  [POWER_OUTPUT_STATUS_ENUM, 'PowerOutputStatus'],
])

function typeOf(s: DataKey): string {
  if (s.enumerations) return s.enumerations === BOOL_ENUM ? 'boolean' : 'enum'
  return s.format === '%.0f' ? 'integer' : 'float'
}

function rangeOf(s: DataKey): string {
  if (s.enumerations || s.min === undefined || s.max === undefined) return '—'
  return `${s.min} … ${s.max}`
}

function enumOf(s: DataKey): string {
  if (!s.enumerations) return '—'
  return ENUM_NAMES.get(s.enumerations) ?? '—'
}

function row(s: DataKey): string {
  const unit = s.unit ? s.unit : '—'
  return `| \`${s.key}\` | ${s.name ?? s.key} | ${typeOf(s)} | ${unit} | ${rangeOf(s)} | ${enumOf(s)} |`
}

const out: string[] = []
let leafCount = 0

/** Emit a folder as a heading + (optional) signal table, then recurse. */
function emit(
  node: Extract<TreeNode, { kind: 'folder' }>,
  depth: number,
  path: string[]
) {
  const here = [...path, node.name]
  out.push('', `${'#'.repeat(depth)} ${here.join(' / ')}`)
  const signals = node.children.filter((c) => c.kind === 'signal')
  if (signals.length > 0) {
    out.push(
      '',
      '| Key | Name | Type | Unit | Range | Enum |',
      '|---|---|---|---|---|---|'
    )
    for (const c of signals) {
      if (c.kind === 'signal') {
        out.push(row(c.signal))
        leafCount++
      }
    }
  }
  for (const c of node.children) {
    if (c.kind === 'folder') emit(c, depth + 1, here)
  }
}

function enumTable(name: string, table: Enumeration[]): string {
  const lines = [`### ${name}`, '', '| Value | String |', '|---|---|']
  for (const e of table) lines.push(`| ${e.value} | ${e.string} |`)
  return lines.join('\n')
}

// ── Tree outline ───────────────────────────────────────────────────────────
function outline(nodes: TreeNode[], indent: string): string[] {
  const lines: string[] = []
  for (const n of nodes) {
    if (n.kind === 'folder') {
      lines.push(`${indent}${n.name}/`)
      lines.push(...outline(n.children, indent + '  '))
    }
  }
  return lines
}

const tree = outline(ROCKET_TREE, '  ')

// Build body first so leafCount is known for the header.
const body: string[] = []
for (const node of ROCKET_TREE) {
  if (node.kind === 'folder') {
    const saved = out.splice(0, out.length)
    emit(node, 2, ['Rocket Telemetry'])
    body.push(...out.splice(0, out.length))
    out.push(...saved)
  }
}

const header = `# Telemetry Key Dictionary

> **Generated file — do not edit by hand.** Regenerate with
> \`node scripts/gen-telemetry-keys.ts\` whenever \`src/sources/rocket-telemetry.ts\`
> changes. Keys are derived directly from \`ROCKET_TREE\`.

This is the authoritative list of every OpenMCT telemetry-object key. When wiring a
real telemetry-provider backend, each inbound sample must be emitted as a \`Datum\`:

\`\`\`ts
{ key: string, value: number, timestampMs: number }
\`\`\`

where \`key\` is **exactly** one of the keys below. The key is the only routing
identity: it selects the DuckDB table / InfluxDB measurement to persist into and the
set of OpenMCT objects to push the live value to. \`value\` is always a single number
(enums/booleans are sent as their numeric \`Value\`, decoded to a label via the enum
tables at the end).

- **${leafCount}** signal keys total, across **2** top-level directories.
- Keys are namespaced by directory: \`uplink_*\` (Send Uplink) and \`gsd_*\` (Ground
  Station Downlink). The \`gsd_\` suffix is the raw Rust JSON field name from
  \`OPENMCT_GROUND_STATION_DOWNLINK_TELEMETRY.md\`.
- **Type**: \`float\` / \`integer\` are numeric; \`boolean\` and \`enum\` are sent as a
  numeric value mapped to a string (see [Enumerations](#enumerations)).
- **Range**: declared \`[min, max]\` (drives plot autoscale / limits); \`—\` for enums.

## Object tree

\`\`\`
Rocket Telemetry/
${tree.join('\n')}
\`\`\`
`

const enums = [
  '## Enumerations',
  '',
  'Enum and boolean signals carry one of these numeric `Value`s; OpenMCT renders the',
  'matching `String`. Send the **Value**, not the string.',
  '',
  enumTable('Bool', BOOL_ENUM),
  '',
  enumTable('FlightStage', FLIGHT_STAGE_ENUM),
  '',
  enumTable('PacketType', PACKET_TYPE_ENUM),
  '',
  enumTable('PowerOutputOverwrite', POWER_OUTPUT_OVERWRITE_ENUM),
  '',
  enumTable('PowerOutputStatus', POWER_OUTPUT_STATUS_ENUM),
].join('\n')

const aux = [
  '## Appendix — demo-only keys',
  '',
  'These belong to the `FakeDataGenerator` that drives the Avionics Dashboard battery',
  'overlay. They are **not** part of the rocket telemetry catalog and a real backend',
  'does not need to emit them.',
  '',
  '| Key | Used by |',
  '|---|---|',
  `| \`${VL_BATTERY_GPS.key}\` | VL Battery Voltage overlay (GPS fix) |`,
  `| \`${VL_BATTERY_RECEIVED.key}\` | VL Battery Voltage overlay (received) |`,
].join('\n')

process.stdout.write(
  [header, body.join('\n'), '', enums, '', aux, ''].join('\n')
)
