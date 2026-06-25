/**
 * Native OpenMCT Condition Sets for the downlink power-output status signals.
 *
 * The Ground Station Downlink Console colors AMP / EPS output status in React
 * (gray = Disabled, green = PowerGood, red = PowerBad). This module also
 * publishes that same value-based logic as real OpenMCT Condition Sets — one
 * per status signal — so the operator can apply native conditional styling to
 * these signals in Display Layouts / Telemetry Tables (a Condition Set outputs
 * the matched state; the consuming view maps the state to a style/color).
 *
 * These mirror the CLI's `format_amp_output_status` coloring. Note: OpenMCT
 * conditions are value-threshold based and cannot express the CLI's
 * "flash on change" highlight — that lives only in the React console.
 *
 * Schema verified against the vendored OpenMCT bundle; still worth a quick
 * in-browser check the first time the Condition plugin renders these.
 */
import { NAMESPACE } from './data-provider'
import { POWER_OUTPUT_STATUS_ENUM } from '../sources/rocket-telemetry'
import type { OpenMCT } from 'openmct'

export const DOWNLINK_CONDITIONS_NAMESPACE = 'downlink-conditions'
const ROOT_KEY = 'condition-sets'

/** Power-output status signals that get a Condition Set, with display labels. */
const POWER_STATUS_SIGNALS: { key: string; label: string }[] = [
  { key: 'gsd_amp_out1', label: 'AMP Out 1' },
  { key: 'gsd_amp_out2', label: 'AMP Out 2' },
  { key: 'gsd_amp_out3', label: 'AMP Out 3' },
  { key: 'gsd_amp_out4', label: 'AMP Out 4' },
  { key: 'gsd_eps1_output_3v3_status', label: 'EPS 1 3.3V' },
  { key: 'gsd_eps1_output_5v_status', label: 'EPS 1 5V' },
  { key: 'gsd_eps1_output_9v_status', label: 'EPS 1 9V' },
  { key: 'gsd_eps2_output_3v3_status', label: 'EPS 2 3.3V' },
  { key: 'gsd_eps2_output_5v_status', label: 'EPS 2 5V' },
  { key: 'gsd_eps2_output_9v_status', label: 'EPS 2 9V' },
]

const conditionSetKey = (statusKey: string) => `cs_${statusKey}`

/** One condition: status value === `value` → emit `output`. */
function makeCondition(statusKey: string, output: string, value: number) {
  const id = `${conditionSetKey(statusKey)}-${value}`
  return {
    isDefault: false,
    id,
    configuration: {
      name: output,
      output,
      trigger: 'all',
      criteria: [
        {
          id: `${id}-crit`,
          telemetry: { namespace: NAMESPACE, key: statusKey },
          operation: 'equalTo',
          input: [String(value)],
          metadata: 'value',
        },
      ],
    },
    summary: output,
  }
}

/** Build the Condition Set domain object for one status signal. */
function makeConditionSet(statusKey: string, label: string) {
  const key = conditionSetKey(statusKey)
  // One condition per enum value, in priority order (first match wins).
  const conditions = POWER_OUTPUT_STATUS_ENUM.map((en) =>
    makeCondition(statusKey, en.string, en.value)
  )
  return {
    identifier: { namespace: DOWNLINK_CONDITIONS_NAMESPACE, key },
    name: `${label} Output Status`,
    type: 'conditionSet',
    location: `${DOWNLINK_CONDITIONS_NAMESPACE}:${ROOT_KEY}`,
    composition: [{ namespace: NAMESPACE, key: statusKey }],
    configuration: {
      conditionTestData: [],
      conditionCollection: [
        ...conditions,
        {
          isDefault: true,
          id: `${key}-default`,
          configuration: {
            name: 'Default',
            output: 'Unknown',
            trigger: 'all',
            criteria: [],
          },
          summary: 'Default condition',
        },
      ],
    },
  }
}

/** Folder grouping the generated Condition Sets in the tree. */
function makeFolder() {
  return {
    identifier: { namespace: DOWNLINK_CONDITIONS_NAMESPACE, key: ROOT_KEY },
    name: 'Downlink Condition Sets',
    type: 'folder',
    location: 'ROOT',
    composition: POWER_STATUS_SIGNALS.map((s) => ({
      namespace: DOWNLINK_CONDITIONS_NAMESPACE,
      key: conditionSetKey(s.key),
    })),
  }
}

/**
 * Registers a "Downlink Condition Sets" folder containing one Condition Set per
 * power-output status signal. Requires the Condition plugin (installed in
 * main.ts) for the `conditionSet` type to render and evaluate.
 */
export function DownlinkConditionSetsPlugin(openmct: OpenMCT) {
  openmct.objects.addRoot(
    { namespace: DOWNLINK_CONDITIONS_NAMESPACE, key: ROOT_KEY },
    openmct.priority.LOW
  )

  openmct.objects.addProvider(DOWNLINK_CONDITIONS_NAMESPACE, {
    get(identifier: { namespace: string; key: string }) {
      if (identifier.key === ROOT_KEY) {
        return Promise.resolve(makeFolder())
      }
      const match = POWER_STATUS_SIGNALS.find(
        (s) => conditionSetKey(s.key) === identifier.key
      )
      if (match) {
        return Promise.resolve(makeConditionSet(match.key, match.label))
      }
      return Promise.resolve(undefined)
    },
  })
}
