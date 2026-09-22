/*
# DEEPFOG — Intelligent Mine Vehicle Safety & Low-Visibility Monitoring System

## Overview
Creates the full database schema for DEEPFOG, an IoT mine vehicle safety monitoring system.
ESP32 devices on mine vehicles send sensor readings via HTTP REST API (edge function).
The system performs sensor fusion, calculates risk scores, generates alerts, and feeds a
real-time web dashboard via Supabase realtime subscriptions.

## New Tables

### vehicles
Mine vehicles equipped with ESP32 sensor nodes.
- id (uuid, PK)
- name (text) — display name, e.g. "Haul Truck 01"
- vehicle_code (text, unique) — identifier used by ESP32 when posting data
- latitude (numeric) — last known GPS latitude
- longitude (numeric) — last known GPS longitude
- status (text) — 'active', 'idle', 'maintenance' (default 'active')
- last_seen_at (timestamptz) — last sensor reading timestamp
- created_at, updated_at

### sensor_readings
Raw sensor data from ESP32 devices. One row per reading.
- id (uuid, PK)
- vehicle_id (uuid, FK → vehicles)
- visibility_m (numeric) — visibility in meters (fog/dust sensor)
- co_ppm (numeric) — carbon monoxide in ppm
- ch4_ppm (numeric) — methane in ppm
- h2s_ppm (numeric) — hydrogen sulfide in ppm
- vibration_mm_s (numeric) — vibration in mm/s
- temperature_c (numeric) — temperature in °C
- humidity_pct (numeric) — relative humidity %
- dust_pm25 (numeric) — PM2.5 in µg/m³
- dust_pm10 (numeric) — PM10 in µg/m³
- battery_pct (numeric) — battery level %
- latitude (numeric) — GPS latitude at reading time
- longitude (numeric) — GPS longitude at reading time
- speed_kmh (numeric) — vehicle speed km/h
- created_at (timestamptz, defaults now())

### risk_scores
Calculated risk scores per sensor reading. Sensor fusion + weighted risk model.
- id (uuid, PK)
- vehicle_id (uuid, FK → vehicles)
- overall_risk (integer 0-100)
- visibility_risk (integer 0-100)
- gas_risk (integer 0-100)
- vibration_risk (integer 0-100)
- thermal_risk (integer 0-100)
- dust_risk (integer 0-100)
- risk_level (text) — 'safe', 'caution', 'warning', 'danger', 'critical'
- reading_id (uuid, FK → sensor_readings)
- created_at (timestamptz)

### alerts
Alerts generated when risk thresholds are exceeded.
- id (uuid, PK)
- vehicle_id (uuid, FK → vehicles)
- alert_type (text) — e.g. 'low_visibility', 'gas_leak', 'high_vibration', 'thermal', 'dust'
- severity (text) — 'low', 'medium', 'high', 'critical'
- message (text) — human-readable alert message
- acknowledged (boolean, default false)
- acknowledged_at (timestamptz, nullable)
- created_at (timestamptz)

## Security
- RLS enabled on all tables.
- This is a no-auth IoT monitoring system — the dashboard and ESP32 devices communicate
  via anon key. All policies use TO anon, authenticated with USING (true) since all data
  is intentionally shared/public (single-tenant monitoring system).

## Indexes
- sensor_readings(vehicle_id, created_at DESC) — for time-series queries
- risk_scores(vehicle_id, created_at DESC) — latest risk per vehicle
- alerts(vehicle_id, created_at DESC) — alert feed
- alerts(acknowledged) — filter unacknowledged alerts
*/

-- ===== VEHICLES =====
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vehicle_code text UNIQUE NOT NULL,
  latitude numeric DEFAULT NULL,
  longitude numeric DEFAULT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'maintenance')),
  last_seen_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_vehicles" ON vehicles;
CREATE POLICY "anon_select_vehicles" ON vehicles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_vehicles" ON vehicles;
CREATE POLICY "anon_insert_vehicles" ON vehicles FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_vehicles" ON vehicles;
CREATE POLICY "anon_update_vehicles" ON vehicles FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_vehicles" ON vehicles;
CREATE POLICY "anon_delete_vehicles" ON vehicles FOR DELETE
  TO anon, authenticated USING (true);

-- ===== SENSOR READINGS =====
CREATE TABLE IF NOT EXISTS sensor_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  visibility_m numeric DEFAULT NULL,
  co_ppm numeric DEFAULT NULL,
  ch4_ppm numeric DEFAULT NULL,
  h2s_ppm numeric DEFAULT NULL,
  vibration_mm_s numeric DEFAULT NULL,
  temperature_c numeric DEFAULT NULL,
  humidity_pct numeric DEFAULT NULL,
  dust_pm25 numeric DEFAULT NULL,
  dust_pm10 numeric DEFAULT NULL,
  battery_pct numeric DEFAULT NULL,
  latitude numeric DEFAULT NULL,
  longitude numeric DEFAULT NULL,
  speed_kmh numeric DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_readings" ON sensor_readings;
CREATE POLICY "anon_select_readings" ON sensor_readings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_readings" ON sensor_readings;
CREATE POLICY "anon_insert_readings" ON sensor_readings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_readings" ON sensor_readings;
CREATE POLICY "anon_update_readings" ON sensor_readings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_readings" ON sensor_readings;
CREATE POLICY "anon_delete_readings" ON sensor_readings FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_readings_vehicle_time ON sensor_readings (vehicle_id, created_at DESC);

-- ===== RISK SCORES =====
CREATE TABLE IF NOT EXISTS risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  reading_id uuid REFERENCES sensor_readings(id) ON DELETE CASCADE,
  overall_risk integer NOT NULL DEFAULT 0 CHECK (overall_risk >= 0 AND overall_risk <= 100),
  visibility_risk integer NOT NULL DEFAULT 0 CHECK (visibility_risk >= 0 AND visibility_risk <= 100),
  gas_risk integer NOT NULL DEFAULT 0 CHECK (gas_risk >= 0 AND gas_risk <= 100),
  vibration_risk integer NOT NULL DEFAULT 0 CHECK (vibration_risk >= 0 AND vibration_risk <= 100),
  thermal_risk integer NOT NULL DEFAULT 0 CHECK (thermal_risk >= 0 AND thermal_risk <= 100),
  dust_risk integer NOT NULL DEFAULT 0 CHECK (dust_risk >= 0 AND dust_risk <= 100),
  risk_level text NOT NULL DEFAULT 'safe' CHECK (risk_level IN ('safe', 'caution', 'warning', 'danger', 'critical')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE risk_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_risks" ON risk_scores;
CREATE POLICY "anon_select_risks" ON risk_scores FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_risks" ON risk_scores;
CREATE POLICY "anon_insert_risks" ON risk_scores FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_risks" ON risk_scores;
CREATE POLICY "anon_update_risks" ON risk_scores FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_risks" ON risk_scores;
CREATE POLICY "anon_delete_risks" ON risk_scores FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_risks_vehicle_time ON risk_scores (vehicle_id, created_at DESC);

-- ===== ALERTS =====
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message text NOT NULL,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_alerts" ON alerts;
CREATE POLICY "anon_select_alerts" ON alerts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_alerts" ON alerts;
CREATE POLICY "anon_insert_alerts" ON alerts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_alerts" ON alerts;
CREATE POLICY "anon_update_alerts" ON alerts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_alerts" ON alerts;
CREATE POLICY "anon_delete_alerts" ON alerts FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_alerts_vehicle_time ON alerts (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unack ON alerts (acknowledged, created_at DESC) WHERE acknowledged = false;
