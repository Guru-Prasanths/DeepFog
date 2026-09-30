# DEEPFOG — System Architecture & Data Flow

This document details the architectural layout, communication protocols, subsystem responsibilities, and data flows of the **DEEPFOG Intelligent Mine Vehicle Safety & Low-Visibility Monitoring System**.

---

## High-Level Architecture Diagram

```
                              DEEPFOG SYSTEM
                                    │
                                    ▼
                         ┌────────────────────┐
                         │ Mine Vehicle /     │
                         │ HEMM Unit          │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         ┌────────────────────┐
                         │ Multi-Sensor Array │
                         │ LDR, MQ-2, DHT11,  │
                         │ HC-SR04, MPU-6050, │
                         │ SW-420, NEO-6M GPS │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         ┌────────────────────┐
                         │ ESP32 Controller   │
                         │ Edge Filtering     │
                         │ On-Device Risk Calc│
                         │ OLED + Buzzer Alert│
                         └─────────┬──────────┘
                                   │
                                   ▼
                            Wi-Fi / 802.11
                                   │
                                   ▼
                         ┌────────────────────┐
                         │ REST API           │
                         │ POST /api/sensors  │
                         │ (Node.js + Express)│
                         └─────────┬──────────┘
                                   │
                  ┌────────────────┴────────────────┐
                  │                                 │
                  ▼                                 ▼
       ┌────────────────────┐            ┌────────────────────┐
       │ PostgreSQL DB      │            │ Web Dashboard      │
       │ Persistent Sensor  │◄───────────┤ Real-Time Leaflet  │
       │ & Alert Telemetry  │   REST     │ Charts & Telemetry │
       └────────────────────┘  Endpoints └────────────────────┘
```

---

## Layer Breakdown & Communication

### 1. Edge Layer: ESP32 Firmware
- **Hardware**: ESP32 DevKit V1 with dual-core Xtensa 32-bit LX6 microcontroller.
- **Acquisition**: Reads 7 sensor channels asynchronously at 5 Hz.
- **Edge Risk Engine**: Evaluates safety conditions instantly without waiting for network connectivity. If high danger is detected (dense fog combined with near obstacle, toxic fumes, or rollover tilt), an active buzzer sounds and the in-cab OLED displays warnings to protect the operator immediately.
- **Telemetry Transmission**: Serializes sensor readings to JSON and issues an HTTP `POST /api/sensors` every 3 seconds over mine site Wi-Fi.

### 2. Transport Layer: REST API
- **Protocol**: HTTP/1.1 with JSON payloads.
- **Port**: `4000` (configurable via `.env`).
- **Headers**:
  - `Content-Type: application/json`
  - `X-API-Key`: Pre-shared secret key validating vehicle telemetry.

### 3. Server Layer: Node.js & Express
- **Responsibilities**:
  - Validates schema and physical ranges of incoming sensor data.
  - Executes server-side sensor-fusion risk scoring.
  - Automatically raises and persists safety alerts when thresholds are breached.
  - Serves REST endpoints for frontend dashboard consumption.
  - Serves compiled static frontend assets (`index.html`, CSS, JS).

### 4. Persistence Layer: PostgreSQL
- **Tables**:
  - `vehicles`: Registered fleet equipment (HEMMs, haul trucks, shovels).
  - `sensor_readings`: Timeseries records of all telemetry metrics.
  - `alerts`: Safety events categorized by severity (`HIGH`, `MEDIUM`, `LOW`) and lifecycle status (`ACTIVE`, `ACKNOWLEDGED`, `RESOLVED`).

### 5. Presentation Layer: Web Dashboard
- **Technologies**: Vanilla HTML5, CSS3, JavaScript (ES6+), Leaflet.js, Chart.js.
- **Capabilities**:
  - Dark-mode industrial aesthetic tailored for low-light mine control rooms.
  - Real-time polling with sub-second latency feedback.
  - Live GPS tracking on mine bench maps with trail polyline.
  - Rolling historical charts for environmental trends.
  - Standalone Demo Mode fallback when backend or hardware is disconnected.
