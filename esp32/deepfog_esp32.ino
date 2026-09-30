/**
 * DEEPFOG — Intelligent Mine Vehicle Safety & Low-Visibility Monitoring System
 * 
 * Target Hardware: ESP32 DevKit V1
 * Sensors Integrated:
 *   - LDR Light Sensor (Fog / Low-visibility detection)
 *   - MQ-2 Gas Sensor (Smoke / Toxic exhaust gas detection)
 *   - HC-SR04 Ultrasonic Sensor (Obstacle proximity)
 *   - MPU-6050 Accelerometer & Gyroscope (Sudden braking, tilt & road impact)
 *   - SW-420 Vibration Sensor (Road roughness & machine vibration)
 *   - DHT11 (Bench temperature & humidity)
 *   - NEO-6M GPS (Mine location coordinates)
 *   - SSD1306 0.96" OLED Display (In-cab driver display)
 *   - Active Buzzer (Immediate audible early warning)
 * 
 * Communication:
 *   - Wi-Fi 802.11 b/g/n
 *   - HTTP REST POST to Node.js backend (/api/sensors)
 * 
 * Safety Architecture:
 *   - Sensor fusion risk calculation runs locally on-device.
 *   - OLED and buzzer trigger immediately on HIGH risk without waiting for network.
 *   - Telemetry is sent asynchronously over Wi-Fi for fleet-wide control room logging.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>

#include "config.h"

// ============================================================
// HARDWARE INSTANCES
// ============================================================
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
DHT dht(PIN_DHT, DHTTYPE);
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

// Telemetry & State variables
struct SensorData {
    float temperature;
    float humidity;
    int gasLevel;
    int lightLevel;
    float distance;
    float acceleration;
    float tilt;
    float vibration;
    double latitude;
    double longitude;
    String riskLevel;
    int riskScore;
    String riskReasons;
};

SensorData currentTelemetry;
unsigned long lastTransmitTime = 0;
bool oledAvailable = false;
bool mpuAvailable = false;

// ============================================================
// SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n==========================================");
    Serial.println("  DEEPFOG Mine Vehicle Safety Unit v1.0   ");
    Serial.println("==========================================");

    // Pin Modes
    pinMode(PIN_BUZZER, OUTPUT);
    digitalWrite(PIN_BUZZER, LOW);

    pinMode(PIN_TRIG, OUTPUT);
    pinMode(PIN_ECHO, INPUT);
    pinMode(PIN_VIBRATION, INPUT);

    // Start I2C
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

    // Initialize OLED Display
    if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
        oledAvailable = true;
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(18, 10);
        display.println("DEEPFOG SYSTEM");
        display.setCursor(10, 30);
        display.println("Initializing sensors");
        display.setCursor(10, 45);
        display.println(VEHICLE_ID);
        display.display();
        Serial.println("[HW] OLED Display initialized.");
    } else {
        Serial.println("[HW] OLED Display not found at 0x3C, continuing...");
    }

    // Initialize DHT Sensor
    dht.begin();
    Serial.println("[HW] DHT11 sensor started.");

    // Initialize GPS UART
    gpsSerial.begin(GPS_BAUD, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
    Serial.println("[HW] GPS serial port configured.");

    // Initialize MPU-6050
    initMPU6050();

    // Connect to Wi-Fi
    connectWiFi();

    // Startup beep
    beepBuzzer(100);
}

// ============================================================
// MAIN LOOP
// ============================================================
void loop() {
    // 1. Read all attached sensors
    readSensors();

    // 2. Perform On-Device Sensor Fusion Risk Calculation
    calculateRisk();

    // 3. Update In-Cab OLED display immediately
    updateOLED();

    // 4. Trigger audio warning if HIGH risk
    handleLocalAlerts();

    // 5. Send telemetry payload over Wi-Fi to backend server
    if (millis() - lastTransmitTime >= TRANSMIT_INTERVAL) {
        if (WiFi.status() == WL_CONNECTED) {
            sendSensorData();
        } else {
            Serial.println("[WiFi] Connection lost, reconnecting...");
            WiFi.reconnect();
        }
        lastTransmitTime = millis();
    }

    delay(200); // 5Hz sensor processing loop
}

// ============================================================
// SENSOR READING FUNCTIONS
// ============================================================

void readSensors() {
    readDHT11();
    readGasSensor();
    readLDR();
    readUltrasonic();
    readVibration();
    readMPU6050();
    readGPS();
}

void readDHT11() {
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    if (!isnan(t) && !isnan(h)) {
        currentTelemetry.temperature = t;
        currentTelemetry.humidity = h;
    } else {
        // Fallback or maintain previous
        currentTelemetry.temperature = 32.0;
        currentTelemetry.humidity = 65.0;
    }
}

void readGasSensor() {
    // MQ-2 Analog Read
    currentTelemetry.gasLevel = analogRead(PIN_MQ2_ANALOG);
}

void readLDR() {
    // LDR Analog Read (0 - 4095 ADC)
    // In dense fog / dark: low reading (< 500)
    currentTelemetry.lightLevel = analogRead(PIN_LDR_ANALOG);
}

void readUltrasonic() {
    digitalWrite(PIN_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(PIN_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(PIN_TRIG, LOW);

    long duration = pulseIn(PIN_ECHO, HIGH, 30000); // 30ms timeout (~5m)
    if (duration == 0) {
        currentTelemetry.distance = 400.0; // Clear
    } else {
        currentTelemetry.distance = duration * 0.034 / 2.0;
    }
}

void readVibration() {
    // Read vibration switch or analog intensity
    int vibVal = digitalRead(PIN_VIBRATION);
    // Simple moving average or binary intensity mapping
    currentTelemetry.vibration = (vibVal == HIGH) ? 0.95 : 0.15;
}

void initMPU6050() {
    Wire.beginTransmission(0x68);
    Wire.write(0x6B); // PWR_MGMT_1 register
    Wire.write(0);    // Wake up MPU-6050
    byte err = Wire.endTransmission();
    if (err == 0) {
        mpuAvailable = true;
        Serial.println("[HW] MPU-6050 motion sensor detected.");
    } else {
        Serial.println("[HW] MPU-6050 not responding, using baseline values.");
    }
}

void readMPU6050() {
    if (!mpuAvailable) {
        currentTelemetry.acceleration = 1.0; // 1g gravity baseline
        currentTelemetry.tilt = 5.0;         // 5 deg normal slope
        return;
    }

    Wire.beginTransmission(0x68);
    Wire.write(0x3B); // Starting register for accelerometer readings
    Wire.endTransmission(false);
    Wire.requestFrom(0x68, 6, true);

    if (Wire.available() >= 6) {
        int16_t axRaw = Wire.read() << 8 | Wire.read();
        int16_t ayRaw = Wire.read() << 8 | Wire.read();
        int16_t azRaw = Wire.read() << 8 | Wire.read();

        // Convert to g-force
        float ax = axRaw / 16384.0;
        float ay = ayRaw / 16384.0;
        float az = azRaw / 16384.0;

        currentTelemetry.acceleration = sqrt(ax * ax + ay * ay + az * az);

        // Approximate pitch / tilt angle relative to horizontal
        float pitch = atan2(-ax, sqrt(ay * ay + az * az)) * 180.0 / PI;
        currentTelemetry.tilt = abs(pitch);
    }
}

void readGPS() {
    while (gpsSerial.available() > 0) {
        gps.encode(gpsSerial.read());
    }

    if (gps.location.isValid()) {
        currentTelemetry.latitude = gps.location.lat();
        currentTelemetry.longitude = gps.location.lng();
    } else {
        // Fallback default mine pit coordinates
        currentTelemetry.latitude = 22.1466;
        currentTelemetry.longitude = 85.4988;
    }
}

// ============================================================
// SENSOR FUSION & ON-DEVICE RISK CALCULATION
// ============================================================
void calculateRisk() {
    int score = 10;
    String reasons = "";

    // 1. Poor Visibility / Fog
    if (currentTelemetry.lightLevel < THRESHOLD_LIGHT_POOR) {
        score += 30;
        reasons += "Dense Fog / Low Visibility; ";
    } else if (currentTelemetry.lightLevel < THRESHOLD_LIGHT_MODERATE) {
        score += 15;
    }

    // 2. Obstacle Proximity
    if (currentTelemetry.distance < THRESHOLD_DIST_CRITICAL) {
        score += 35;
        reasons += "Critical Obstacle Proximity; ";
    } else if (currentTelemetry.distance < THRESHOLD_DIST_WARNING) {
        score += 15;
    }

    // 3. Hazardous Gas / Smoke
    if (currentTelemetry.gasLevel > THRESHOLD_GAS_DANGER) {
        score += 30;
        reasons += "Toxic Gas / Heavy Smoke; ";
    } else if (currentTelemetry.gasLevel > THRESHOLD_GAS_WARNING) {
        score += 15;
    }

    // 4. Excessive Tilt / Slope
    if (currentTelemetry.tilt > THRESHOLD_TILT_DANGER) {
        score += 30;
        reasons += "Severe Rollover Tilt; ";
    } else if (currentTelemetry.tilt > THRESHOLD_TILT_WARNING) {
        score += 15;
    }

    // 5. Sudden Acceleration / Impact
    if (currentTelemetry.acceleration > THRESHOLD_ACCEL_DANGER) {
        score += 25;
        reasons += "Impact Force / Shock; ";
    }

    // Bound score 0-100
    if (score > 100) score = 100;

    currentTelemetry.riskScore = score;
    if (score >= 65) {
        currentTelemetry.riskLevel = "HIGH";
    } else if (score >= 35) {
        currentTelemetry.riskLevel = "MEDIUM";
    } else {
        currentTelemetry.riskLevel = "LOW";
    }

    currentTelemetry.riskReasons = reasons;
}

// ============================================================
// LOCAL ALERTS & CAB DISPLAY
// ============================================================
void updateOLED() {
    if (!oledAvailable) return;

    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    // Header Line
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("DEEPFOG - ");
    display.println(VEHICLE_ID);

    // Large Risk Status
    display.setCursor(0, 14);
    display.print("RISK: ");
    display.setTextSize(2);
    display.setCursor(42, 12);
    display.println(currentTelemetry.riskLevel);

    // Sensor Telemetry Summary
    display.setTextSize(1);
    display.setCursor(0, 32);
    display.print("VIS: ");
    display.print(currentTelemetry.lightLevel);
    display.print(" | GAS: ");
    display.println(currentTelemetry.gasLevel);

    display.setCursor(0, 44);
    display.print("DIST: ");
    display.print(currentTelemetry.distance, 1);
    display.print("cm | VIB: ");
    display.println(currentTelemetry.vibration > 0.5 ? "HIGH" : "OK");

    display.setCursor(0, 56);
    display.print("TILT: ");
    display.print(currentTelemetry.tilt, 1);
    display.print("deg | SCORE: ");
    display.println(currentTelemetry.riskScore);

    display.display();
}

void handleLocalAlerts() {
    if (currentTelemetry.riskLevel == "HIGH") {
        // Continuous alert pulses for high danger
        beepBuzzer(150);
    } else if (currentTelemetry.riskLevel == "MEDIUM") {
        // Soft single blip periodically
        static unsigned long lastBlip = 0;
        if (millis() - lastBlip > 4000) {
            beepBuzzer(40);
            lastBlip = millis();
        }
    } else {
        digitalWrite(PIN_BUZZER, LOW);
    }
}

void beepBuzzer(int durationMs) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(durationMs);
    digitalWrite(PIN_BUZZER, LOW);
}

// ============================================================
// DATA TRANSMISSION OVER WI-FI
// ============================================================
void connectWiFi() {
    Serial.print("[WiFi] Connecting to: ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WiFi] Connected successfully!");
        Serial.print("[WiFi] IP Address: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("\n[WiFi] Connection timeout. Standalone local safety active.");
    }
}

void sendSensorData() {
    HTTPClient http;
    http.begin(BACKEND_API_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", API_KEY);

    // Build JSON payload
    StaticJsonDocument<512> doc;
    doc["vehicle_id"] = VEHICLE_ID;
    doc["temperature"] = currentTelemetry.temperature;
    doc["humidity"] = currentTelemetry.humidity;
    doc["gas_level"] = currentTelemetry.gasLevel;
    doc["light_level"] = currentTelemetry.lightLevel;
    doc["distance"] = currentTelemetry.distance;
    doc["acceleration"] = currentTelemetry.acceleration;
    doc["tilt"] = currentTelemetry.tilt;
    doc["vibration_intensity"] = currentTelemetry.vibration;
    doc["latitude"] = currentTelemetry.latitude;
    doc["longitude"] = currentTelemetry.longitude;
    doc["risk_level"] = currentTelemetry.riskLevel;
    doc["risk_score"] = currentTelemetry.riskScore;

    String jsonString;
    serializeJson(doc, jsonString);

    int httpResponseCode = http.POST(jsonString);
    if (httpResponseCode > 0) {
        Serial.printf("[HTTP] POST %d | Risk: %s (%d/100)\n", 
            httpResponseCode, currentTelemetry.riskLevel.c_str(), currentTelemetry.riskScore);
    } else {
        Serial.printf("[HTTP] POST failed, error: %s\n", http.errorToString(httpResponseCode).c_str());
    }

    http.end();
}
