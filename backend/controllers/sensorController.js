/**
 * DEEPFOG — Sensor Controller
 * 
 * Handles HTTP request logic for sensor data endpoints.
 * 
 * Key responsibilities:
 * - Receiving sensor payloads from ESP32
 * - Running the sensor-fusion risk calculation
 * - Storing readings in PostgreSQL
 * - Generating alerts for HIGH/MEDIUM risk conditions
 * - Returning sensor data to the frontend dashboard
 */

const { SensorModel, calculateRisk, evaluateSensorStatuses } = require('../models/sensorModel');
const AlertModel = require('../models/alertModel');
const VehicleModel = require('../models/vehicleModel');
const { AppError } = require('../middleware/errorHandler');

const SensorController = {
    /**
     * POST /api/sensors
     * Receives a sensor data payload from an ESP32 device.
     * 
     * Expected JSON body:
     * {
     *   "vehicleId": "DEEPFOG-01",
     *   "gps": { "latitude": 11.123, "longitude": 78.123 },
     *   "temperature": 31.4,
     *   "humidity": 68,
     *   "gas": 214,
     *   "light": 180,
     *   "distance": 4.2,
     *   "acceleration": 1.8,
     *   "tilt": 3.4,
     *   "vibration": true
     * }
     */
    async receiveSensorData(req, res, next) {
        try {
            const body = req.body;

            // Verify vehicle exists
            const vehicle = await VehicleModel.getById(body.vehicleId);
            if (!vehicle) {
                return next(new AppError(`Vehicle not registered: ${body.vehicleId}. Register the vehicle first.`, 404));
            }

            // Map incoming ESP32 payload to internal data structure
            const sensorData = {
                vehicle_id: body.vehicleId,
                latitude: body.gps?.latitude || null,
                longitude: body.gps?.longitude || null,
                temperature: body.temperature !== undefined ? body.temperature : null,
                humidity: body.humidity !== undefined ? body.humidity : null,
                gas_level: body.gas !== undefined ? body.gas : null,
                light_level: body.light !== undefined ? body.light : null,
                distance: body.distance !== undefined ? body.distance : null,
                acceleration: body.acceleration !== undefined ? body.acceleration : null,
                tilt: body.tilt !== undefined ? body.tilt : null,
                vibration: body.vibration || false
            };

            // Run sensor-fusion risk calculation
            const risk = calculateRisk(sensorData);
            sensorData.risk_level = risk.riskLevel;
            sensorData.risk_score = risk.riskScore;
            sensorData.risk_reasons = risk.reasons;

            // Store the reading in PostgreSQL
            const reading = await SensorModel.create(sensorData);

            // Update vehicle status to ACTIVE (it just sent data)
            await VehicleModel.updateStatus(body.vehicleId, 'ACTIVE');

            // Generate alerts for MEDIUM or HIGH risk conditions
            if (risk.riskLevel === 'HIGH' || risk.riskLevel === 'MEDIUM') {
                const alertMessage = `${risk.riskLevel} RISK — ${risk.reasons.join(', ')}`;
                const mainAlertType = risk.reasons.length > 0
                    ? risk.reasons[0].toUpperCase().replace(/\s+/g, '_')
                    : 'MULTI_SENSOR';

                await AlertModel.create({
                    vehicle_id: body.vehicleId,
                    alert_type: mainAlertType,
                    severity: risk.riskLevel,
                    message: alertMessage,
                    risk_score: risk.riskScore
                });
            }

            // Return the processed reading with risk analysis
            res.status(201).json({
                success: true,
                message: 'Sensor data received and processed',
                data: {
                    reading: reading,
                    risk: {
                        level: risk.riskLevel,
                        score: risk.riskScore,
                        reasons: risk.reasons
                    }
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/sensors/latest
     * Returns the most recent sensor reading for each vehicle.
     */
    async getLatest(req, res, next) {
        try {
            const readings = await SensorModel.getLatest();

            // Enrich each reading with sensor status evaluations
            const enriched = readings.map(reading => ({
                ...reading,
                sensorStatuses: evaluateSensorStatuses(reading)
            }));

            res.json({
                success: true,
                count: enriched.length,
                data: enriched
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/sensors/history
     * Returns sensor history with optional filters.
     * Query params: vehicleId, limit, startDate, endDate
     */
    async getHistory(req, res, next) {
        try {
            const filters = {
                vehicleId: req.query.vehicleId,
                limit: parseInt(req.query.limit) || 200,
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };
            const readings = await SensorModel.getHistoryAll(filters);
            res.json({
                success: true,
                count: readings.length,
                data: readings
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/sensors/:vehicleId
     * Returns the latest sensor reading for a specific vehicle.
     */
    async getByVehicle(req, res, next) {
        try {
            const reading = await SensorModel.getLatestByVehicle(req.params.vehicleId);
            if (!reading) {
                return res.json({
                    success: true,
                    data: null,
                    message: `No sensor data available for vehicle: ${req.params.vehicleId}`
                });
            }

            // Enrich with sensor status evaluations
            const enriched = {
                ...reading,
                sensorStatuses: evaluateSensorStatuses(reading)
            };

            res.json({
                success: true,
                data: enriched
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = SensorController;
