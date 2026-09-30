/**
 * DEEPFOG — Standalone Demo Server
 * 
 * Intelligent Mine Vehicle Safety & Low-Visibility Monitoring System
 * 
 * This server runs WITHOUT PostgreSQL — it generates realistic simulated
 * mine vehicle telemetry in-memory so the full dashboard can be demonstrated
 * immediately. When PostgreSQL is available, the original models can be
 * restored by setting DEMO_MODE=false in .env.
 * 
 * PROTOTYPE / DEMONSTRATION ONLY:
 * - All sensor data is simulated
 * - Safe-speed recommendations are driver advisory only
 * - Not deployed in a real mine
 * - No autonomous vehicle control
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

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
// IN-MEMORY SIMULATED DATA ENGINE
// ============================================================

const SimEngine = (() => {
    let tick = 0;
    const startTime = Date.now();

    // Registered vehicles
    const vehicles = [
        { vehicle_id: 'HMV-042', name: 'Haul Truck Alpha', type: '240T Haul Truck', status: 'active', created_at: new Date().toISOString() },
        { vehicle_id: 'HMV-018', name: 'Haul Truck Bravo', type: '150T Haul Truck', status: 'active', created_at: new Date().toISOString() },
        { vehicle_id: 'WTL-003', name: 'Wheel Loader C3', type: 'Wheel Loader', status: 'active', created_at: new Date().toISOString() },
        { vehicle_id: 'DZR-011', name: 'Dozer D11', type: 'Dozer D9', status: 'active', created_at: new Date().toISOString() },
        { vehicle_id: 'GRD-007', name: 'Grader G7', type: 'Motor Grader', status: 'maintenance', created_at: new Date().toISOString() },
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
        const baseOffset = vehicleId.charCodeAt(4) || 0; // unique per vehicle
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

        // Visibility risk (light level: lower = more dangerous)
        const visRisk = clamp((1 - light_level / 4095) * 40, 0, 40);
        if (visRisk > 20) reasons.push('Low visibility');
        riskScore += visRisk;

        // Gas risk
        const gasRisk = clamp((gas_level / 900) * 25, 0, 25);
        if (gasRisk > 10) reasons.push('Elevated gas levels');
        riskScore += gasRisk;

        // Obstacle proximity risk
        const distRisk = clamp((1 - distance / 500) * 20, 0, 20);
        if (distRisk > 12) reasons.push('Close obstacle detected');
        riskScore += distRisk;

        // Vibration risk
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
            source: 'DEMO_SIMULATOR'
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
            };

            alerts.unshift(alert);
            if (alerts.length > 200) alerts.pop();
            return alert;
        }
        return null;
    }

    /**
     * Run a simulation tick — generate new readings for all active vehicles
     */
    function simulateTick() {
        tick++;
        vehicles.filter(v => v.status === 'active').forEach(v => {
            const reading = generateReading(v.vehicle_id, tick);
            sensorHistory[v.vehicle_id].unshift(reading);
            if (sensorHistory[v.vehicle_id].length > 100) {
                sensorHistory[v.vehicle_id].pop();
            }
            maybeGenerateAlert(reading);
        });
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

    // Auto-tick every 5 seconds
    setInterval(simulateTick, 5000);

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
        tick: () => tick,
        uptime: () => Math.round((Date.now() - startTime) / 1000),
    };
})();

