/**
 * DEEPFOG — Dual-Mode Server (v3.0)
 * 
 * Intelligent Mine Vehicle Safety & Low-Visibility Monitoring System
 * 
 * DUAL-MODE ARCHITECTURE:
 *   DEMO_MODE=true  → In-memory SimEngine (no database required)
 *   DEMO_MODE=false → PostgreSQL database with real sensor ingestion
 *   AUTO-FALLBACK   → If PostgreSQL connection fails, auto-switches to demo mode
 * 
 * FEATURES:
 *   - REST API for dashboard, vehicles, sensors, alerts
 *   - WebSocket server for real-time push updates
 *   - Real ESP32 sensor data ingestion (POST /api/sensors)
 *   - Transparent data source labeling (REAL / SIMULATED)
 *   - Offline-first: no internet dependency for core operation
 * 
 * PROTOTYPE / DEMONSTRATION NOTICE:
 *   - Safe-speed recommendations are driver advisory only
 *   - Not deployed in a real mine
 *   - No autonomous vehicle control
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 4000;

// ============================================================
// SYSTEM STATE
// ============================================================

const SystemState = {
    mode: 'INITIALIZING',         // REAL_HARDWARE | SIMULATION | MIXED | INITIALIZING
    dbConnected: false,
    startTime: Date.now(),
    wsClients: new Set(),
    lastBroadcast: null,
};

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-API-Key']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    const ts = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`  [${ts}] ${req.method} ${req.url}`);
    next();
});

// ============================================================
// IN-MEMORY SIMULATED DATA ENGINE (preserved from v2.0)
// ============================================================

const SimEngine = (() => {
    let tick = 0;
    const startTime = Date.now();

    // Registered vehicles — DEEPFOG Fleet Operations
    const vehicles = [
        { vehicle_id: 'DF-01', name: 'CAT 797F Alpha', type: 'CAT 797F (240t)', status: 'active', payload_status: 'LOADED', sector: 'Sector-4A', created_at: new Date().toISOString() },
        { vehicle_id: 'DF-02', name: 'Komatsu 930E Bravo', type: 'Komatsu 930E', status: 'active', payload_status: 'EMPTY', sector: 'Sector-4B', created_at: new Date().toISOString() },
        { vehicle_id: 'DF-03', name: 'BelAZ 75710 Charlie', type: 'BelAZ 75710', status: 'active', payload_status: 'LOADING', sector: 'Sector-4C', created_at: new Date().toISOString() },
    ];

    // Sensor history buffer (last 100 readings per vehicle)
    const sensorHistory = {};
    vehicles.forEach(v => { sensorHistory[v.vehicle_id] = []; });

    // Alerts buffer
    const alerts = [];
    let alertIdCounter = 1;

    function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
    function jitter(mag) { return (Math.random() - 0.5) * 2 * mag; }

    /**
     * Generate a realistic sensor reading for a given vehicle
     */
    function generateReading(vehicleId, t) {
        const baseOffset = vehicleId.charCodeAt(4) || 0;
        const phase = baseOffset * 0.3;

        const temperature = clamp(30 + Math.sin((t + phase) * 0.03) * 5 + jitter(1.5), 18, 50);
        const humidity = clamp(65 + Math.sin((t + phase) * 0.04) * 15 + jitter(3), 25, 98);
        const gas_level = clamp(200 + Math.sin((t + phase) * 0.06) * 150 + jitter(40), 50, 900);
        const light_level = clamp(2500 + Math.sin((t + phase) * 0.05) * 2000 + jitter(300), 10, 4095);
        const distance = clamp(300 + Math.sin((t + phase) * 0.07) * 150 + jitter(30), 10, 500);
        const acceleration = clamp(1.0 + Math.sin((t + phase) * 0.08) * 0.5 + jitter(0.15), 0.2, 3.5);
        const tilt = clamp(2 + Math.sin((t + phase) * 0.09) * 3 + jitter(0.5), -10, 15);
        const vibration_intensity = clamp(0.3 + Math.sin((t + phase) * 0.1) * 0.4 + jitter(0.1), 0, 2.0);

        const lat = 22.1466 + (Math.sin(t * 0.01) * 0.005) + jitter(0.0001);
        const lng = 85.4988 + (Math.cos(t * 0.01) * 0.005) + jitter(0.0001);

        // Risk calculation (sensor fusion)
        let riskScore = 0;
        const reasons = [];

        const visRisk = clamp((1 - light_level / 4095) * 40, 0, 40);
        if (visRisk > 20) reasons.push('Low visibility');
        riskScore += visRisk;

        const gasRisk = clamp((gas_level / 900) * 25, 0, 25);
        if (gasRisk > 10) reasons.push('Elevated gas levels');
        riskScore += gasRisk;

        const distRisk = clamp((1 - distance / 500) * 20, 0, 20);
        if (distRisk > 12) reasons.push('Close obstacle detected');
        riskScore += distRisk;

        const vibRisk = clamp(vibration_intensity * 8, 0, 15);
        if (vibRisk > 8) reasons.push('High vibration');
        riskScore += vibRisk;

        riskScore = Math.round(clamp(riskScore, 0, 100));
        let risk_level = 'LOW';
        if (riskScore >= 70) risk_level = 'HIGH';
        else if (riskScore >= 40) risk_level = 'MEDIUM';

        const reading = {
            id: Date.now() + Math.random(),
            vehicle_id: vehicleId,
            temperature: Math.round(temperature * 10) / 10,
            humidity: Math.round(humidity * 10) / 10,
            gas_level: Math.round(gas_level),
            light_level: Math.round(light_level),
            distance: Math.round(distance * 10) / 10,
            acceleration: Math.round(acceleration * 100) / 100,
            tilt: Math.round(tilt * 10) / 10,
            vibration_intensity: Math.round(vibration_intensity * 100) / 100,
            latitude: Math.round(lat * 10000) / 10000,
            longitude: Math.round(lng * 10000) / 10000,
            risk_score: riskScore,
            risk_level: risk_level,
            risk_reasons: reasons,
            recorded_at: new Date().toISOString(),
            source: 'SIMULATED'
        };

        return reading;
    }

    /**
     * Generate an alert from a reading
     */
    function maybeGenerateAlert(reading) {
        if (reading.risk_level === 'HIGH' || (reading.risk_level === 'MEDIUM' && Math.random() > 0.7)) {
            const alertTypes = [
                { type: 'LOW_VISIBILITY', message: `Low visibility detected — light level ${reading.light_level} ADC` },
                { type: 'GAS_DETECTED', message: `Elevated gas level — MQ-2 reading ${reading.gas_level} ADC` },
                { type: 'CLOSE_OBSTACLE', message: `Obstacle proximity alert — ${reading.distance} cm` },
                { type: 'HIGH_VIBRATION', message: `High vibration — intensity ${reading.vibration_intensity}` },
                { type: 'EXCESSIVE_TILT', message: `Tilt warning — ${reading.tilt}° from vertical` },
            ];

            const alertInfo = alertTypes[Math.floor(Math.random() * alertTypes.length)];

            const alert = {
                id: alertIdCounter++,
                vehicle_id: reading.vehicle_id,
                alert_type: alertInfo.type,
                message: alertInfo.message,
                severity: reading.risk_level,
                risk_score: reading.risk_score,
                sensor_snapshot: {
                    temperature: reading.temperature,
                    gas_level: reading.gas_level,
                    light_level: reading.light_level,
                    distance: reading.distance,
                },
                status: 'ACTIVE',
                created_at: new Date().toISOString(),
                acknowledged_at: null,
                resolved_at: null,
                source: 'SIMULATED'
            };

            alerts.unshift(alert);
            if (alerts.length > 200) alerts.pop();
            return alert;
        }
        return null;
    }

    /**
     * Run a simulation tick
     */
    function simulateTick() {
        tick++;
        const newReadings = [];
        const newAlerts = [];

        vehicles.filter(v => v.status === 'active').forEach(v => {
            const reading = generateReading(v.vehicle_id, tick);
            sensorHistory[v.vehicle_id].unshift(reading);
            if (sensorHistory[v.vehicle_id].length > 100) {
                sensorHistory[v.vehicle_id].pop();
            }
            newReadings.push(reading);
            const alert = maybeGenerateAlert(reading);
            if (alert) newAlerts.push(alert);
        });

        return { newReadings, newAlerts };
    }

    // Pre-fill history with 30 readings per vehicle
    for (let i = 0; i < 30; i++) {
        tick++;
        vehicles.filter(v => v.status === 'active').forEach(v => {
            const reading = generateReading(v.vehicle_id, tick);
            reading.recorded_at = new Date(Date.now() - (30 - i) * 5000).toISOString();
            sensorHistory[v.vehicle_id].push(reading);
        });
    }

    // Generate a few initial alerts
    for (let i = 0; i < 5; i++) {
        const v = vehicles[Math.floor(Math.random() * vehicles.length)];
        const reading = sensorHistory[v.vehicle_id]?.[0];
        if (reading) {
            reading.risk_level = i < 2 ? 'HIGH' : 'MEDIUM';
            maybeGenerateAlert(reading);
        }
    }

    return {
        getVehicles: () => vehicles,
        getVehicle: (id) => vehicles.find(v => v.vehicle_id === id),
        getLatestReading: (vehicleId) => sensorHistory[vehicleId]?.[0] || null,
        getAllLatest: () => vehicles.filter(v => v.status === 'active').map(v => sensorHistory[v.vehicle_id]?.[0]).filter(Boolean),
        getHistory: (vehicleId, limit = 50) => (sensorHistory[vehicleId] || []).slice(0, limit),
        getAllHistory: (limit = 50) => {
            const all = [];
            Object.values(sensorHistory).forEach(hist => all.push(...hist));
            all.sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
            return all.slice(0, limit);
        },
        getAlerts: (filters = {}) => {
            let result = [...alerts];
            if (filters.vehicleId) result = result.filter(a => a.vehicle_id === filters.vehicleId);
            if (filters.severity) result = result.filter(a => a.severity === filters.severity);
            if (filters.status) result = result.filter(a => a.status === filters.status);
            return result.slice(0, filters.limit || 50);
        },
        getRecentAlerts: (limit = 20) => alerts.slice(0, limit),
        getAlertStats: () => {
            const total = alerts.length;
            const bySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0 };
            const byStatus = { ACTIVE: 0, ACKNOWLEDGED: 0, RESOLVED: 0 };
            alerts.forEach(a => {
                if (bySeverity[a.severity] !== undefined) bySeverity[a.severity]++;
                if (byStatus[a.status] !== undefined) byStatus[a.status]++;
            });
            return { total, bySeverity, byStatus };
        },
        getAlert: (id) => alerts.find(a => a.id === id),
        updateAlertStatus: (id, status) => {
            const alert = alerts.find(a => a.id === id);
            if (alert) {
                alert.status = status;
                if (status === 'ACKNOWLEDGED') alert.acknowledged_at = new Date().toISOString();
                if (status === 'RESOLVED') alert.resolved_at = new Date().toISOString();
                return alert;
            }
            return null;
        },
        simulateTick,
        tick: () => tick,
        uptime: () => Math.round((Date.now() - startTime) / 1000),
        // Ingest a REAL sensor reading into the SimEngine buffer (for mixed mode)
        ingestReading: (reading) => {
            reading.source = reading.source || 'REAL';
            const vid = reading.vehicle_id;
            if (!sensorHistory[vid]) {
                // Register new vehicle on-the-fly
                vehicles.push({
                    vehicle_id: vid,
                    name: vid,
                    type: 'ESP32 Device',
                    status: 'active',
                    created_at: new Date().toISOString()
                });
                sensorHistory[vid] = [];
            }
            sensorHistory[vid].unshift(reading);
            if (sensorHistory[vid].length > 100) sensorHistory[vid].pop();
            const alert = maybeGenerateAlert(reading);
            return { reading, alert };
        }
    };
})();


