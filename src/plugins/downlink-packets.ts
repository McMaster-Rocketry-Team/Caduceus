/**
 * Ground Station Downlink packet layouts.
 *
 * Transcribed field-for-field, label-for-label, and line-for-line from the
 * previous ground-station CLI's downlink display
 * (`prev-rocket-cli/src/gs/downlink_packet_display.rs`). That display is
 * packet-type-dependent: it shows a different field layout per received
 * `VLPDownlinkPacket` variant. We reproduce each layout here so the
 * {@link DownlinkConsolePlugin} can render the same labels in the same order.
 *
 * Each field references a `gsd_*` telemetry signal (see `rocket-telemetry.ts`).
 * The `highlight` flag mirrors the CLI's per-field "flash on change" behavior
 * (the orange fade applied to discrete status fields, not continuous numerics).
 */

/** PACKET_TYPE_ENUM values (see `rocket-telemetry.ts`). */
export const PACKET_TYPE = {
  GPSBeacon: 0,
  Telemetry: 1,
  LowPowerTelemetry: 2,
  LandedTelemetry: 3,
  SelfTestResult: 4,
  Ack: 5,
} as const

/** A single labelled field in a packet layout. */
export type DownlinkField =
  | {
      kind: 'value' | 'bool' | 'enum'
      key: string
      label: string
      highlight: boolean
    }
  | {
      // AMP / EPS output status: "auto|overwrote, <colored status>".
      kind: 'powerStatus'
      statusKey: string
      overwroteKey: string
      label: string
      highlight: boolean
    }
  | {
      // Self Test node status: "<health>, <mode>[ rebooted]".
      kind: 'nodeStatus'
      healthKey: string
      modeKey: string
      rebootedKey: string
      label: string
      highlight: boolean
    }

/** One packet variant's display: an ordered list of lines, each a list of fields. */
export type PacketLayout = {
  type: number
  name: string
  lines: DownlinkField[][]
}

// --- terse field builders -------------------------------------------------

/** Continuous numeric value (no change-flash — these change every packet). */
const v = (key: string, label: string): DownlinkField => ({
  kind: 'value',
  key,
  label,
  highlight: false,
})
/** Boolean (T/F), flashes on change. */
const b = (key: string, label: string): DownlinkField => ({
  kind: 'bool',
  key,
  label,
  highlight: true,
})
/** Enum (e.g. flight stage), flashes on change. */
const e = (key: string, label: string): DownlinkField => ({
  kind: 'enum',
  key,
  label,
  highlight: true,
})
/** AMP/EPS power-output status, flashes on change. */
const ps = (base: string, label: string): DownlinkField => ({
  kind: 'powerStatus',
  statusKey: base,
  overwroteKey: `${base}_overwrote`,
  label,
  highlight: true,
})

/** Existing per-node "rebooted in last 5s" signal, reused by node status. */
const REBOOT_KEY: Record<string, string> = {
  amp: 'gsd_amp_rebooted_in_last_5s',
  icarus: 'gsd_icarus_rebooted_in_last_5s',
  ozys1: 'gsd_ozys1_rebooted_in_last_5s',
  ozys2: 'gsd_ozys2_rebooted_in_last_5s',
  main_bulkhead: 'gsd_main_bulkhead_rebooted_in_last_5s',
  drogue_bulkhead: 'gsd_drogue_bulkhead_rebooted_in_last_5s',
  payload_activation_pcb: 'gsd_payload_activation_pcb_rebooted_in_last_5s',
  rocket_wifi: 'gsd_rocket_wifi_rebooted_in_last_5s',
  eps1: 'gsd_eps1_rebooted_in_last_5s',
  eps2: 'gsd_eps2_rebooted_in_last_5s',
}
/** Self Test node status, flashes on change. */
const ns = (prefix: string, label: string): DownlinkField => ({
  kind: 'nodeStatus',
  healthKey: `gsd_selftest_${prefix}_health`,
  modeKey: `gsd_selftest_${prefix}_mode`,
  rebootedKey: REBOOT_KEY[prefix],
  label,
  highlight: true,
})

// --- packet layouts (verbatim order from the CLI) -------------------------

const GPS_BEACON: PacketLayout = {
  type: PACKET_TYPE.GPSBeacon,
  name: 'GPS Beacon',
  lines: [
    [v('gsd_num_of_fix_satellites', 'satellites'), v('gsd_lat', 'lat'), v('gsd_lon', 'lon')],
    [v('gsd_altitude_asl', 'altitude asl'), v('gsd_air_temperature', 'air temperature')],
    [v('gsd_vl_battery_v', 'vl battery')],
    [b('gsd_pyro_short_circuit', 'pyro short circuit')],
    [b('gsd_pyro_main_continuity', 'main continuity'), b('gsd_pyro_main_fire', 'main fire')],
    [b('gsd_pyro_drogue_continuity', 'drogue continuity'), b('gsd_pyro_drogue_fire', 'drogue fire')],
  ],
}

