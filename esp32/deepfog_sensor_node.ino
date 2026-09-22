/*
 * DEEPFOG — ESP32 Sensor Node Firmware
 * Intelligent Mine Vehicle Safety & Low-Visibility Monitoring System
 *
 * This firmware reads from real sensors connected to an ESP32 and sends
 * the data via HTTP POST to the DEEPFOG Supabase Edge Function.
 *
 * === WIRING GUIDE ===
 *
 * Sensor          → ESP32 Pin
 * ─────────────────────────────
 * DHT22 (temp/hum) → GPIO 4
 * MQ-7 (CO)        → GPIO 34 (ADC1_CH4)
 * MQ-4 (CH4)       → GPIO 35 (ADC1_CH7)
 * MQ-136 (H2S)     → GPIO 32 (ADC1_CH4)
 * SW-420 (vibration)→ GPIO 25 (digital) or ADC pin
 * GP2Y1014AU0F (dust) → GPIO 26 (LED control), GPIO 33 (analog)
 * NEO-6M GPS       → GPIO 16 (RX), GPIO 17 (TX)
 * Battery divider  → GPIO 13 (ADC)
 *
 * Libraries required (Arduino Library Manager):
 *  - WiFi
 *  - HTTPClient
 *  - ArduinoJson (by Benoit Blanchon)
 *  - DHT sensor library (by Adafruit)
 *  - TinyGPSPlus (by Mikal Hart)
 *
 * === CONFIGURATION ===
 * 1. Set WIFI_SSID and WIFI_PASSWORD to your mine network
 * 2. Set VEHICLE_CODE to match the code registered in the DEEPFOG dashboard
 * 3. Set SUPABASE_URL and SUPABASE_ANON_KEY from your Supabase project
 * 4. Upload and monitor via Serial at 115200 baud
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <TinyGPSPlus.h>

// ==================== CONFIGURATION ====================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* VEHICLE_CODE = "TRUCK01";

const char* SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const char* SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// Sensor pin assignments
#define DHTPIN          4
#define DHTTYPE         DHT22
#define MQ7_PIN         34   // CO sensor analog
#define MQ4_PIN         35   // CH4 sensor analog
#define MQ136_PIN       32   // H2S sensor analog
#define VIBRATION_PIN   25   // Vibration digital pin
#define DUST_LED_PIN    26   // Dust sensor LED control
#define DUST_ANALOG_PIN 33   // Dust sensor analog
#define BATTERY_PIN     13   // Battery voltage divider

// GPS serial pins (NEO-6M)
#define RX_PIN 16
#define TX_PIN 17

// Timing
#define SENSOR_INTERVAL_MS  5000   // Read + transmit every 5 seconds
#define GPS_BAUD           9600

// ==================== GLOBALS ====================
DHT dht(DHTPIN, DHTTYPE);
TinyGPSPlus gps;
HardwareSerial gpsSerial(1);

unsigned long lastTransmission = 0;

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== DEEPFOG ESP32 Sensor Node ===");
  Serial.printf("Vehicle: %s\n", VEHICLE_CODE);

  // Initialize sensors
  dht.begin();
  pinMode(VIBRATION_PIN, INPUT);
  pinMode(DUST_LED_PIN, OUTPUT);
  pinMode(MQ7_PIN, INPUT);
  pinMode(MQ4_PIN, INPUT);
  pinMode(MQ136_PIN, INPUT);
  pinMode(BATTERY_PIN, INPUT);

  // Initialize GPS
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, RX_PIN, TX_PIN);

  // Connect to WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.printf("Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());
}

// ==================== SENSOR READ FUNCTIONS ====================

float readVisibilityMeter() {
  // Fog/dust visibility estimation based on dust sensor or a dedicated sensor
  // If using an optical visibility sensor, read it here.
  // As a placeholder we derive a rough visibility from dust PM2.5.
  // In production, use a dedicated fog/visibility sensor (e.g. Vaisala PWD series).
  float dust = readDustPM25();
  if (dust < 0) return 200.0; // No dust sensor → assume clear
  // Higher dust = lower visibility (inverse relationship)
  float vis = 200.0 - (dust * 1.0);
  if (vis < 1.0) vis = 1.0;
  return vis;
}

float readCO_ppm() {
  // MQ-7: read analog, convert to ppm
  // Calibration values vary — calibrate with known CO concentration
  int raw = analogRead(MQ7_PIN);
  float voltage = raw * (3.3 / 4095.0);
  // Simplified conversion — replace with calibrated formula
  float ppm = (voltage - 0.1) * 100.0;
  if (ppm < 0) ppm = 0;
  return ppm;
}

float readCH4_ppm() {
  // MQ-4: read analog, convert to ppm
  int raw = analogRead(MQ4_PIN);
  float voltage = raw * (3.3 / 4095.0);
  // Simplified conversion — replace with calibrated formula
  float ppm = (voltage - 0.1) * 2000.0;
  if (ppm < 0) ppm = 0;
  return ppm;
}

float readH2S_ppm() {
  // MQ-136: read analog, convert to ppm
  int raw = analogRead(MQ136_PIN);
  float voltage = raw * (3.3 / 4095.0);
  // Simplified conversion — replace with calibrated formula
  float ppm = (voltage - 0.1) * 50.0;
  if (ppm < 0) ppm = 0;
  return ppm;
}

float readVibration() {
  // SW-420: measure vibration intensity
  // Read analog from the digital pin's PWM or use an analog vibration sensor
  // For digital: count triggers in a window
  unsigned long start = millis();
  int triggers = 0;
  while (millis() - start < 100) {  // Sample for 100ms
    if (digitalRead(VIBRATION_PIN) == HIGH) {
      triggers++;
      delay(1);
    }
  }
  // Convert trigger count to approximate mm/s (calibrate to your sensor)
  float mm_s = triggers * 0.5;
  return mm_s;
}

float readDustPM25() {
  // GP2Y1014AU0F dust sensor
  digitalWrite(DUST_LED_PIN, LOW);
  delayMicroseconds(280);
  int raw = analogRead(DUST_ANALOG_PIN);
  delayMicroseconds(40);
  digitalWrite(DUST_LED_PIN, HIGH);
  delayMicroseconds(9680);

  float voltage = raw * (3.3 / 4095.0);
  // Convert voltage to µg/m³ (calibrate to your sensor)
  float dust = (voltage - 0.6) * 100.0;
  if (dust < 0) dust = 0;
  return dust;
}

float readDustPM10() {
  // PM10 is typically ~1.5-2x PM2.5 for mine dust
  float pm25 = readDustPM25();
  return pm25 * 1.8;
}

float readBatteryPct() {
  int raw = analogRead(BATTERY_PIN);
  float voltage = raw * (3.3 / 4095.0) * 2.0;  // Divider factor
  // Map 3.0V (0%) to 4.2V (100%) for LiPo
  float pct = ((voltage - 3.0) / 1.2) * 100.0;
  if (pct > 100) pct = 100;
  if (pct < 0) pct = 0;
  return pct;
}

void readGPS(float &lat, float &lng, float &speed) {
  lat = 0;
  lng = 0;
  speed = 0;

  // Read GPS data for up to 1 second
  unsigned long start = millis();
  while (millis() - start < 1000) {
    while (gpsSerial.available() > 0) {
      gps.encode(gpsSerial.read());
    }
  }

  if (gps.location.isValid()) {
    lat = gps.location.lat();
    lng = gps.location.lng();
  }
  if (gps.speed.isValid()) {
    speed = gps.speed.kmph();
  }
}

// ==================== DATA TRANSMISSION ====================
void sendSensorData() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, skipping transmission");
    return;
  }

  // Read all sensors
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  float co = readCO_ppm();
  float ch4 = readCH4_ppm();
  float h2s = readH2S_ppm();
  float vibration = readVibration();
  float pm25 = readDustPM25();
  float pm10 = readDustPM10();
  float visibility = readVisibilityMeter();
  float battery = readBatteryPct();

  float gpsLat, gpsLng, gpsSpeed;
  readGPS(gpsLat, gpsLng, gpsSpeed);

  // Build JSON payload
  StaticJsonDocument<512> doc;
  doc["vehicle_code"] = VEHICLE_CODE;
  doc["visibility_m"] = visibility;
  doc["co_ppm"] = co;
  doc["ch4_ppm"] = ch4;
  doc["h2s_ppm"] = h2s;
  doc["vibration_mm_s"] = vibration;
  doc["temperature_c"] = isnan(temp) ? 0.0 : temp;
  doc["humidity_pct"] = isnan(hum) ? 0.0 : hum;
  doc["dust_pm25"] = pm25;
  doc["dust_pm10"] = pm10;
  doc["battery_pct"] = battery;

  if (gpsLat != 0) {
    doc["latitude"] = gpsLat;
    doc["longitude"] = gpsLng;
    doc["speed_kmh"] = gpsSpeed;
  }

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  // Send HTTP POST
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/sensor-ingest";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("apikey", SUPABASE_ANON_KEY);

  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("HTTP %d: %s\n", httpResponseCode, response.c_str());
  } else {
    Serial.printf("HTTP Error: %s\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end();

  // Print sensor summary
  Serial.println("--- Sensor Readings ---");
  Serial.printf("Visibility:  %.1f m\n", visibility);
  Serial.printf("CO:          %.1f ppm\n", co);
  Serial.printf("CH4:         %.0f ppm\n", ch4);
  Serial.printf("H2S:         %.1f ppm\n", h2s);
  Serial.printf("Vibration:   %.2f mm/s\n", vibration);
  Serial.printf("Temp:        %.1f C\n", isnan(temp) ? 0 : temp);
  Serial.printf("Humidity:    %.0f %%\n", isnan(hum) ? 0 : hum);
  Serial.printf("PM2.5:       %.0f ug/m3\n", pm25);
  Serial.printf("PM10:        %.0f ug/m3\n", pm10);
  Serial.printf("Battery:     %.0f %%\n", battery);
  if (gpsLat != 0) {
    Serial.printf("GPS:         %.6f, %.6f @ %.1f km/h\n", gpsLat, gpsLng, gpsSpeed);
  }
  Serial.println("-----------------------");
}

// ==================== MAIN LOOP ====================
void loop() {
  // Process GPS data continuously
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  unsigned long now = millis();
  if (now - lastTransmission >= SENSOR_INTERVAL_MS) {
    lastTransmission = now;
    sendSensorData();
  }

  delay(10);
}
