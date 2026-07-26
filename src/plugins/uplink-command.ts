/**
 * Typed uplink command model.
 *
 * Mirrors `firmware_common_new::vlp::packets::VLPUplinkPacket` as used by the
 * previous ground-station CLI (`prev-rocket-cli/src/gs/mod.rs`). Each command is
 * a plain data object describing *what* the operator wants to send; turning a
 * command into the LoRa wire format and actually transmitting it is Layer B
 * (no ground-station backend exists yet), so for now these feed the simulated
 * `sendUplink` in {@link UplinkConsolePlugin}.
 *
 * The canonical option catalogs ({@link MODES}, {@link RESET_DEVICES},
 * {@link OVERWRITE_OPTIONS}) live here so the Send Uplink console and the
 * Rocket Telemetry tree stay in lockstep with the command set.
 */

// ---------------------------------------------------------------------------
// Shared enums (mirror the firmware shared enums)
// ---------------------------------------------------------------------------

/** `Mode` — target operating mode for `ChangeModePacket`. */
export type Mode = 'LowPower' | 'SelfTest' | 'Armed' | 'Landed' | 'Demo'

/** `PowerOutputOverwrite` — per-output override for AMP / EPS overwrite packets. */
export type PowerOutputOverwrite =
  | 'NoOverwrite'
  | 'ForceEnabled'
  | 'ForceDisabled'

/** `PyroSelect` — which pyro channel `FirePyroPacket` fires. */
export type PyroSelect = 'PyroMain' | 'PyroDrogue'

/** `DeviceToReset` — target of `ResetPacket` (full set, matching the CLI). */
export type DeviceToReset =
  | 'All'
  | 'VoidLake'
  | 'AMP'
  | 'AMPOut1'
  | 'AMPOut2'
  | 'AMPOut3'
  | 'AMPOut4'
  | 'Icarus'
  | 'PayloadActivationPCB'
  | 'RocketWifi'
  | 'OzysAll'
  | 'MainBulkhead'
  | 'DrogueBulkhead'
  | 'PayloadEPS1'
  | 'PayloadEPS2'
  | 'AeroRust'

// ---------------------------------------------------------------------------
// Command union (mirrors VLPUplinkPacket variants)
// ---------------------------------------------------------------------------

/** AMP output overwrites — one packet carries all four outputs. */
export type AMPOverwrite = {
  out1: PowerOutputOverwrite
  out2: PowerOutputOverwrite
  out3: PowerOutputOverwrite
  out4: PowerOutputOverwrite
}

/** Payload EPS output overwrites — one packet carries all six rails. */
export type EPSOverwrite = {
  eps1_3v3: PowerOutputOverwrite
  eps1_5v: PowerOutputOverwrite
  eps1_9v: PowerOutputOverwrite
  eps2_3v3: PowerOutputOverwrite
  eps2_5v: PowerOutputOverwrite
  eps2_9v: PowerOutputOverwrite
}

/**
 * A single uplink command, ready to be serialized and transmitted. The `type`
 * tag matches the `VLPUplinkPacket` variant name.
 */
export type UplinkCommand =
  | { type: 'SetTargetApogee'; altitude: number }
  | { type: 'ChangeMode'; mode: Mode }
  | { type: 'Reset'; device: DeviceToReset }
  | ({ type: 'AMPOutputOverwrite' } & AMPOverwrite)
  | ({ type: 'PayloadEPSOutputOverwrite' } & EPSOverwrite)
  | { type: 'FirePyro'; pyro: PyroSelect }

// ---------------------------------------------------------------------------
// Option catalogs (single source of truth for tree + console)
// ---------------------------------------------------------------------------

/** The five selectable modes, in CLI button order. `key` builds the tree leaf. */
export const MODES: { mode: Mode; key: string; label: string }[] = [
  { mode: 'LowPower', key: 'low_power', label: 'Low Power' },
  { mode: 'SelfTest', key: 'self_test', label: 'Self Test' },
  { mode: 'Armed', key: 'armed', label: 'Armed' },
  { mode: 'Landed', key: 'landed', label: 'Landed' },
  { mode: 'Demo', key: 'demo', label: 'Demo' },
]

/**
 * Every resettable device, in CLI radio-group order. Matches the firmware
 * `DeviceToReset` enum. `key` builds the `uplink_reset_*` tree leaf.
 */
