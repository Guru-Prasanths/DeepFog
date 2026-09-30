# DEEPFOG — Intelligent Mine Vehicle Safety and Low-Visibility Monitoring System

> **A Complete Full-Stack IoT Platform for Open-Cast Mine Safety & Telemetry**
> 
> *Combines multi-sensor hardware acquisition on ESP32, edge & cloud sensor-fusion risk calculation, REST API telemetry, PostgreSQL timeseries persistence, and an industrial dark-mode control room dashboard.*

---

## 1. What DEEPFOG Is

**DEEPFOG** is an intelligent safety monitoring system engineered for open-cast iron ore mine vehicles and Heavy Earth Moving Machinery (HEMMs) — including 100-ton haul trucks, hydraulic shovels, surface excavators, and dust sprinkler units.

Mining haul roads operate in hazardous and rapidly shifting conditions: sudden valley fog inversions, dense iron ore blast dust clouds, monsoonal rain, blind turns along pit benches, steep road gradients, and severe corrugated ground shock. DEEPFOG provides real-time situational awareness and multi-sensor early warning for vehicle operators and mine control-room dispatchers.

---

## 2. Problem Statement

Open-cast surface mines present extreme hazards for heavy machinery:
- **Low Visibility**: Morning fog and dry drilling/blasting dust reduce sight distance to under 5 meters.
- **Single-Sensor Failures**: A simple light sensor cannot distinguish between nightfall, safe darkness, and a dense fog bank; an accelerometer cannot differentiate a road pothole from a vehicle impact.
- **Blind Collisions**: Massive HEMMs have extensive blind spots; in dense dust/fog, operators cannot see nearby light vehicles, rock berms, or stopped equipment.
- **Delayed Warnings**: Systems relying solely on centralized cloud servers fail when Wi-Fi coverage drops in deep pit benches.

---

## 3. Proposed Solution

DEEPFOG solves these challenges through **Edge + Cloud Multi-Sensor Fusion**:
1. **On-Vehicle ESP32 Processing**: Reads an array of 7 environmental, inertial, and proximity sensors at 5 Hz.
2. **Immediate Edge Alerts**: If critical danger is detected, an in-cab OLED and high-decibel buzzer alert the driver immediately without waiting for network latency.
3. **Continuous Fleet Telemetry**: Transmits JSON telemetry packages over Wi-Fi to a Node.js REST API.
4. **Centralized Risk Analysis**: Evaluates compound risk rules, logs timeseries in PostgreSQL, and powers a real-time mine dispatch dashboard with interactive Leaflet GPS mapping, rolling trend charts, and alert management.

---

## 4. Key Features

- **Multi-Sensor Fusion Engine**: Evaluates visibility, toxic/combustible gas, ambient climate, obstacle proximity, sudden acceleration, vibration, and vehicle tilt together.
- **Compound Hazard Detection**: Specifically identifies blind proximity (fog + near obstacle), toxic inversion (high humidity + exhaust gas), and bench wall slip (steep tilt + severe vibration).
- **Industrial Control Room Dashboard**: Dark-mode visual hierarchy with risk heroes, sensor cards, live Leaflet GPS fleet tracking, and Chart.js rolling telemetry graphs.
- **Resilient Offline Architecture**: Drivers remain protected by local hardware alarms even when out of network range.
- **Standalone Demo Mode**: The web dashboard automatically runs realistic synthetic haul truck telemetry if backend or PostgreSQL is offline.
- **Hardware Simulator**: Includes `simulator/simulate_esp32.js` to simulate multiple HEMMs in an open-cast pit without physical hardware.

---

## 5. Technology Stack

- **Firmware**: C++ (Arduino ESP32 Core)
- **Edge Microcontroller**: ESP32 DevKit V1 (Xtensa Dual-Core 32-bit LX6)
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Frontend**: HTML5, Vanilla CSS3 (Custom Industrial Design System), Vanilla JavaScript (ES6+)
- **Data Visualization**: Chart.js 4.4, Leaflet.js 1.9 (Dark CartoDB tiles)
- **Security & Middleware**: Helmet, CORS, parameterized SQL queries, environment variables

---

## 6. Project Directory Structure

