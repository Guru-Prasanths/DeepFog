/**
 * DEEPFOG — ESP32 Telemetry Hardware Simulator
 * 
 * Simulates multiple Heavy Earth Moving Machinery (HEMM) units operating
 * in an open-cast iron ore mine pit, generating real-time sensor readings
 * and streaming them to the DEEPFOG REST API (POST /api/sensors).
 * 
 * Usage:
 *   node simulator/simulate_esp32.js
 * 
 * Scenarios simulated dynamically:
 *   - Morning dense fog inversion
 *   - Blast dust and diesel exhaust accumulation
 *   - Rough corrugated haul road shocks & machine vibration
 *   - Proximity to rock berms and haul road obstacles
 *   - Hazardous slope incline / tilt
 */

const http = require('http');

// Configuration
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.API_PORT || 4000;
const API_PATH = '/api/sensors';
const INTERVAL_MS = 3000; // Transmit every 3 seconds

// Vehicle fleet in open-cast mine pit
const FLEET = [
    {
        id: 'HEMM-01',
        name: 'Haul Truck Alpha',
        type: 'CAT 777E 100-Ton Hauler',
        baseLat: 22.1466,
        baseLng: 85.4988,
        heading: 0.1
    },
    {
        id: 'HEMM-02',
        name: 'Excavator Bravo',
        type: 'Komatsu PC2000 Shovel',
        baseLat: 22.1492,
        baseLng: 85.5020,
        heading: 0.05
    },
    {
        id: 'HEMM-03',
        name: 'Water Sprinkler Truck',
        type: 'Volvo FMX 460 Dust Suppressor',
        baseLat: 22.1435,
        baseLng: 85.4950,
        heading: -0.08
    }
];

let tick = 0;

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║       DEEPFOG ESP32 FLEET HARDWARE SIMULATOR         ║');
console.log('║  Simulating real-time sensor streams to REST API     ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log(`[SIM] Target: http://${API_HOST}:${API_PORT}${API_PATH}`);
console.log(`[SIM] Fleet size: ${FLEET.length} mining vehicles`);
console.log(`[SIM] Transmission interval: ${INTERVAL_MS}ms\n`);

function generateReading(vehicle, step) {
    const t = step * 0.15;

    // Simulate changing pit conditions
    const isFog = (step % 20 > 10);
    const isDust = (step % 30 > 22);
    const isBumpy = (step % 12 > 9);
    const isCloseObstacle = (step % 25 === 7);

    // 1. Visibility / LDR (0 - 4095 ADC)
    let lightLevel = isFog ? Math.round(250 + Math.random() * 200) : Math.round(1800 + Math.random() * 400);

    // 2. Gas / Smoke MQ-2 (ADC)
    let gasLevel = isDust ? Math.round(550 + Math.random() * 200) : Math.round(180 + Math.random() * 90);

    // 3. Temperature & Humidity DHT11
    let temperature = Number((33.0 + Math.sin(t * 0.1) * 4).toFixed(1));
    let humidity = isFog ? Number((91.0 + Math.random() * 6).toFixed(1)) : Number((45.0 + Math.random() * 15).toFixed(1));

    // 4. Distance HC-SR04 (cm)
    let distance = isCloseObstacle ? Math.round(65 + Math.random() * 30) : Math.round(350 + Math.random() * 200);

    // 5. Acceleration MPU6050 (g)
    let acceleration = isBumpy ? Number((3.2 + Math.random() * 1.5).toFixed(2)) : Number((1.0 + (Math.random() - 0.5) * 0.2).toFixed(2));

    // 6. Tilt MPU6050 (degrees)
    let tilt = Number((6.0 + Math.abs(Math.sin(t * 0.3)) * 14).toFixed(1));

    // 7. Vibration SW-420 (0 - 1 intensity)
    let vibration = isBumpy ? Number((0.85 + Math.random() * 0.12).toFixed(2)) : Number((0.15 + Math.random() * 0.1).toFixed(2));

    // 8. GPS Coordinates (moving along haul road bench)
    let latitude = Number((vehicle.baseLat + Math.sin(t * 0.05 + vehicle.heading) * 0.0025).toFixed(6));
    let longitude = Number((vehicle.baseLng + Math.cos(t * 0.05 + vehicle.heading) * 0.0025).toFixed(6));

    return {
        vehicle_id: vehicle.id,
        temperature,
        humidity,
        gas_level: gasLevel,
        light_level: lightLevel,
        distance,
        acceleration,
        tilt,
        vibration_intensity: vibration,
        latitude,
        longitude
    };
}

function postSensorData(payload) {
    const postData = JSON.stringify(payload);

    const options = {
        hostname: API_HOST,
        port: API_PORT,
        path: API_PATH,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'X-API-Key': 'deepfog_secret_telemetry_key_2026'
        }
    };

    const req = http.request(options, (res) => {
        let responseBody = '';
        res.on('data', chunk => { responseBody += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(responseBody);
                if (res.statusCode === 200 || res.statusCode === 201) {
                    const risk = json.data?.risk_level || 'OK';
                    const score = json.data?.risk_score ?? '-';
                    const color = risk === 'HIGH' ? '\x1b[31m' : risk === 'MEDIUM' ? '\x1b[33m' : '\x1b[32m';
                    console.log(`[${new Date().toLocaleTimeString()}] ${payload.vehicle_id} → ${color}[${risk}] (Score: ${score}/100)\x1b[0m Vis:${payload.light_level} Gas:${payload.gas_level} Dist:${payload.distance}cm Accel:${payload.acceleration}g`);
                } else {
                    console.log(`[ERR] HTTP ${res.statusCode}:`, json?.error?.message || responseBody);
                }
            } catch {
                console.log(`[SIM] Response status: ${res.statusCode}`);
            }
        });
    });

    req.on('error', (err) => {
        console.error(`[SIM FAIL] Could not connect to DEEPFOG backend: ${err.message}`);
    });

    req.write(postData);
    req.end();
}

function runLoop() {
    tick++;
    for (const vehicle of FLEET) {
        const telemetry = generateReading(vehicle, tick);
        postSensorData(telemetry);
    }
}

// Initial run and interval schedule
runLoop();
setInterval(runLoop, INTERVAL_MS);