// ============================================================
// DATABASE CONNECTION (attempt when DEMO_MODE is not forced)
// ============================================================

let dbPool = null;

async function tryDatabaseConnection() {
    if (process.env.DEMO_MODE === 'true') {
        console.log('  [DB] DEMO_MODE=true — skipping PostgreSQL connection.');
        SystemState.mode = 'SIMULATION';
        return false;
    }

    try {
        const { pool, testConnection } = require('./config/database');
        const connected = await testConnection();
        if (connected) {
            dbPool = pool;
            SystemState.dbConnected = true;
            SystemState.mode = 'REAL_HARDWARE';
            console.log('  [DB] ✓ PostgreSQL connected — REAL mode active.');
            return true;
        }
    } catch (err) {
        console.warn(`  [DB] PostgreSQL connection failed: ${err.message}`);
    }

    console.log('  [DB] Auto-fallback to SIMULATION mode (PostgreSQL unavailable).');
    SystemState.mode = 'SIMULATION';
    return false;
}

// ============================================================
// RISK CALCULATION ENGINE (shared by both modes)
// ============================================================

function calculateRiskFromReading(reading) {
    let riskScore = 0;
    const reasons = [];

    // Visibility risk (LDR: lower = more dangerous)
    if (reading.light_level !== undefined) {
        const visRisk = Math.max(0, Math.min(40, (1 - reading.light_level / 4095) * 40));
        if (visRisk > 20) reasons.push('Low visibility');
        riskScore += visRisk;
    }

    // Gas risk (MQ-2)
    if (reading.gas_level !== undefined) {
        const gasRisk = Math.max(0, Math.min(25, (reading.gas_level / 900) * 25));
        if (gasRisk > 10) reasons.push('Elevated gas levels');
        riskScore += gasRisk;
    }

    // Obstacle proximity risk (HC-SR04)
    if (reading.distance !== undefined) {
        const distRisk = Math.max(0, Math.min(20, (1 - reading.distance / 500) * 20));
        if (distRisk > 12) reasons.push('Close obstacle detected');
        riskScore += distRisk;
    }

    // Vibration / motion risk (MPU6050)
    if (reading.vibration_intensity !== undefined) {
        const vibRisk = Math.max(0, Math.min(15, reading.vibration_intensity * 8));
        if (vibRisk > 8) reasons.push('High vibration');
        riskScore += vibRisk;
    }

    // Acceleration risk
    if (reading.acceleration !== undefined && reading.acceleration > 2.5) {
        riskScore += 10;
        reasons.push('High acceleration / impact');
    }

    // Tilt risk
    if (reading.tilt !== undefined && Math.abs(reading.tilt) > 15) {
        riskScore += 10;
        reasons.push('Hazardous tilt angle');
    }

    riskScore = Math.round(Math.max(0, Math.min(100, riskScore)));
    let risk_level = 'LOW';
    if (riskScore >= 70) risk_level = 'HIGH';
    else if (riskScore >= 40) risk_level = 'MEDIUM';

    return { risk_score: riskScore, risk_level, risk_reasons: reasons };
}


