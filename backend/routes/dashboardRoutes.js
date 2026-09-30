/**
 * DEEPFOG — Dashboard Routes
 * 
 * Maps HTTP methods and paths to DashboardController handlers.
 * 
 * Routes:
 *   GET    /api/health                      → System health check
 *   GET    /api/dashboard                   → Full dashboard data
 *   GET    /api/dashboard/vehicle/:vehicleId → Specific vehicle dashboard
 */

const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/dashboardController');

router.get('/', DashboardController.getDashboard);
router.get('/vehicle/:vehicleId', DashboardController.getVehicleDashboard);

module.exports = router;
