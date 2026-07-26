# Ground Station Downlink — OpenMCT Telemetry Dictionary

Context file for porting the Rust ground-station "Ground Station Downlink" view into
NASA OpenMCT. It lists every telemetry signal shown under that window, the units each
signal should carry, and a proposed OpenMCT object-tree (folder) layout.

## Source of truth (Rust monorepo)

| What                                           | File                                                        |
| ---------------------------------------------- | ----------------------------------------------------------- |
| "Ground Station Downlink" panel title          | `rocket-cli/src/gs/mod.rs:726`                              |
| Field rendering (labels, formats, units)       | `rocket-cli/src/gs/downlink_packet_display.rs`              |
| `TelemetryPacket` struct + getters + JSON keys | `firmware-common-new/src/vlp/packets/telemetry.rs`          |
| `FlightStage` enum                             | `firmware-common-new/src/can_bus/messages/vl_status.rs:10`  |
| `PowerOutputStatus` enum                       | `firmware-common-new/src/can_bus/messages/amp_status.rs:11` |

The downlink window renders one of several packet types depending on what was last
received (`VLPDownlinkPacket`: `Telemetry`, `LowPowerTelemetry`, `LandedTelemetry`,
`GPSBeacon`, `SelfTestResult`, `Ack`). The **`Telemetry`** packet is the richest and
is the one that contains OZYS 1/2 and EPS 1/2 — it is the primary basis for the tree
below. Other packet types are summarized at the end.

### Key conventions

- **Telemetry keys** below match the JSON serialization in `TelemetryPacket::to_json()`
  (`telemetry.rs`). Use these as the OpenMCT telemetry-point `key`.
- **Units** are taken from the GUI display formatting (e.g. `format!("{:.2}V", …)`),
  not the on-wire fixed-point encoding. The "Encoded range" column is the physical
  range the fixed-point field can represent (useful for OpenMCT limits/min-max).
- **Booleans / enums**: model as a `string` telemetry value or an enumerated state
  with a string-map (`format: "enum"`). For OpenMCT alarm coloring, enumerations are
  preferable to raw booleans.

---

## Proposed OpenMCT object tree

```
Ground Station Downlink/                (folder)
├── Link Quality/                       (folder)
├── GPS & Position/                     (folder)
├── Flight Dynamics/                    (folder)
├── Vehicle Power & Pyro/               (folder)
├── AMP (Power Distribution)/           (folder)
├── Bulkheads/                          (folder)
│   ├── Main Bulkhead/                  (folder)
│   └── Drogue Bulkhead/               (folder)
├── ICARUS — Air Brakes/                (folder)
├── OZYS 1/                             (folder)
├── OZYS 2/                             (folder)
├── Payload EPS/                        (folder)
│   ├── EPS 1/                          (folder)
│   └── EPS 2/                          (folder)
└── Avionics Status/                    (folder)
```

---

## Link Quality

Connection metrics rendered at the top of the panel from the LoRa `PacketStatus`
(`downlink_packet_display.rs:169-183`). Not part of the packet payload, but useful to
surface in OpenMCT.

| Key                      | Name                   | Type    | Units                          |
| ------------------------ | ---------------------- | ------- | ------------------------------ |
| `rssi`                   | RSSI                   | float   | dBm                            |
| `snr`                    | SNR                    | float   | dB                             |
| `seconds_since_received` | Time Since Last Packet | integer | s                              |
| `packet_type`            | Packet Type            | string  | — (Telemetry / GPS Beacon / …) |

---

## GPS & Position

| Key                     | Name             | Type    | Units | Encoded range            |
| ----------------------- | ---------------- | ------- | ----- | ------------------------ |
| `num_of_fix_satellites` | Satellites (fix) | integer | count | 0–31                     |
| `unix_clock_ready`      | Unix Clock Ready | boolean | —     | T/F                      |
| `lat`                   | Latitude         | float   | deg   | −90 … 90 (res ≈ 2.4 m)   |
| `lon`                   | Longitude        | float   | deg   | −180 … 180 (res ≈ 2.4 m) |

---

## Flight Dynamics

| Key                | Name             | Type        | Units | Encoded range  |
| ------------------ | ---------------- | ----------- | ----- | -------------- |
| `flight_stage`     | Flight Stage     | enum/string | —     | see enum below |
| `altitude_agl`     | Altitude AGL     | float       | m     | −100 … 7000    |
| `max_altitude_agl` | Max Altitude AGL | float       | m     | −100 … 7000    |
| `air_speed`        | Air Speed        | float       | m/s   | 0 … 400        |
| `max_air_speed`    | Max Air Speed    | float       | m/s   | 0 … 400        |
| `tilt_deg`         | Tilt             | float       | deg   | −90 … 90       |
| `air_temperature`  | Air Temperature  | float       | °C    | −10 … 85       |

