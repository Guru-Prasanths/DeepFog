/**
 * DEEPFOG — Dashboard Controller
 * 
 * Provides aggregated data for the frontend dashboard.
 * Combines vehicle info, latest sensors, risk status, and recent alerts
 * into a single API response for efficient dashboard rendering.
 */

const VehicleModel = require('../models/vehicleModel');
const { SensorModel, evaluateSensorStatuses } = require('../models/sensorModel');
const AlertModel = require('../models/alertModel');
const { pool } = require('../config/database');

const DashboardController = {
    /**
     * GET /api/dashboard
     * Returns the complete dashboard data in one response.
     * This is the primary endpoint the frontend polls for updates.
     */
    async getDashboard(req, res, next) {
        try {
            // Fetch all data in parallel for efficiency
            const [vehicles, latestReadings, recentAlerts, alertStats] = await Promise.all([
                VehicleModel.getAll(),
                SensorModel.getLatest(),
                AlertModel.getRecent(10),
                AlertModel.getStats()
            ]);

            // Build per-vehicle dashboard data
            const vehicleDashboards = vehicles.map(vehicle => {
                const reading = latestReadings.find(r => r.vehicle_id === vehicle.vehicle_id);
                const vehicleAlerts = recentAlerts.filter(a => a.vehicle_id === vehicle.vehicle_id);

                return {
                    vehicle: vehicle,
                    latestReading: reading || null,
                    sensorStatuses: reading ? evaluateSensorStatuses(reading) : null,
                    riskLevel: reading ? reading.risk_level : 'N/A',
                    riskScore: reading ? reading.risk_score : 0,
                    riskReasons: reading ? reading.risk_reasons : [],
                    activeAlerts: vehicleAlerts.length,
                    lastUpdate: reading ? reading.recorded_at : null,
                    isOnline: reading
                        ? (Date.now() - new Date(reading.recorded_at).getTime()) < 60000  // Online if data within 60s
                        : false
                };
            });

            // Overall system status
            const activeVehicles = vehicleDashboards.filter(v => v.isOnline).length;
            const highestRisk = vehicleDashboards.reduce((highest, v) => {
                const priority = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'N/A': 0 };
                return (priority[v.riskLevel] || 0) > (priority[highest] || 0) ? v.riskLevel : highest;
            }, 'N/A');

            res.json({
                success: true,
                data: {
                    system: {
                        status: activeVehicles > 0 ? 'ONLINE' : 'OFFLINE',
                        activeVehicles: activeVehicles,
                        totalVehicles: vehicles.length,
                        overallRisk: highestRisk,
                        timestamp: new Date().toISOString()
                    },
                    vehicles: vehicleDashboards,
                    recentAlerts: recentAlerts,
                    alertStats: alertStats
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/dashboard/vehicle/:vehicleId
     * Returns detailed dashboard data for a specific vehicle.
     */
    async getVehicleDashboard(req, res, next) {
        try {
            const vehicleId = req.params.vehicleId;

            const [vehicle, latestReading, recentHistory, activeAlerts] = await Promise.all([
                VehicleModel.getById(vehicleId),
                SensorModel.getLatestByVehicle(vehicleId),
                SensorModel.getHistory(vehicleId, 50),
                AlertModel.getActiveByVehicle(vehicleId)
            ]);

            if (!vehicle) {
                return res.status(404).json({
                    success: false,
                    error: { message: `Vehicle not found: ${vehicleId}` }
                });
            }

            const isOnline = latestReading
                ? (Date.now() - new Date(latestReading.recorded_at).getTime()) < 60000
                : false;

            res.json({
                success: true,
                data: {
                    vehicle: vehicle,
                    latestReading: latestReading,
                    sensorStatuses: latestReading ? evaluateSensorStatuses(latestReading) : null,
                    riskLevel: latestReading ? latestReading.risk_level : 'N/A',
                    riskScore: latestReading ? latestReading.risk_score : 0,
                    riskReasons: latestReading ? latestReading.risk_reasons : [],
                    isOnline: isOnline,
                    recentHistory: recentHistory,
                    activeAlerts: activeAlerts
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/health
     * Health check endpoint.
     */
    async healthCheck(req, res, next) {
        try {
            // Test database connectivity
            const dbResult = await pool.query('SELECT 1');
            const dbConnected = dbResult.rows.length > 0;

            res.json({
                status: 'ok',
                service: 'DEEPFOG API',
                database: dbConnected ? 'connected' : 'disconnected',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        } catch (error) {
            res.status(503).json({
                status: 'error',
                service: 'DEEPFOG API',
                database: 'disconnected',
                message: 'Database connection failed',
                timestamp: new Date().toISOString()
            });
        }
    }
};

module.exports = DashboardController;
