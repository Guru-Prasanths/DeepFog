import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface SensorPayload {
  vehicle_code: string;
  visibility_m?: number;
  co_ppm?: number;
  ch4_ppm?: number;
  h2s_ppm?: number;
  vibration_mm_s?: number;
  temperature_c?: number;
  humidity_pct?: number;
  dust_pm25?: number;
  dust_pm10?: number;
  battery_pct?: number;
  latitude?: number;
  longitude?: number;
  speed_kmh?: number;
}

// === SENSOR FUSION + RISK CALCULATION ===
// Each sub-risk is scored 0-100 from real sensor thresholds based on
// mining industry safety standards (MSHA / OSHA exposure limits).
// Overall risk is a weighted average of sub-risks.

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerpRisk(value: number, safe: number, danger: number): number {
  // Linear interpolation: safe → 0 risk, danger → 100 risk
  if (danger === safe) return value >= danger ? 100 : 0;
  const pct = (value - safe) / (danger - safe);
  return Math.round(clamp(pct * 100, 0, 100));
}

function calcVisibilityRisk(visibilityM?: number): number {
  if (visibilityM === undefined || visibilityM === null) return 0;
  // Safe: >200m, danger: <10m (dense fog/dust)
  // Lower visibility = higher risk
  const safe = 200;
  const danger = 10;
  const pct = (safe - visibilityM) / (safe - danger);
  return Math.round(clamp(pct * 100, 0, 100));
}

function calcGasRisk(
  co?: number,
  ch4?: number,
  h2s?: number
): number {
  const risks: number[] = [];
  // CO: OSHA PEL 50ppm, danger 200ppm (IDLH 1200)
  if (co !== undefined && co !== null) risks.push(lerpRisk(co, 25, 150));
  // CH4: LEL 5% = 50000ppm, danger 1% = 10000ppm
  if (ch4 !== undefined && ch4 !== null) risks.push(lerpRisk(ch4, 1000, 10000));
  // H2S: OSHA PEL 20ppm, IDLH 100ppm
  if (h2s !== undefined && h2s !== null) risks.push(lerpRisk(h2s, 10, 100));
  if (risks.length === 0) return 0;
  return Math.round(Math.max(...risks));
}

function calcVibrationRisk(vibration?: number): number {
  if (vibration === undefined || vibration === null) return 0;
  // ISO 10816: <2.8 mm/s normal, >11.2 mm/s dangerous
  return lerpRisk(vibration, 2.8, 11.2);
}

function calcThermalRisk(temp?: number): number {
  if (temp === undefined || temp === null) return 0;
  // Safe: <45°C, danger: >85°C (equipment overheating)
  return lerpRisk(temp, 45, 85);
}

function calcDustRisk(pm25?: number, pm10?: number): number {
  const risks: number[] = [];
  // PM2.5: WHO safe <15µg/m³ daily, danger >150µg/m³
  if (pm25 !== undefined && pm25 !== null) risks.push(lerpRisk(pm25, 15, 150));
  // PM10: WHO safe <45µg/m³, danger >250µg/m³
  if (pm10 !== undefined && pm10 !== null) risks.push(lerpRisk(pm10, 45, 250));
  if (risks.length === 0) return 0;
  return Math.round(Math.max(...risks));
}

function riskLevelFromScore(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "danger";
  if (score >= 40) return "warning";
  if (score >= 20) return "caution";
  return "safe";
}