// Evaluate sensor statuses for dashboard display
function evaluateSensorStatuses(reading) {
    if (!reading) return null;
    return {
        visibility:   { status: reading.light_level > 2000 ? 'NORMAL' : reading.light_level > 800 ? 'WARNING' : 'DANGER', value: reading.light_level, unit: 'ADC' },
        gas:          { status: reading.gas_level < 300 ? 'NORMAL' : reading.gas_level < 600 ? 'WARNING' : 'DANGER', value: reading.gas_level, unit: 'ADC' },
        temperature:  { status: reading.temperature < 40 ? 'NORMAL' : reading.temperature < 45 ? 'WARNING' : 'DANGER', value: reading.temperature, unit: '°C' },
        humidity:     { status: reading.humidity < 80 ? 'NORMAL' : reading.humidity < 90 ? 'WARNING' : 'DANGER', value: reading.humidity, unit: '%' },
        vibration:    { status: (reading.vibration_intensity || 0) < 0.8 ? 'NORMAL' : (reading.vibration_intensity || 0) < 1.5 ? 'WARNING' : 'DANGER', value: reading.vibration_intensity || 0, unit: 'g' },
        distance:     { status: reading.distance > 200 ? 'NORMAL' : reading.distance > 80 ? 'WARNING' : 'DANGER', value: reading.distance, unit: 'cm' },
        acceleration: { status: reading.acceleration < 1.5 ? 'NORMAL' : reading.acceleration < 2.5 ? 'WARNING' : 'DANGER', value: reading.acceleration, unit: 'g' },
        tilt:         { status: Math.abs(reading.tilt) < 5 ? 'NORMAL' : Math.abs(reading.tilt) < 8 ? 'WARNING' : 'DANGER', value: reading.tilt, unit: '°' },
    };
}