const LOW_POWER: PacketLayout = {
  type: PACKET_TYPE.LowPowerTelemetry,
  name: 'Low Power Telemetry',
  lines: [
    [b('gsd_gps_fixed', 'gps fixed'), v('gsd_num_of_fix_satellites', 'satellites')],
    [v('gsd_air_temperature', 'air temperature')],
    [v('gsd_vl_battery_v', 'vl battery'), v('gsd_shared_battery_v', 'shared battery')],
    [b('gsd_amp_online', 'amp online')],
  ],
}

const LANDED: PacketLayout = {
  type: PACKET_TYPE.LandedTelemetry,
  name: 'Landed Telemetry',
  lines: [
    [v('gsd_num_of_fix_satellites', 'satellites'), v('gsd_lat', 'lat'), v('gsd_lon', 'lon')],
    [v('gsd_vl_battery_v', 'vl battery'), v('gsd_shared_battery_v', 'shared battery')],
    [b('gsd_amp_online', 'amp online'), b('gsd_amp_rebooted_in_last_5s', 'amp rebooted')],
    [
      ps('gsd_amp_out1', 'amp out 1'),
      ps('gsd_amp_out2', 'amp out 2'),
      ps('gsd_amp_out3', 'amp out 3'),
      ps('gsd_amp_out4', 'amp out 4'),
    ],
  ],
}

const TELEMETRY: PacketLayout = {
  type: PACKET_TYPE.Telemetry,
  name: 'Telemetry',
  lines: [
    [
      v('gsd_num_of_fix_satellites', 'satellites'),
      b('gsd_unix_clock_ready', 'unix clock'),
      v('gsd_lat', 'lat'),
      v('gsd_lon', 'lon'),
    ],
    [
      v('gsd_vl_battery_v', 'vl battery'),
      v('gsd_shared_battery_v', 'shared battery'),
      b('gsd_pyro_main_continuity', 'main continuity'),
      b('gsd_pyro_drogue_continuity', 'drogue continuity'),
    ],
    [v('gsd_air_temperature', 'air temperature'), v('gsd_air_brakes_servo_temp', 'servo temp')],
    [
      e('gsd_flight_stage', 'state'),
      v('gsd_altitude_agl', 'altitude agl'),
      v('gsd_max_altitude_agl', 'max altitude agl'),
      v('gsd_air_speed', 'air speed'),
      v('gsd_max_air_speed', 'max air speed'),
      v('gsd_tilt_deg', 'tilt'),
    ],
    [
      b('gsd_icarus_online', 'icarus online'),
      b('gsd_icarus_rebooted_in_last_5s', 'rebooted'),
      v('gsd_air_brakes_commanded_extension_percentage', 'commanded extension'),
      v('gsd_air_brakes_actual_extension_percentage', 'actual extension'),
    ],
    [b('gsd_amp_online', 'amp online'), b('gsd_amp_rebooted_in_last_5s', 'amp rebooted')],
    [
      ps('gsd_amp_out1', 'amp out 1'),
      ps('gsd_amp_out2', 'amp out 2'),
      ps('gsd_amp_out3', 'amp out 3'),
      ps('gsd_amp_out4', 'amp out 4'),
    ],
    [
      b('gsd_main_bulkhead_online', 'main bulkhead online'),
      b('gsd_main_bulkhead_rebooted_in_last_5s', 'rebooted'),
      v('gsd_main_bulkhead_brightness', 'brightness'),
      b('gsd_drogue_bulkhead_online', 'drogue bulkhead online'),
      b('gsd_drogue_bulkhead_rebooted_in_last_5s', 'rebooted'),
      v('gsd_drogue_bulkhead_brightness', 'brightness'),
    ],
    [
      b('gsd_ozys1_online', 'ozys 1 online'),
      b('gsd_ozys1_rebooted_in_last_5s', 'rebooted'),
      b('gsd_ozys2_online', 'ozys 2 online'),
      b('gsd_ozys2_rebooted_in_last_5s', 'rebooted'),
    ],
    [
      b('gsd_payload_activation_pcb_online', 'payload activation pcb online'),
      b('gsd_payload_activation_pcb_rebooted_in_last_5s', 'rebooted'),
      b('gsd_rocket_wifi_online', 'rocket wifi online'),
      b('gsd_rocket_wifi_rebooted_in_last_5s', 'rebooted'),
    ],
    [
      b('gsd_eps1_online', 'eps 1 online'),
      b('gsd_eps1_rebooted_in_last_5s', 'rebooted'),
      v('gsd_eps1_battery1_v', 'batt 1 v'),
      v('gsd_eps1_battery1_temperature', 'batt 1 temp'),
      v('gsd_eps1_battery2_v', 'batt 2 v'),
      v('gsd_eps1_battery2_temperature', 'batt 2 temp'),
    ],
    [
      v('gsd_eps1_output_3v3_current', '3v3 out current'),
      ps('gsd_eps1_output_3v3_status', 'status'),
      v('gsd_eps1_output_5v_current', '5v out current'),
      ps('gsd_eps1_output_5v_status', 'status'),
      v('gsd_eps1_output_9v_current', '9v out current'),
      ps('gsd_eps1_output_9v_status', 'status'),
    ],
    [
      b('gsd_eps2_online', 'eps 2 online'),
      b('gsd_eps2_rebooted_in_last_5s', 'rebooted'),
      v('gsd_eps2_battery1_v', 'batt 1 v'),
      v('gsd_eps2_battery1_temperature', 'batt 1 temp'),
      v('gsd_eps2_battery2_v', 'batt 2 v'),
      v('gsd_eps2_battery2_temperature', 'batt 2 temp'),
    ],
    [
      v('gsd_eps2_output_3v3_current', '3v3 out current'),
      ps('gsd_eps2_output_3v3_status', 'status'),
      v('gsd_eps2_output_5v_current', '5v out current'),
      ps('gsd_eps2_output_5v_status', 'status'),
      v('gsd_eps2_output_9v_current', '9v out current'),
      ps('gsd_eps2_output_9v_status', 'status'),
    ],
  ],
}