function severityFromScore(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

interface AlertDef {
  type: string;
  message: string;
  threshold: number;
}

function generateAlerts(
  visibilityRisk: number,
  gasRisk: number,
  vibrationRisk: number,
  thermalRisk: number,
  dustRisk: number,
  vehicleName: string
): { type: string; severity: string; message: string }[] {
  const defs: AlertDef[] = [
    { type: "low_visibility", message: `Low visibility on ${vehicleName}`, threshold: 50 },
    { type: "gas_leak", message: `Hazardous gas levels on ${vehicleName}`, threshold: 50 },
    { type: "high_vibration", message: `Excessive vibration on ${vehicleName}`, threshold: 60 },
    { type: "thermal", message: `Thermal anomaly on ${vehicleName}`, threshold: 60 },
    { type: "dust", message: `High dust concentration on ${vehicleName}`, threshold: 50 },
  ];
  const riskValues = [visibilityRisk, gasRisk, vibrationRisk, thermalRisk, dustRisk];
  const alerts: { type: string; severity: string; message: string }[] = [];

  for (let i = 0; i < defs.length; i++) {
    if (riskValues[i] >= defs[i].threshold) {
      alerts.push({
        type: defs[i].type,
        severity: severityFromScore(riskValues[i]),
        message: defs[i].message,
      });
    }
  }
  return alerts;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "online", service: "DEEPFOG sensor-ingest", version: "1.0.0" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST to send sensor data." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body: SensorPayload = await req.json();
    const { vehicle_code, ...sensorData } = body;

    if (!vehicle_code) {
      return new Response(
        JSON.stringify({ error: "Missing required field: vehicle_code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up vehicle by code
    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, name")
      .eq("vehicle_code", vehicle_code)
      .maybeSingle();

    if (vehicleError) {
      return new Response(
        JSON.stringify({ error: `Database error: ${vehicleError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!vehicle) {
      return new Response(
        JSON.stringify({ error: `Unknown vehicle_code: ${vehicle_code}. Register the vehicle first.` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert sensor reading
    const { data: reading, error: readingError } = await supabase
      .from("sensor_readings")
      .insert({
        vehicle_id: vehicle.id,
        visibility_m: sensorData.visibility_m ?? null,
        co_ppm: sensorData.co_ppm ?? null,
        ch4_ppm: sensorData.ch4_ppm ?? null,
        h2s_ppm: sensorData.h2s_ppm ?? null,
        vibration_mm_s: sensorData.vibration_mm_s ?? null,
        temperature_c: sensorData.temperature_c ?? null,
        humidity_pct: sensorData.humidity_pct ?? null,
        dust_pm25: sensorData.dust_pm25 ?? null,
        dust_pm10: sensorData.dust_pm10 ?? null,
        battery_pct: sensorData.battery_pct ?? null,
        latitude: sensorData.latitude ?? null,
        longitude: sensorData.longitude ?? null,
        speed_kmh: sensorData.speed_kmh ?? null,
      })
      .select("id")
      .single();

    if (readingError) {
      return new Response(
        JSON.stringify({ error: `Failed to insert sensor reading: ${readingError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sensor fusion + risk calculation
    const visibilityRisk = calcVisibilityRisk(sensorData.visibility_m);
    const gasRisk = calcGasRisk(sensorData.co_ppm, sensorData.ch4_ppm, sensorData.h2s_ppm);
    const vibrationRisk = calcVibrationRisk(sensorData.vibration_mm_s);
    const thermalRisk = calcThermalRisk(sensorData.temperature_c);
    const dustRisk = calcDustRisk(sensorData.dust_pm25, sensorData.dust_pm10);

    // Weighted overall: visibility 25%, gas 25%, vibration 15%, thermal 15%, dust 20%
    const overallRisk = Math.round(
      visibilityRisk * 0.25 +
      gasRisk * 0.25 +
      vibrationRisk * 0.15 +
      thermalRisk * 0.15 +
      dustRisk * 0.20
    );

    const riskLevel = riskLevelFromScore(overallRisk);

    // Insert risk score
    const { error: riskError } = await supabase
      .from("risk_scores")
      .insert({
        vehicle_id: vehicle.id,
        reading_id: reading.id,
        overall_risk: overallRisk,
        visibility_risk: visibilityRisk,
        gas_risk: gasRisk,
        vibration_risk: vibrationRisk,
        thermal_risk: thermalRisk,
        dust_risk: dustRisk,
        risk_level: riskLevel,
      });

    if (riskError) {
      console.error("Risk insert error:", riskError.message);
    }

    // Generate and insert alerts
    const newAlerts = generateAlerts(
      visibilityRisk, gasRisk, vibrationRisk, thermalRisk, dustRisk, vehicle.name
    );

    if (newAlerts.length > 0) {
      const alertRows = newAlerts.map((a) => ({
        vehicle_id: vehicle.id,
        alert_type: a.type,
        severity: a.severity,
        message: a.message,
      }));
      const { error: alertError } = await supabase
        .from("alerts")
        .insert(alertRows);
      if (alertError) {
        console.error("Alert insert error:", alertError.message);
      }
    }

    // Update vehicle last_seen_at + GPS position
    const updateData: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (sensorData.latitude !== undefined) updateData.latitude = sensorData.latitude;
    if (sensorData.longitude !== undefined) updateData.longitude = sensorData.longitude;

    const { error: updateError } = await supabase
      .from("vehicles")
      .update(updateData)
      .eq("id", vehicle.id);

    if (updateError) {
      console.error("Vehicle update error:", updateError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        vehicle: vehicle.name,
        reading_id: reading.id,
        risk: {
          overall: overallRisk,
          level: riskLevel,
          visibility: visibilityRisk,
          gas: gasRisk,
          vibration: vibrationRisk,
          thermal: thermalRisk,
          dust: dustRisk,
        },
        alerts_generated: newAlerts.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