// ============================================================
// WEBSOCKET SERVER
// ============================================================

let wss = null;

function initWebSocket(server) {
    try {
        const { WebSocketServer } = require('ws');
        wss = new WebSocketServer({ server, path: '/ws' });

        wss.on('connection', (ws, req) => {
            const clientId = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
            SystemState.wsClients.add(ws);
            console.log(`  [WS] Client connected: ${clientId} (total: ${SystemState.wsClients.size})`);

            // Send welcome message with system state
            ws.send(JSON.stringify({
                type: 'SYSTEM_STATE',
                data: {
                    mode: SystemState.mode,
                    dbConnected: SystemState.dbConnected,
                    uptime: Math.round((Date.now() - SystemState.startTime) / 1000),
                    wsClients: SystemState.wsClients.size,
                    timestamp: new Date().toISOString()
                }
            }));

            ws.on('close', () => {
                SystemState.wsClients.delete(ws);
                console.log(`  [WS] Client disconnected: ${clientId} (total: ${SystemState.wsClients.size})`);
            });

            ws.on('error', (err) => {
                console.error(`  [WS] Error on ${clientId}:`, err.message);
                SystemState.wsClients.delete(ws);
            });
        });

        console.log('  [WS] ✓ WebSocket server initialized on /ws');
    } catch (err) {
        console.warn('  [WS] WebSocket initialization failed:', err.message);
    }
}

