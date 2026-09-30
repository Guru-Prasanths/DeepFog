/**
 * DEEPFOG — ESP32 Configuration Header (config.h)
 * 
 * Hardware pin definitions, Wi-Fi credentials, backend API endpoints,
 * and on-device risk thresholds for the DEEPFOG vehicle safety unit.
 * 
 * Modify the values below to match your physical hardware and local network.
 */

#ifndef DEEPFOG_CONFIG_H
#define DEEPFOG_CONFIG_H

// ============================================================
// 1. VEHICLE IDENTIFICATION
// ============================================================
#define VEHICLE_ID        "HEMM-01"
#define VEHICLE_NAME      "Haul Truck Alpha"
#define VEHICLE_TYPE      "CAT 777E 100-Ton Hauler"

// ============================================================
// 2. WI-FI NETWORK CONFIGURATION
// ============================================================
// Replace with your local Wi-Fi router / mobile hotspot credentials
#define WIFI_SSID         "MINE_FLEET_WIFI"
#define WIFI_PASSWORD     "SafeMining2026"

// ============================================================
// 3. BACKEND API CONFIGURATION
// ============================================================
// Point to the machine running the DEEPFOG Node.js backend server
// Example: http://192.168.1.105:4000/api/sensors
#define BACKEND_API_URL   "http://192.168.1.100:4000/api/sensors"
#define API_KEY           "deepfog_secret_telemetry_key_2026"
#define TRANSMIT_INTERVAL 3000   // Send sensor telemetry every 3000ms (3 seconds)

// ============================================================
// 4. GPIO PIN DEFINITIONS (ESP32 DevKit V1)
// ============================================================

// I2C Bus (Shared by MPU-6050 and SSD1306 OLED)
#define PIN_I2C_SDA       21
#define PIN_I2C_SCL       22
#define OLED_RESET        -1     // Reset pin # (or -1 if sharing Arduino reset pin)
#define SCREEN_WIDTH      128    // OLED display width, in pixels
#define SCREEN_HEIGHT     64     // OLED display height, in pixels
#define OLED_I2C_ADDR     0x3C   // Standard 0.96" SSD1306 I2C address

// DHT11 Environmental Sensor (Temperature & Humidity)
#define PIN_DHT           4
#define DHTTYPE           DHT11

// MQ-2 Gas & Smoke Sensor (Analog Input)
// Use ADC1 pins only when Wi-Fi is active (GPIO 32 - 39)
#define PIN_MQ2_ANALOG    34

// LDR Ambient Light / Visibility Sensor (Analog Input)
#define PIN_LDR_ANALOG    35

// SW-420 Vibration Sensor (Digital/Analog Input)
#define PIN_VIBRATION     32

// HC-SR04 Ultrasonic Distance Sensor
#define PIN_TRIG          5
#define PIN_ECHO          18

// Audio Warning Buzzer (Active / Passive)
#define PIN_BUZZER        2

// NEO-6M / NEO-8M GPS Module (HardwareSerial 2)
#define PIN_GPS_RX        16     // ESP32 RX2 connects to GPS TX
#define PIN_GPS_TX        17     // ESP32 TX2 connects to GPS RX
#define GPS_BAUD          9600

// ============================================================
// 5. LOCAL HARDWARE THRESHOLDS (ON-DEVICE RISK CALCULATION)
// ============================================================
#define THRESHOLD_LIGHT_POOR      500     // ADC reading below 500 = dense fog / darkness
#define THRESHOLD_LIGHT_MODERATE  1500    // ADC reading below 1500 = low visibility
#define THRESHOLD_GAS_WARNING     400     // ADC reading above 400 = gas warning
#define THRESHOLD_GAS_DANGER      700     // ADC reading above 700 = hazardous fumes
#define THRESHOLD_DIST_CRITICAL   100     // Distance under 100 cm (1.0 meter)
#define THRESHOLD_DIST_WARNING    250     // Distance under 250 cm (2.5 meters)
#define THRESHOLD_ACCEL_WARNING   2.5     // Sudden acceleration / braking (g)
#define THRESHOLD_ACCEL_DANGER    4.0     // Impact / shock force (g)
#define THRESHOLD_TILT_WARNING    15.0    // Hazardous slope angle (degrees)
#define THRESHOLD_TILT_DANGER     28.0    // Rollover risk angle (degrees)

#endif // DEEPFOG_CONFIG_H
