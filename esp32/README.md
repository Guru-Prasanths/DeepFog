# DEEPFOG — ESP32 Hardware Guide & Firmware Setup

This directory contains the production-grade Arduino C++ firmware and pinout definitions for the **DEEPFOG Vehicle Safety & Low-Visibility Monitoring System**.

---

## Hardware Architecture

```
                                 ┌─────────────────────────┐
                                 │       ESP32 DevKit      │
                                 │   Microcontroller Core  │
                                 └───────────┬─────────────┘
                                             │
      ┌────────────────┬─────────────────────┼─────────────────────┬────────────────┐
      │                │                     │                     │                │
      ▼                ▼                     ▼                     ▼                ▼
┌───────────┐    ┌───────────┐         ┌───────────┐         ┌───────────┐    ┌───────────┐
│ LDR Light │    │ MQ-2 Gas  │         │  HC-SR04  │         │ MPU-6050  │    │  SW-420   │
│  (Fog)    │    │ (Smoke)   │         │ Ultrasonic│         │ 6-DOF IMU │    │ Vibration │
│  GPIO 35  │    │  GPIO 34  │         │GPIO 5 / 18│         │ I2C 21/22 │    │  GPIO 32  │
└───────────┘    └───────────┘         └───────────┘         └───────────┘    └───────────┘
      │                │                     │                     │                │
      └────────────────┴─────────────────────┼─────────────────────┴────────────────┘
                                             │
                                             ├─────────────────────┐
                                             ▼                     ▼
                                       ┌───────────┐         ┌───────────┐
                                       │  SSD1306  │         │  Active   │
                                       │ 0.96" OLED│         │  Buzzer   │
                                       │ I2C 21/22 │         │  GPIO 2   │
                                       └───────────┘         └───────────┘
```

---

## Pinout Map (ESP32 DevKit V1)

| Sensor / Actuator | Module Pin | ESP32 Pin | Interface | Function |
|---|---|---|---|---|
| **LDR Sensor** | Signal | `GPIO 35` | ADC1 Input | Measures ambient light & fog attenuation |
| **MQ-2 Gas** | A0 (Analog) | `GPIO 34` | ADC1 Input | Detects smoke, CO, hazardous mine gas fumes |
| **DHT11** | Data | `GPIO 4` | Digital I/O | Measures pit temperature and humidity |
| **HC-SR04** | TRIG | `GPIO 5` | Digital Out | Ultrasonic pulse trigger |
| **HC-SR04** | ECHO | `GPIO 18` | Digital In | Ultrasonic pulse return echo (use voltage divider) |
| **MPU-6050** | SDA | `GPIO 21` | I2C Data | 3-axis accelerometer and gyro (tilt, shocks) |
| **MPU-6050** | SCL | `GPIO 22` | I2C Clock | I2C Bus Clock |
| **SSD1306 OLED** | SDA | `GPIO 21` | I2C Data | In-cab real-time status display |
| **SSD1306 OLED** | SCL | `GPIO 22` | I2C Clock | In-cab real-time status display |
| **SW-420** | Digital Out | `GPIO 32` | Digital In | Measures severe machine / road vibration |
| **Active Buzzer** | Positive (+) | `GPIO 2` | Digital Out | Immediate local audible alarm |
| **NEO-6M GPS** | TX | `GPIO 16` | UART RX2 | Receives NMEA coordinates |
| **NEO-6M GPS** | RX | `GPIO 17` | UART TX2 | Transmits GPS configuration commands |

> **Note on ADC Pins**: Always connect analog sensors (LDR, MQ-2) to **ADC1** pins (GPIO 32–39) on the ESP32. ADC2 pins cannot be read reliably when Wi-Fi is transmitting.

---

## Required Arduino IDE Libraries

Install the following libraries via the **Arduino IDE Library Manager** (`Ctrl+Shift+I`):

1. **`Adafruit GFX Library`** (by Adafruit) — Core graphics primitives for OLED
2. **`Adafruit SSD1306`** (by Adafruit) — Driver for 128x64 I2C OLED display
3. **`DHT sensor library`** (by Adafruit) — Driver for DHT11 / DHT22 environmental sensors
4. **`TinyGPSPlus`** (by Mikal Hart) — NMEA GPS parser
5. **`ArduinoJson`** (by Benoit Blanchon, v6 or v7) — Fast JSON serialization for REST API payloads

---

## Flashing Instructions

1. Connect your ESP32 board to your PC via Micro-USB.
2. Open `deepfog_esp32.ino` in Arduino IDE.
3. Open `config.h` and configure:
   - `WIFI_SSID`: Your local Wi-Fi network name.
   - `WIFI_PASSWORD`: Your local Wi-Fi password.
   - `BACKEND_API_URL`: Your PC's local IP address (e.g. `http://192.168.1.100:4000/api/sensors`).
4. Select board: **Tools > Board > ESP32 Arduino > ESP32 Dev Module**.
5. Select port: **Tools > Port > COMx**.
6. Click **Upload**.
7. Open Serial Monitor at **115200 baud** to view real-time sensor reads and HTTP transmission logs.