/**
 * Broadcast a message to all connected WebSocket clients
 */
function wsBroadcast(type, data) {
    if (!wss) return;
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    SystemState.wsClients.forEach(ws => {
        if (ws.readyState === 1) { // WebSocket.OPEN
            try {
                ws.send(message);
            } catch (err) {
                console.error('  [WS] Broadcast error:', err.message);
            }
        }
    });
    SystemState.lastBroadcast = new Date().toISOString();
}


// ============================================================
// API ROUTES
// ============================================================

// --- Health Check ---
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'DEEPFOG API',
        version: '3.0.0',
        mode: SystemState.mode,
        database: SystemState.dbConnected ? 'PostgreSQL connected' : 'in-memory (demo mode)',
        uptime: Math.round((Date.now() - SystemState.startTime) / 1000),
        simulationTick: SimEngine.tick(),
        wsClients: SystemState.wsClients.size,
        timestamp: new Date().toISOString(),
        offlineCapable: true,
        note: SystemState.mode === 'SIMULATION'
            ? 'PROTOTYPE — simulated data for demonstration purposes only'
            : 'Receiving real sensor data from ESP32 devices'
    });
});

// --- Root API Info ---
app.get('/api', (req, res) => {
    res.json({
        service: 'DEEPFOG API',
        version: '3.0.0',
        mode: SystemState.mode,
        description: 'Intelligent Mine Vehicle Safety & Low-Visibility Monitoring System',
        offlineCapable: true,
        note: SystemState.mode === 'SIMULATION'
            ? 'PROTOTYPE — simulated data for demonstration purposes only'
            : 'Real sensor data mode active',
        endpoints: {
            health: 'GET /api/health',
            system_mode: 'GET /api/system/mode',
            dashboard: 'GET /api/dashboard',
            vehicles: 'GET /api/vehicles',
            sensors_latest: 'GET /api/sensors/latest',
            sensor_history: 'GET /api/sensors/history',
            post_sensor: 'POST /api/sensors',
            alerts: 'GET /api/alerts',
            recent_alerts: 'GET /api/alerts/recent',
            alert_stats: 'GET /api/alerts/stats',
            websocket: 'WS /ws'
        }
    });
});

// --- System Mode ---
app.get('/api/system/mode', (req, res) => {
    res.json({
        success: true,
        data: {
            mode: SystemState.mode,
            dbConnected: SystemState.dbConnected,
            wsClients: SystemState.wsClients.size,
            uptime: Math.round((Date.now() - SystemState.startTime) / 1000),
            offlineCapable: true,
            internetRequired: false,
            timestamp: new Date().toISOString()
        }
    });
});

// --- System Health ---
app.get('/api/system/health', (req, res) => {
    const health = {
        backend: { status: 'HEALTHY', uptime: Math.round((Date.now() - SystemState.startTime) / 1000) },
        database: { status: SystemState.dbConnected ? 'HEALTHY' : 'OFFLINE', type: SystemState.dbConnected ? 'PostgreSQL' : 'In-Memory' },
        websocket: { status: wss ? 'HEALTHY' : 'OFFLINE', clients: SystemState.wsClients.size },
        network: { status: 'HEALTHY', mode: 'LOCAL_LAN', internetRequired: false },
        dataMode: SystemState.mode,
    };
    res.json({ success: true, data: health });
});


