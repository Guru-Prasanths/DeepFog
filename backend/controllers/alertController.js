/**
 * DEEPFOG — Alert Controller
 * 
 * Handles HTTP request logic for alert management endpoints.
 */

const AlertModel = require('../models/alertModel');
const { AppError } = require('../middleware/errorHandler');

const AlertController = {
    /**
     * GET /api/alerts
     * Returns alerts with optional filtering.
     * Query params: vehicleId, severity, status, alertType, limit, startDate, endDate
     */
    async getAll(req, res, next) {
        try {
            const filters = {
                vehicleId: req.query.vehicleId,
                severity: req.query.severity,
                status: req.query.status,
                alertType: req.query.alertType,
                limit: parseInt(req.query.limit) || 100,
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };
            const alerts = await AlertModel.getAll(filters);
            res.json({
                success: true,
                count: alerts.length,
                data: alerts
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/alerts/recent
     * Returns the most recent alerts (for the live alerts panel).
     */
    async getRecent(req, res, next) {
        try {
            const limit = parseInt(req.query.limit) || 20;
            const alerts = await AlertModel.getRecent(limit);
            res.json({
                success: true,
                count: alerts.length,
                data: alerts
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/alerts/stats
     * Returns alert statistics (counts by severity and status).
     */
    async getStats(req, res, next) {
        try {
            const stats = await AlertModel.getStats();
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/alerts/:id
     * Returns a single alert by its ID.
     */
    async getById(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return next(new AppError('Invalid alert ID. Must be a number.', 400));
            }

            const alert = await AlertModel.getById(id);
            if (!alert) {
                return next(new AppError(`Alert not found: ${id}`, 404));
            }

            res.json({
                success: true,
                data: alert
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * PUT /api/alerts/:id/status
     * Updates an alert's status (ACTIVE → ACKNOWLEDGED → RESOLVED).
     */
    async updateStatus(req, res, next) {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return next(new AppError('Invalid alert ID. Must be a number.', 400));
            }

            const { status } = req.body;
            const validStatuses = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'];
            if (!status || !validStatuses.includes(status)) {
                return next(new AppError(
                    `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400
                ));
            }

            const alert = await AlertModel.updateStatus(id, status);
            if (!alert) {
                return next(new AppError(`Alert not found: ${id}`, 404));
            }

            res.json({
                success: true,
                message: `Alert status updated to ${status}`,
                data: alert
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = AlertController;