**`flight_stage` enumeration** (`vl_status.rs`):

| Value | State          |
| ----- | -------------- |
| 0     | LowPower       |
| 1     | SelfTest       |
| 2     | Armed          |
| 3     | PoweredAscent  |
| 4     | Coasting       |
| 5     | DrogueDeployed |
| 6     | MainDeployed   |
| 7     | Landed         |

---

## Vehicle Power & Pyro

Vehicle (avionics) battery and pyro channel continuity.

| Key                      | Name                   | Type    | Units | Encoded range |
| ------------------------ | ---------------------- | ------- | ----- | ------------- |
| `vl_battery_v`           | VL Battery Voltage     | float   | V     | 2.5 … 8.5     |
| `shared_battery_v`       | Shared Battery Voltage | float   | V     | 2.5 … 8.5     |
| `pyro_main_continuity`   | Main Pyro Continuity   | boolean | —     | T/F           |
| `pyro_drogue_continuity` | Drogue Pyro Continuity | boolean | —     | T/F           |

---

## AMP (Power Distribution)

Main power-distribution module. Each output has a status enum plus an "overwrote"
flag (auto vs. manually overridden).

| Key                       | Name                   | Type        | Units |
| ------------------------- | ---------------------- | ----------- | ----- |
| `amp_online`              | AMP Online             | boolean     | —     |
| `amp_rebooted_in_last_5s` | AMP Rebooted (<5 s)    | boolean     | —     |
| `amp_out1`                | AMP Output 1 Status    | enum/string | —     |
| `amp_out1_overwrote`      | AMP Output 1 Overwrote | boolean     | —     |
| `amp_out2`                | AMP Output 2 Status    | enum/string | —     |
| `amp_out2_overwrote`      | AMP Output 2 Overwrote | boolean     | —     |
| `amp_out3`                | AMP Output 3 Status    | enum/string | —     |
| `amp_out3_overwrote`      | AMP Output 3 Overwrote | boolean     | —     |
| `amp_out4`                | AMP Output 4 Status    | enum/string | —     |
| `amp_out4_overwrote`      | AMP Output 4 Overwrote | boolean     | —     |

**`PowerOutputStatus` enumeration** (`amp_status.rs`) — shared by AMP and EPS outputs:

| Value | State     |
| ----- | --------- |
| 0     | Disabled  |
| 1     | PowerGood |
| 2     | PowerBad  |

> Display note: the `*_overwrote` flag renders as the prefix `overwrote,` vs `auto,`
> before the status string in the Rust UI.

---

## Bulkheads

### Main Bulkhead

| Key                                 | Name                          | Type    | Units |
| ----------------------------------- | ----------------------------- | ------- | ----- |
| `main_bulkhead_online`              | Main Bulkhead Online          | boolean | —     |
| `main_bulkhead_rebooted_in_last_5s` | Main Bulkhead Rebooted (<5 s) | boolean | —     |
| `main_bulkhead_brightness`          | Main Bulkhead Brightness      | float   | lux   |

### Drogue Bulkhead

| Key                                   | Name                            | Type    | Units |
| ------------------------------------- | ------------------------------- | ------- | ----- |
| `drogue_bulkhead_online`              | Drogue Bulkhead Online          | boolean | —     |
| `drogue_bulkhead_rebooted_in_last_5s` | Drogue Bulkhead Rebooted (<5 s) | boolean | —     |
| `drogue_bulkhead_brightness`          | Drogue Bulkhead Brightness      | float   | lux   |

> Brightness is log-encoded on the wire (`encode_brightness_lux`) but decoded back to
> physical **lux** before display (`*_brightness_lux()`).

---

## ICARUS — Air Brakes

Air-brake controller (ICARUS node).

| Key                                         | Name                           | Type    | Units | Encoded range |
| ------------------------------------------- | ------------------------------ | ------- | ----- | ------------- |
| `icarus_online`                             | ICARUS Online                  | boolean | —     | T/F           |
| `icarus_rebooted_in_last_5s`                | ICARUS Rebooted (<5 s)         | boolean | —     | T/F           |
| `air_brakes_commanded_extension_percentage` | Air Brakes Commanded Extension | float   | %     | 0 … 100       |
| `air_brakes_actual_extension_percentage`    | Air Brakes Actual Extension    | float   | %     | 0 … 100       |
| `air_brakes_servo_temp`                     | Air Brakes Servo Temp          | float   | °C    | −10 … 85      |