// --- Dashboard (primary polling endpoint) ---
app.get('/api/dashboard', (req, res) => {
    const vehicles = SimEngine.getVehicles();
    const latestReadings = SimEngine.getAllLatest();
    const recentAlerts = SimEngine.getRecentAlerts(10);
    const alertStats = SimEngine.getAlertStats();

    const vehicleDashboards = vehicles.map(vehicle => {
        const reading = latestReadings.find(r => r.vehicle_id === vehicle.vehicle_id);
        const vehicleAlerts = recentAlerts.filter(a => a.vehicle_id === vehicle.vehicle_id);

        return {
            vehicle,
            latestReading: reading || null,
            sensorStatuses: reading ? evaluateSensorStatuses(reading) : null,
            riskLevel: reading ? reading.risk_level : 'N/A',
            riskScore: reading ? reading.risk_score : 0,
            riskReasons: reading ? reading.risk_reasons : [],
            activeAlerts: vehicleAlerts.length,
            lastUpdate: reading ? reading.recorded_at : null,
            isOnline: !!reading,
            dataSource: reading ? (reading.source || 'SIMULATED') : 'N/A'
        };
    });

    const activeVehicles = vehicleDashboards.filter(v => v.isOnline).length;
    const highestRisk = vehicleDashboards.reduce((highest, v) => {
        const priority = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'N/A': 0 };
        return (priority[v.riskLevel] || 0) > (priority[highest] || 0) ? v.riskLevel : highest;
    }, 'N/A');

    res.json({
        success: true,
        data: {
            system: {
                status: 'ONLINE',
                mode: SystemState.mode,
                activeVehicles,
                totalVehicles: vehicles.length,
                overallRisk: highestRisk,
                dbConnected: SystemState.dbConnected,
                wsClients: SystemState.wsClients.size,
                offlineCapable: true,
                internetRequired: false,
                timestamp: new Date().toISOString()
            },
            vehicles: vehicleDashboards,
            recentAlerts,
            alertStats
        }
    });
});

// --- Dashboard for specific vehicle ---
app.get('/api/dashboard/vehicle/:vehicleId', (req, res) => {
    const vehicleId = req.params.vehicleId;
    const vehicle = SimEngine.getVehicle(vehicleId);

    if (!vehicle) {
        return res.status(404).json({ success: false, error: { message: `Vehicle not found: ${vehicleId}` } });
    }

    const reading = SimEngine.getLatestReading(vehicleId);
    const history = SimEngine.getHistory(vehicleId, 50);
    const vehicleAlerts = SimEngine.getAlerts({ vehicleId });

    res.json({
        success: true,
        data: {
            vehicle,
            latestReading: reading,
            sensorStatuses: reading ? evaluateSensorStatuses(reading) : null,
            riskLevel: reading ? reading.risk_level : 'N/A',
            riskScore: reading ? reading.risk_score : 0,
            riskReasons: reading ? reading.risk_reasons : [],
            isOnline: !!reading,
            dataSource: reading ? (reading.source || 'SIMULATED') : 'N/A',
            recentHistory: history,
            activeAlerts: vehicleAlerts,
        }
    });
});

// --- Vehicles ---
app.get('/api/vehicles', (req, res) => {
    const vehicles = SimEngine.getVehicles();
    res.json({ success: true, count: vehicles.length, data: vehicles });
});

app.get('/api/vehicles/:vehicleId', (req, res) => {
    const vehicle = SimEngine.getVehicle(req.params.vehicleId);
    if (!vehicle) {
        return res.status(404).json({ success: false, error: { message: 'Vehicle not found' } });
    }
    res.json({ success: true, data: vehicle });
});

// --- Sensors ---
app.get('/api/sensors/latest', (req, res) => {
    const latest = SimEngine.getAllLatest();
    res.json({ success: true, count: latest.length, data: latest });
});

app.get('/api/sensors/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const vehicleId = req.query.vehicleId;

    let data;
    if (vehicleId) {
        data = SimEngine.getHistory(vehicleId, limit);
    } else {
        data = SimEngine.getAllHistory(limit);
    }
    res.json({ success: true, count: data.length, data });
});

app.get('/api/sensors/:vehicleId', (req, res) => {
    const reading = SimEngine.getLatestReading(req.params.vehicleId);
    if (!reading) {
        return res.status(404).json({ success: false, error: { message: 'No readings found for vehicle' } });
    }
    res.json({ success: true, data: reading });
});

