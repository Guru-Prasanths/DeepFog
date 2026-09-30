/**
 * DEEPFOG — Vehicle Controller
 * 
 * Handles HTTP request logic for vehicle management endpoints.
 * Delegates database operations to the VehicleModel.
 */

const VehicleModel = require('../models/vehicleModel');
const { AppError } = require('../middleware/errorHandler');

const VehicleController = {
    /**
     * GET /api/vehicles
     * Returns all registered vehicles.
     */
    async getAll(req, res, next) {
        try {
            const vehicles = await VehicleModel.getAll();
            res.json({
                success: true,
                count: vehicles.length,
                data: vehicles
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/vehicles/:id
     * Returns a single vehicle by vehicle_id.
     */
    async getById(req, res, next) {
        try {
            const vehicle = await VehicleModel.getById(req.params.id);
            if (!vehicle) {
                return next(new AppError(`Vehicle not found: ${req.params.id}`, 404));
            }
            res.json({
                success: true,
                data: vehicle
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/vehicles
     * Creates a new vehicle record.
     */
    async create(req, res, next) {
        try {
            // Check if vehicle already exists
            const existing = await VehicleModel.getById(req.body.vehicle_id);
            if (existing) {
                return next(new AppError(`Vehicle already exists: ${req.body.vehicle_id}`, 409));
            }

            const vehicle = await VehicleModel.create(req.body);
            res.status(201).json({
                success: true,
                message: 'Vehicle created successfully',
                data: vehicle
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * PUT /api/vehicles/:id
     * Updates an existing vehicle.
     */
    async update(req, res, next) {
        try {
            const vehicle = await VehicleModel.update(req.params.id, req.body);
            if (!vehicle) {
                return next(new AppError(`Vehicle not found: ${req.params.id}`, 404));
            }
            res.json({
                success: true,
                message: 'Vehicle updated successfully',
                data: vehicle
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = VehicleController;