// Evaluate sensor statuses for dashboard display
function evaluateSensorStatuses(reading) {
    if (!reading) return null;
    return {
        visibility:   { status: reading.light_level > 2000 ? 'NORMAL' : reading.light_level > 800 ? 'WARNING' : 'DANGER', value: reading.light_level, unit: 'ADC' },
        gas:          { status: reading.gas_level < 300 ? 'NORMAL' : reading.gas_level < 600 ? 'WARNING' : 'DANGER', value: reading.gas_level, unit: 'ADC' },
        temperature:  { status: reading.temperature < 40 ? 'NORMAL' : reading.temperature < 45 ? 'WARNING' : 'DANGER', value: reading.temperature, unit: '°C' },
        humidity:     { status: reading.humidity < 80 ? 'NORMAL' : reading.humidity < 90 ? 'WARNING' : 'DANGER', value: reading.humidity, unit: '%' },
        vibration:    { status: reading.vibration_intensity < 0.8 ? 'NORMAL' : reading.vibration_intensity < 1.5 ? 'WARNING' : 'DANGER', value: reading.vibration_intensity, unit: 'g' },
        distance:     { status: reading.distance > 200 ? 'NORMAL' : reading.distance > 80 ? 'WARNING' : 'DANGER', value: reading.distance, unit: 'cm' },
        acceleration: { status: reading.acceleration < 1.5 ? 'NORMAL' : reading.acceleration < 2.5 ? 'WARNING' : 'DANGER', value: reading.acceleration, unit: 'g' },
        tilt:         { status: Math.abs(reading.tilt) < 5 ? 'NORMAL' : Math.abs(reading.tilt) < 8 ? 'WARNING' : 'DANGER', value: reading.tilt, unit: '°' },
    };
}

// ============================================================
// API ROUTES
// ============================================================

// --- Health Check ---
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'DEEPFOG API',
        mode: 'DEMO_SIMULATION',
        database: 'in-memory (demo mode)',
        uptime: SimEngine.uptime(),
        simulationTick: SimEngine.tick(),
        timestamp: new Date().toISOString(),
        note: 'Prototype / demonstration — not connected to a real mine'
    });
});

// --- Root API Info ---
app.get('/api', (req, res) => {
    res.json({
        service: 'DEEPFOG API',
        version: '2.0.0',
        mode: 'DEMO_SIMULATION',
        description: 'Intelligent Mine Vehicle Safety & Low-Visibility Monitoring System',
        note: 'PROTOTYPE — simulated data for demonstration purposes only',
        endpoints: {
            health: 'GET /api/health',
            dashboard: 'GET /api/dashboard',
            vehicles: 'GET /api/vehicles',
            sensors_latest: 'GET /api/sensors/latest',
            sensor_history: 'GET /api/sensors/history',
            post_sensor: 'POST /api/sensors',
            alerts: 'GET /api/alerts',
            recent_alerts: 'GET /api/alerts/recent',
            alert_stats: 'GET /api/alerts/stats',
        }
    });
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
            isOnline: !!reading
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
                mode: 'DEMO_SIMULATION',
                activeVehicles,
                totalVehicles: vehicles.length,
                overallRisk: highestRisk,
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

// Accept incoming sensor data from ESP32 (or simulator)
app.post('/api/sensors', (req, res) => {
    console.log('  [SENSOR] Received POST /api/sensors:', JSON.stringify(req.body).substring(0, 200));
    res.json({
        success: true,
        message: 'Sensor data received (demo mode — data not persisted)',
        timestamp: new Date().toISOString()
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
// START
// ============================================================

app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                  DEEPFOG SERVER v2.0                     ║');
    console.log('║   Intelligent Mine Vehicle Safety & Low-Visibility       ║');
    console.log('║                Monitoring System                         ║');
    console.log('║                                                          ║');
    console.log('║   ⚙  MODE: DEMO SIMULATION (no PostgreSQL required)     ║');
    console.log('║   ⚠  PROTOTYPE — simulated data only                    ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  ✓ API server .......... http://localhost:${PORT}/api`);
    console.log(`  ✓ Dashboard ........... http://localhost:${PORT}`);
    console.log(`  ✓ Health check ........ http://localhost:${PORT}/api/health`);
    console.log(`  ✓ Simulation engine ... running (tick every 5s)`);
    console.log(`  ✓ Vehicles registered . ${SimEngine.getVehicles().length}`);
    console.log('');
    console.log('  Sensor data is simulated. Safe-speed recommendations');
    console.log('  are for demonstration/driver advisory only.');
    console.log('');
});