export const RESET_DEVICES: {
  device: DeviceToReset
  key: string
  label: string
}[] = [
  { device: 'All', key: 'all', label: 'All' },
  { device: 'VoidLake', key: 'void_lake', label: 'Void Lake' },
  { device: 'AMP', key: 'amp', label: 'AMP' },
  { device: 'AMPOut1', key: 'amp_out1', label: 'AMP Out 1' },
  { device: 'AMPOut2', key: 'amp_out2', label: 'AMP Out 2' },
  { device: 'AMPOut3', key: 'amp_out3', label: 'AMP Out 3' },
  { device: 'AMPOut4', key: 'amp_out4', label: 'AMP Out 4' },
  { device: 'Icarus', key: 'icarus', label: 'ICARUS' },
  {
    device: 'PayloadActivationPCB',
    key: 'payload_activation_pcb',
    label: 'Payload Activation PCB',
  },
  { device: 'RocketWifi', key: 'rocket_wifi', label: 'Rocket WiFi' },
  { device: 'OzysAll', key: 'ozys', label: 'OZYS (All)' },
  {
    device: 'MainBulkhead',
    key: 'main_bulkhead_pcb',
    label: 'Main Bulkhead PCB',
  },
  {
    device: 'DrogueBulkhead',
    key: 'drogue_bulkhead',
    label: 'Drogue Bulkhead PCB',
  },
  { device: 'PayloadEPS1', key: 'payload_eps1', label: 'EPS 1' },
  { device: 'PayloadEPS2', key: 'payload_eps2', label: 'EPS 2' },
  { device: 'AeroRust', key: 'aero_rust', label: 'AeroRust' },
]

/** The three power-output overwrite choices, in CLI radio order. */
export const OVERWRITE_OPTIONS: {
  value: PowerOutputOverwrite
  label: string
}[] = [
  { value: 'NoOverwrite', label: 'No Overwrite' },
  { value: 'ForceEnabled', label: 'Enable' },
  { value: 'ForceDisabled', label: 'Disable' },
]

const MODE_LABEL: Record<Mode, string> = Object.fromEntries(
  MODES.map((m) => [m.mode, m.label])
) as Record<Mode, string>

const DEVICE_LABEL: Record<DeviceToReset, string> = Object.fromEntries(
  RESET_DEVICES.map((d) => [d.device, d.label])
) as Record<DeviceToReset, string>

const OVERWRITE_LABEL: Record<PowerOutputOverwrite, string> =
  Object.fromEntries(
    OVERWRITE_OPTIONS.map((o) => [o.value, o.label])
  ) as Record<PowerOutputOverwrite, string>

/** Default (cleared) overwrite — no output is forced. */
export const NO_OVERWRITE: PowerOutputOverwrite = 'NoOverwrite'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Destructive commands get a stronger confirm + danger styling. */
export function isDestructive(command: UplinkCommand): boolean {
  return command.type === 'FirePyro'
}

/** Summarize the non-default fields of a set of overwrites for display. */
function summarizeOverwrites(
  fields: [label: string, value: PowerOutputOverwrite][]
): string {
  const forced = fields.filter(([, v]) => v !== NO_OVERWRITE)
  if (forced.length === 0) return 'clear all overwrites'
  return forced
    .map(([label, v]) => `${label}: ${OVERWRITE_LABEL[v]}`)
    .join(', ')
}

/** Human-readable one-line description used for confirm prompts and feedback. */
export function summarize(command: UplinkCommand): string {
  switch (command.type) {
    case 'SetTargetApogee':
      return `Set Target Apogee → ${command.altitude} m`
    case 'ChangeMode':
      return `Change Mode → ${MODE_LABEL[command.mode]}`
    case 'Reset':
      return `Reset Device → ${DEVICE_LABEL[command.device]}`
    case 'AMPOutputOverwrite':
      return `Overwrite AMP — ${summarizeOverwrites([
        ['Out 1', command.out1],
        ['Out 2', command.out2],
        ['Out 3', command.out3],
        ['Out 4', command.out4],
      ])}`
    case 'PayloadEPSOutputOverwrite':
      return `Overwrite EPS — ${summarizeOverwrites([
        ['EPS 1 3.3V', command.eps1_3v3],
        ['EPS 1 5V', command.eps1_5v],
        ['EPS 1 9V', command.eps1_9v],
        ['EPS 2 3.3V', command.eps2_3v3],
        ['EPS 2 5V', command.eps2_5v],
        ['EPS 2 9V', command.eps2_9v],
      ])}`
    case 'FirePyro':
      return `Fire ${command.pyro === 'PyroMain' ? 'Main' : 'Drogue'} Pyro`
  }
}