// ============================================================
// REAL SENSOR DATA INGESTION (POST /api/sensors)
// This is the critical endpoint that receives data from ESP32
// ============================================================
app.post('/api/sensors', (req, res) => {
    const payload = req.body;
    const timestamp = new Date().toISOString();

    // Validate required fields
    if (!payload.vehicle_id) {
        return res.status(400).json({
            success: false,
            error: { message: 'Missing required field: vehicle_id' }
        });
    }

    // Calculate risk from real sensor data
    const risk = calculateRiskFromReading(payload);

    // Build enriched reading
    const enrichedReading = {
        id: Date.now() + Math.random(),
        vehicle_id: payload.vehicle_id,
        temperature: payload.temperature ?? null,
        humidity: payload.humidity ?? null,
        gas_level: payload.gas_level ?? null,
        light_level: payload.light_level ?? null,
        distance: payload.distance ?? null,
        acceleration: payload.acceleration ?? null,
        tilt: payload.tilt ?? null,
        vibration_intensity: payload.vibration_intensity ?? null,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        risk_score: risk.risk_score,
        risk_level: risk.risk_level,
        risk_reasons: risk.risk_reasons,
        recorded_at: timestamp,
        source: 'REAL'
    };

    // Ingest into SimEngine buffer (works in all modes)
    const { reading, alert } = SimEngine.ingestReading(enrichedReading);

    // If database is connected, also persist to PostgreSQL
    if (SystemState.dbConnected && dbPool) {
        const query = `
            INSERT INTO sensor_readings
                (vehicle_id, latitude, longitude, temperature, humidity, gas_level, light_level, distance, acceleration, tilt, vibration, risk_level, risk_score, risk_reasons)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
        `;
        const values = [
            enrichedReading.vehicle_id,
            enrichedReading.latitude,
            enrichedReading.longitude,
            enrichedReading.temperature,
            enrichedReading.humidity,
            enrichedReading.gas_level,
            enrichedReading.light_level,
            enrichedReading.distance,
            enrichedReading.acceleration,
            enrichedReading.tilt,
            enrichedReading.vibration_intensity > 0.5,
            enrichedReading.risk_level,
            enrichedReading.risk_score,
            `{${enrichedReading.risk_reasons.map(r => `"${r}"`).join(',')}}`
        ];

        dbPool.query(query, values).catch(err => {
            console.error('  [DB] Sensor persist error:', err.message);
        });

        // Persist alert if generated
        if (alert) {
            const alertQuery = `
                INSERT INTO alerts (vehicle_id, alert_type, severity, message, risk_score)
                VALUES ($1, $2, $3, $4, $5)
            `;
            dbPool.query(alertQuery, [
                alert.vehicle_id, alert.alert_type, alert.severity, alert.message, alert.risk_score
            ]).catch(err => {
                console.error('  [DB] Alert persist error:', err.message);
            });
        }
    }

    // Update system mode if we're receiving real data
    if (SystemState.mode === 'SIMULATION') {
        SystemState.mode = 'MIXED';
        console.log('  [MODE] Switched to MIXED — receiving real sensor data alongside simulation');
    }

    // Broadcast via WebSocket
    wsBroadcast('SENSOR_UPDATE', enrichedReading);
    if (alert) {
        wsBroadcast('ALERT', alert);
    }

    // Log
    const riskColor = risk.risk_level === 'HIGH' ? '\x1b[31m' : risk.risk_level === 'MEDIUM' ? '\x1b[33m' : '\x1b[32m';
    console.log(`  [SENSOR] ${payload.vehicle_id} → ${riskColor}${risk.risk_level}\x1b[0m (${risk.risk_score}/100) [REAL]`);

    res.json({
        success: true,
        data: {
            risk_level: risk.risk_level,
            risk_score: risk.risk_score,
            risk_reasons: risk.risk_reasons,
            persisted: SystemState.dbConnected,
            source: 'REAL',
            timestamp
        }
    });
});


// --- Alerts ---
app.get('/api/alerts', (req, res) => {
    const filters = {
        vehicleId: req.query.vehicleId,
        severity: req.query.severity,
        status: req.query.status,
        limit: parseInt(req.query.limit) || 50
    };
    const data = SimEngine.getAlerts(filters);
    res.json({ success: true, count: data.length, data });
});

app.get('/api/alerts/recent', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const data = SimEngine.getRecentAlerts(limit);
    res.json({ success: true, count: data.length, data });
});

app.get('/api/alerts/stats', (req, res) => {
    const stats = SimEngine.getAlertStats();
    res.json({ success: true, data: stats });
});

app.put('/api/alerts/:alertId/status', (req, res) => {
    const alertId = parseInt(req.params.alertId);
    const { status } = req.body;

    if (!['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'].includes(status)) {
        return res.status(400).json({ success: false, error: { message: 'Invalid status. Use ACTIVE, ACKNOWLEDGED, or RESOLVED.' } });
    }

    const alert = SimEngine.updateAlertStatus(alertId, status);
    if (!alert) {
        return res.status(404).json({ success: false, error: { message: 'Alert not found' } });
    }

    // Broadcast status change
    wsBroadcast('ALERT_STATUS', alert);

    res.json({ success: true, data: alert });
});