const SELF_TEST: PacketLayout = {
  type: PACKET_TYPE.SelfTestResult,
  name: 'Self Test Result',
  lines: [
    [
      b('gsd_selftest_imu_ok', 'imu ok'),
      b('gsd_selftest_baro_ok', 'baro ok'),
      b('gsd_selftest_mag_ok', 'mag ok'),
      b('gsd_selftest_gps_ok', 'gps ok'),
      b('gsd_selftest_sd_ok', 'sd ok'),
      b('gsd_selftest_can_bus_ok', 'can bus ok'),
    ],
    [b('gsd_pyro_main_continuity', 'main continuity'), b('gsd_pyro_drogue_continuity', 'drogue continuity')],
    [
      ns('amp', 'amp'),
      b('gsd_selftest_amp_out1_power_good', 'out 1 good'),
      b('gsd_selftest_amp_out2_power_good', 'out 2 good'),
      b('gsd_selftest_amp_out3_power_good', 'out 3 good'),
      b('gsd_selftest_amp_out4_power_good', 'out 4 good'),
    ],
    [
      ns('icarus', 'icarus'),
      ns('ozys1', 'ozys 1'),
      v('gsd_ozys1_disk_usage', 'ozys 1 disk'),
      ns('ozys2', 'ozys 2'),
      v('gsd_ozys2_disk_usage', 'ozys 2 disk'),
    ],
    [ns('main_bulkhead', 'main bulkhead pcb'), ns('drogue_bulkhead', 'drogue bulkhead pcb')],
    [ns('payload_activation_pcb', 'payload activation pcb'), ns('rocket_wifi', 'rocket wifi')],
    [ns('eps1', 'payload eps 1'), ns('eps2', 'payload eps 2')],
  ],
}

/** All packet layouts, in the order presented to the operator. */
export const PACKET_LAYOUTS: PacketLayout[] = [
  TELEMETRY,
  GPS_BEACON,
  LOW_POWER,
  LANDED,
  SELF_TEST,
]

/** Header link-quality signals shown above every packet layout. */
export const HEADER_KEYS = {
  rssi: 'gsd_rssi',
  snr: 'gsd_snr',
  secondsSince: 'gsd_seconds_since_received',
  packetType: 'gsd_packet_type',
}

/** Every telemetry key referenced by any layout or the header (for subscribe). */
export const ALL_DOWNLINK_KEYS: string[] = (() => {
  const keys = new Set<string>(Object.values(HEADER_KEYS))
  for (const layout of PACKET_LAYOUTS) {
    for (const line of layout.lines) {
      for (const field of line) {
        if (field.kind === 'powerStatus') {
          keys.add(field.statusKey)
          keys.add(field.overwroteKey)
        } else if (field.kind === 'nodeStatus') {
          keys.add(field.healthKey)
          keys.add(field.modeKey)
          keys.add(field.rebootedKey)
        } else {
          keys.add(field.key)
        }
      }
    }
  }
  return [...keys]
})()
