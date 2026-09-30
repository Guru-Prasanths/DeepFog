/**
 * DEEPFOG — Alert Routes
 * 
 * Maps HTTP methods and paths to AlertController handlers.
 * 
 * Routes:
 *   GET    /api/alerts           → List alerts (with filters)
 *   GET    /api/alerts/recent    → Recent alerts for live panel
 *   GET    /api/alerts/stats     → Alert statistics
 *   GET    /api/alerts/:id       → Get single alert
 *   PUT    /api/alerts/:id/status → Update alert status
 */

const express = require('express');
const router = express.Router();
const AlertController = require('../controllers/alertController');

router.get('/', AlertController.getAll);
router.get('/recent', AlertController.getRecent);
router.get('/stats', AlertController.getStats);
router.get('/:id', AlertController.getById);
router.put('/:id/status', AlertController.updateStatus);

module.exports = router;
