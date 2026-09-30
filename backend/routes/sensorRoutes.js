/**
 * DEEPFOG — Sensor Routes
 * 
 * Maps HTTP methods and paths to SensorController handlers.
 * 
 * Routes:
 *   POST   /api/sensors           → Receive sensor data from ESP32
 *   GET    /api/sensors/latest    → Get latest readings for all vehicles
 *   GET    /api/sensors/history   → Get sensor history (with filters)
 *   GET    /api/sensors/:vehicleId → Get latest reading for a specific vehicle
 */

const express = require('express');
const router = express.Router();
const SensorController = require('../controllers/sensorController');
const { validateApiKey, validateSensorData } = require('../middleware/validation');

// ESP32 posts sensor data here (requires API key if configured)
router.post('/', validateApiKey, validateSensorData, SensorController.receiveSensorData);

// Dashboard reads sensor data from these endpoints
router.get('/latest', SensorController.getLatest);
router.get('/history', SensorController.getHistory);
router.get('/:vehicleId', SensorController.getByVehicle);

module.exports = router;
