/**
 * DEEPFOG — Vehicle Routes
 * 
 * Maps HTTP methods and paths to VehicleController handlers.
 * 
 * Routes:
 *   GET    /api/vehicles      → List all vehicles
 *   GET    /api/vehicles/:id  → Get vehicle by vehicle_id
 *   POST   /api/vehicles      → Create a new vehicle
 *   PUT    /api/vehicles/:id  → Update a vehicle
 */

const express = require('express');
const router = express.Router();
const VehicleController = require('../controllers/vehicleController');
const { validateVehicleData } = require('../middleware/validation');

router.get('/', VehicleController.getAll);
router.get('/:id', VehicleController.getById);
router.post('/', validateVehicleData, VehicleController.create);
router.put('/:id', VehicleController.update);

module.exports = router;