> The extension fields are stored 0.0–1.0 on the wire; the Rust UI multiplies by 100
> and shows `%`. Either ingest as 0–1 (`format: "%"` in OpenMCT) or pre-scale to 0–100.

---

## OZYS 1

OZYS strain/data-acquisition node 1. In the `Telemetry` packet only health flags are
present. (Disk-usage % is available in the `SelfTestResult` packet — see end.)

| Key                         | Name                   | Type    | Units |
| --------------------------- | ---------------------- | ------- | ----- |
| `ozys1_online`              | OZYS 1 Online          | boolean | —     |
| `ozys1_rebooted_in_last_5s` | OZYS 1 Rebooted (<5 s) | boolean | —     |

## OZYS 2

| Key                         | Name                   | Type    | Units |
| --------------------------- | ---------------------- | ------- | ----- |
| `ozys2_online`              | OZYS 2 Online          | boolean | —     |
| `ozys2_rebooted_in_last_5s` | OZYS 2 Rebooted (<5 s) | boolean | —     |

---

## Payload EPS

Both EPS units share an identical field layout. Battery voltages are encoded with the
payload-voltage factory (2.0–4.5 V) and temperatures with the payload-temperature
factory (10–85 °C). Output currents are stored in **amps** (0.0–2.0 A) but the Rust UI
displays **milliamps** (`{}mA` after ×1000) — recommend ingesting as mA for parity.

### EPS 1

| Key                         | Name                       | Type        | Units | Encoded range     |
| --------------------------- | -------------------------- | ----------- | ----- | ----------------- |
| `eps1_online`               | EPS 1 Online               | boolean     | —     | T/F               |
| `eps1_rebooted_in_last_5s`  | EPS 1 Rebooted (<5 s)      | boolean     | —     | T/F               |
| `eps1_battery1_v`           | EPS 1 Battery 1 Voltage    | float       | V     | 2.0 … 4.5         |
| `eps1_battery1_temperature` | EPS 1 Battery 1 Temp       | float       | °C    | 10 … 85           |
| `eps1_battery2_v`           | EPS 1 Battery 2 Voltage    | float       | V     | 2.0 … 4.5         |
| `eps1_battery2_temperature` | EPS 1 Battery 2 Temp       | float       | °C    | 10 … 85           |
| `eps1_output_3v3_current`   | EPS 1 3V3 Output Current   | float       | mA    | 0 … 2000          |
| `eps1_output_3v3_status`    | EPS 1 3V3 Output Status    | enum/string | —     | PowerOutputStatus |
| `eps1_output_3v3_overwrote` | EPS 1 3V3 Output Overwrote | boolean     | —     | T/F               |
| `eps1_output_5v_current`    | EPS 1 5V Output Current    | float       | mA    | 0 … 2000          |
| `eps1_output_5v_status`     | EPS 1 5V Output Status     | enum/string | —     | PowerOutputStatus |
| `eps1_output_5v_overwrote`  | EPS 1 5V Output Overwrote  | boolean     | —     | T/F               |
| `eps1_output_9v_current`    | EPS 1 9V Output Current    | float       | mA    | 0 … 2000          |
| `eps1_output_9v_status`     | EPS 1 9V Output Status     | enum/string | —     | PowerOutputStatus |
| `eps1_output_9v_overwrote`  | EPS 1 9V Output Overwrote  | boolean     | —     | T/F               |

### EPS 2