// ============================================================
// SERVE FRONTEND
// ============================================================

app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 404 for undefined API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: { message: `Route not found: ${req.method} ${req.originalUrl}` }
    });
});

// Fallback to frontend for non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Global error handler
app.use((err, req, res, _next) => {
    console.error('[ERROR]', err.message);
    res.status(err.statusCode || 500).json({
        success: false,
        error: { message: err.message || 'Internal server error' }
    });
});


// ============================================================
// SIMULATION TICKER + WEBSOCKET BROADCAST
// ============================================================

function startSimulationLoop() {
    setInterval(() => {
        if (SystemState.mode === 'SIMULATION' || SystemState.mode === 'MIXED') {
            const { newReadings, newAlerts } = SimEngine.simulateTick();

            // Broadcast to all WS clients
            if (newReadings.length > 0) {
                wsBroadcast('SENSOR_BATCH', {
                    readings: newReadings,
                    source: 'SIMULATED'
                });
            }
            newAlerts.forEach(alert => {
                wsBroadcast('ALERT', alert);
            });
        }
    }, 5000);
}


// ============================================================
// START SERVER
// ============================================================

async function startServer() {
    // 1. Attempt database connection
    await tryDatabaseConnection();

    // 2. Create HTTP server (needed for WebSocket upgrade)
    const server = http.createServer(app);

    // 3. Initialize WebSocket
    initWebSocket(server);

    // 4. Start simulation loop
    startSimulationLoop();

    // 5. Listen
    server.listen(PORT, () => {
        const modeLabel = {
            'REAL_HARDWARE': '🟢 REAL HARDWARE (PostgreSQL)',
            'SIMULATION': '🟡 DEMO SIMULATION (in-memory)',
            'MIXED': '🔵 MIXED MODE',
        }[SystemState.mode] || SystemState.mode;

        console.log('');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║                  DEEPFOG SERVER v3.0                     ║');
        console.log('║   Intelligent Mine Vehicle Safety & Low-Visibility       ║');
        console.log('║                Monitoring System                         ║');
        console.log('║                                                          ║');
        console.log(`║   ⚙  MODE: ${modeLabel.padEnd(43)}║`);
        console.log('║   🌐 OFFLINE-CAPABLE: Yes (no internet required)        ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');
        console.log(`  ✓ API server .......... http://localhost:${PORT}/api`);
        console.log(`  ✓ Dashboard ........... http://localhost:${PORT}`);
        console.log(`  ✓ WebSocket ........... ws://localhost:${PORT}/ws`);
        console.log(`  ✓ Health check ........ http://localhost:${PORT}/api/health`);
        console.log(`  ✓ System mode ......... ${SystemState.mode}`);
        console.log(`  ✓ Database ............ ${SystemState.dbConnected ? 'PostgreSQL connected' : 'In-memory (demo)'}`);
        console.log(`  ✓ Sensor POST ......... http://localhost:${PORT}/api/sensors`);
        console.log(`  ✓ Vehicles registered . ${SimEngine.getVehicles().length}`);
        console.log(`  ✓ Simulation engine ... ${SystemState.mode !== 'REAL_HARDWARE' ? 'running (tick every 5s)' : 'standby'}`);
        console.log('');
        if (SystemState.mode === 'SIMULATION') {
            console.log('  ⚠  Sensor data is SIMULATED. Safe-speed recommendations');
            console.log('     are for demonstration/driver advisory only.');
        } else {
            console.log('  ✓  Real sensor data ingestion active via POST /api/sensors');
            console.log('     ESP32 devices can send telemetry to this endpoint.');
        }
        console.log('');
        console.log('  📡 ESP32 ingestion endpoint:');
        console.log(`     POST http://<this-machine-ip>:${PORT}/api/sensors`);
        console.log('     Header: X-API-Key: <your-api-key>');
        console.log('     Body: JSON sensor payload');
        console.log('');
    });
}

// Export Express app for serverless platforms (e.g. Vercel)
module.exports = app;

if (require.main === module || !process.env.VERCEL) {
    startServer().catch(err => {
        console.error('[FATAL] Server startup failed:', err);
        process.exit(1);
    });
}