```
DEEPFOG/
├── backend/
│   ├── config/
│   │   └── database.js          # PostgreSQL connection pool & health check
│   ├── controllers/
│   │   ├── alertController.js     # Alert querying and acknowledgment
│   │   ├── dashboardController.js # Aggregated fleet dashboard API
│   │   ├── sensorController.js    # Sensor ingestion & history
│   │   └── vehicleController.js   # Vehicle registry endpoints
│   ├── middleware/
│   │   ├── errorHandler.js        # Global error handling middleware
│   │   └── validation.js          # Payload validation & sanitization
│   ├── models/
│   │   ├── alertModel.js          # Alert SQL queries
│   │   ├── sensorModel.js         # Sensor fusion engine & thresholds
│   │   └── vehicleModel.js        # Vehicle database operations
│   ├── routes/
│   │   ├── alertRoutes.js         # /api/alerts
│   │   ├── dashboardRoutes.js     # /api/dashboard
│   │   ├── sensorRoutes.js        # /api/sensors
│   │   └── vehicleRoutes.js       # /api/vehicles
│   ├── package.json               # Backend dependencies
│   └── server.js                  # Main Express server entry point
│
├── frontend/
│   ├── css/
│   │   └── style.css              # Industrial dark theme styling
│   ├── js/
│   │   ├── api.js                 # Backend REST API communication
│   │   ├── app.js                 # Main app router & demo fallback
│   │   ├── charts.js              # Chart.js time-series graphs
│   │   └── dashboard.js           # Dashboard UI & Leaflet GPS map
│   └── index.html                 # Main control room dashboard page
│
├── database/
│   └── schema.sql                 # PostgreSQL DDL, indices & seed data
│
├── esp32/
│   ├── config.h                   # Pin definitions & Wi-Fi settings
│   ├── deepfog_esp32.ino          # ESP32 firmware implementation
│   └── README.md                  # Hardware wiring & flashing guide
│
├── simulator/
│   └── simulate_esp32.js          # Multi-vehicle telemetry simulator
│
├── docs/
│   ├── architecture.md            # Detailed system architecture
│   └── sensor-fusion.md           # Mathematical scoring & compound rules
│
├── .env.example                   # Example environment configuration
├── .gitignore                     # Git ignore rules
└── README.md                      # Primary project documentation
```

---

## 7. Sensors & Hardware Responsibilities

| Sensor | Model | Measurement | Safety Responsibility |
|---|---|---|---|
| **Ambient Light / Visibility** | LDR Photoresistor | Light ADC (0–4095) | Detects fog density, dust clouds, and low-visibility conditions |
| **Gas / Smoke** | MQ-2 Sensor | Fume ADC (0–4095) | Detects dangerous vehicle exhaust, toxic smoke, and blast fumes |
| **Environmental** | DHT11 | Temp (°C), Humidity (%) | Identifies fog condensation conditions and heat stress |
| **Proximity** | HC-SR04 | Distance (cm) | Detects obstacles, light vehicles, rock berms, and blind spots |
| **Inertial / Motion** | MPU-6050 | Accel (g), Tilt (°) | Detects sudden braking, road shocks, impacts, and vehicle tilt |
| **Vibration** | SW-420 | Intensity (0–1) | Detects haul road degradation, washboard corrugation, machine stress |
| **Geospatial** | NEO-6M | Latitude, Longitude | Provides real-time haul road location coordinates |
| **Driver Display** | SSD1306 OLED | 128x64 pixels | Displays immediate in-cab risk status and primary sensor values |
| **Acoustic Warning** | Active Buzzer | 85 dB tone | Provides immediate audible alert when entering high risk |

---

## 8. Installation & Setup Guide

### Step 1: Database Setup (PostgreSQL)

1. Open `psql` or pgAdmin:
   ```bash
   psql -U postgres
   ```
2. Create the database:
   ```sql
   CREATE DATABASE deepfog;
   ```
3. Run the schema and seed script:
   ```bash
   psql -U postgres -d deepfog -f database/schema.sql
   ```

### Step 2: Backend Configuration & Startup

1. Open a terminal in `backend/`:
   ```bash
   cd backend
   npm install
   ```
2. Create your `.env` file (copy from `.env.example` in root):
   ```env
   PORT=4000
   NODE_ENV=development
   DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/deepfog
   FRONTEND_URL=*
   ESP32_API_KEY=deepfog_secret_telemetry_key_2026
   ```
3. Start the server:
   ```bash
   npm start
   ```
   *The server starts on `http://localhost:4000`.*

### Step 3: Frontend Launch

- **Option A (Unified Server)**: The backend automatically serves the frontend at `http://localhost:4000/`. Simply open `http://localhost:4000/` in any browser!
- **Option B (Direct Browser)**: Double-click `frontend/index.html` to open it directly in Chrome/Edge/Firefox. If the backend is running, it will automatically connect; if offline, it will automatically activate **Demo Mode** with live synthetic telemetry.

### Step 4: Running the Hardware Simulator (Optional)

If you don't have physical ESP32 hardware connected, run the multi-vehicle simulator to stream live data:
```bash
node simulator/simulate_esp32.js
```
You will see live telemetry streaming into the backend, triggering risk calculations, updating the map, plotting charts, and generating alerts!

### Step 5: Flashing Physical ESP32 Hardware

1. Follow the step-by-step guide in [`esp32/README.md`](file:///C:/Users/mukil/.gemini/antigravity-ide/scratch/DEEPFOG/esp32/README.md).
2. Wire the sensors according to the pinout table.
3. Open `esp32/config.h`, set your local Wi-Fi SSID, password, and the IP address of your backend server.
4. Upload `esp32/deepfog_esp32.ino` using the Arduino IDE.

---

## 9. Prototype Disclaimer

> [!WARNING]
> **DEVELOPMENT & DEMONSTRATION PROTOTYPE**  
> DEEPFOG is a prototype and educational demonstration system developed for technical evaluation and hackathons. It does **not** carry industrial safety certification, guaranteed accident prevention capability, or statutory mine safety compliance. Real-world deployment in active open-cast mining operations requires certified intrinsically safe (IS) explosion-proof enclosures, SIL-2/SIL-3 functional safety validation, industrial-grade calibrated sensors, ruggedized CAN-bus/automotive wiring, redundant communication links, and formal regulatory approval.