| Key                         | Name                       | Type        | Units | Encoded range     |
| --------------------------- | -------------------------- | ----------- | ----- | ----------------- |
| `eps2_online`               | EPS 2 Online               | boolean     | —     | T/F               |
| `eps2_rebooted_in_last_5s`  | EPS 2 Rebooted (<5 s)      | boolean     | —     | T/F               |
| `eps2_battery1_v`           | EPS 2 Battery 1 Voltage    | float       | V     | 2.0 … 4.5         |
| `eps2_battery1_temperature` | EPS 2 Battery 1 Temp       | float       | °C    | 10 … 85           |
| `eps2_battery2_v`           | EPS 2 Battery 2 Voltage    | float       | V     | 2.0 … 4.5         |
| `eps2_battery2_temperature` | EPS 2 Battery 2 Temp       | float       | °C    | 10 … 85           |
| `eps2_output_3v3_current`   | EPS 2 3V3 Output Current   | float       | mA    | 0 … 2000          |
| `eps2_output_3v3_status`    | EPS 2 3V3 Output Status    | enum/string | —     | PowerOutputStatus |
| `eps2_output_3v3_overwrote` | EPS 2 3V3 Output Overwrote | boolean     | —     | T/F               |
| `eps2_output_5v_current`    | EPS 2 5V Output Current    | float       | mA    | 0 … 2000          |
| `eps2_output_5v_status`     | EPS 2 5V Output Status     | enum/string | —     | PowerOutputStatus |
| `eps2_output_5v_overwrote`  | EPS 2 5V Output Overwrote  | boolean     | —     | T/F               |
| `eps2_output_9v_current`    | EPS 2 9V Output Current    | float       | mA    | 0 … 2000          |
| `eps2_output_9v_status`     | EPS 2 9V Output Status     | enum/string | —     | PowerOutputStatus |
| `eps2_output_9v_overwrote`  | EPS 2 9V Output Overwrote  | boolean     | —     | T/F               |

---

## Avionics Status

Remaining node health flags.

| Key                                          | Name                                   | Type    | Units |
| -------------------------------------------- | -------------------------------------- | ------- | ----- |
| `payload_activation_pcb_online`              | Payload Activation PCB Online          | boolean | —     |
| `payload_activation_pcb_rebooted_in_last_5s` | Payload Activation PCB Rebooted (<5 s) | boolean | —     |
| `rocket_wifi_online`                         | Rocket WiFi Online                     | boolean | —     |
| `rocket_wifi_rebooted_in_last_5s`            | Rocket WiFi Rebooted (<5 s)            | boolean | —     |

---

## OpenMCT modeling notes

- **Domain (time)**: OpenMCT requires a time/domain hint per point. The downlink
  packets carry no embedded timestamp suitable as a domain; use ground-station receive
  time (the panel already tracks `received_time`) as the `utc` domain for all points.
- **Range (value)**: each row above is a single range value. For booleans/enums use a
  string range with an enum value-map for status coloring.
- **Limits**: use the "Encoded range" min/max to seed OpenMCT yellow/red limits where
  meaningful (e.g. battery low-voltage, over-temperature, `PowerBad`).
- **Units field**: OpenMCT `valueMetadata.unit` should be set to the Units column
  (`V`, `°C` / `degC`, `mA`, `m`, `m/s`, `deg`, `lux`, `dBm`, `dB`, `count`, `%`).
- **Suggested key namespacing**: prefix keys with the folder, e.g. `gsd.eps1.battery1_v`,
  to keep them unique across the OpenMCT object identifier namespace while keeping the
  raw Rust JSON key as the parse source.

---

## Appendix — other downlink packet types

The same window also renders these packet variants. They overlap heavily with the
Telemetry packet but expose a few extra fields worth importing if/when received.

### GPS Beacon (`GPSBeacon`)

`num_of_fix_satellites` (count), `lat`/`lon` (deg), `altitude_asl` (m), `air_temperature`
(°C), `battery_v` (V), `pyro_short_circuit` (bool), `pyro_main_continuity` /
`pyro_main_fire` (bool), `pyro_drogue_continuity` / `pyro_drogue_fire` (bool).

### Low Power Telemetry (`LowPowerTelemetry`)

`gps_fixed` (bool), `num_of_fix_satellites` (count), `air_temperature` (°C),
`vl_battery_v` (V), `shared_battery_v` (V), `amp_online` (bool).

### Landed Telemetry (`LandedTelemetry`)

`num_of_fix_satellites`, `lat`/`lon`, `battery_v` (V), `shared_battery_v` (V),
`amp_online` / `amp_rebooted_in_last_5s` (bool), `amp_out1..4` (PowerOutputStatus).

### Self Test Result (`SelfTestResult`)

Subsystem OK flags: `imu_ok`, `baro_ok`, `mag_ok`, `gps_ok`, `sd_ok`, `can_bus_ok`,
`main_continuity`, `drogue_continuity` (all bool); per-node `NodeStatus` (health/mode/
rebooted) for `amp`, `icarus`, `ozys1`, `ozys2`, `main_bulkhead_pcb`,
`drogue_bulkhead_pcb`, `payload_activation_pcb`, `rocket_wifi`, `payload_eps1`,
`payload_eps2`; AMP output power-good flags `amp_out1..4_power_good` (bool); and
**OZYS disk usage** `ozys1_disk` / `ozys2_disk` (%) — the only per-OZYS scalar metric
available anywhere in the downlink.
