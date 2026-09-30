/**
 * DEEPFOG — Alert Model
 * 
 * Database operations for the alerts table.
 * Alerts are generated when risk conditions are detected.
 */

const { pool } = require('../config/database');

const AlertModel = {
    /**
     * Create a new alert record.
     * @param {Object} data - { vehicle_id, alert_type, severity, message, risk_score }
     * @returns {Promise<Object>} Created alert
     */
    async create(data) {
        const query = `
            INSERT INTO alerts (vehicle_id, alert_type, severity, message, risk_score, status)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const values = [
            data.vehicle_id,
            data.alert_type,
            data.severity,
            data.message,
            data.risk_score || 0,
            'ACTIVE'
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    /**
     * Get all alerts with optional filters.
     * @param {Object} filters - { vehicleId, severity, status, limit, startDate, endDate }
     * @returns {Promise<Array>}
     */
    async getAll(filters = {}) {
        let query = 'SELECT * FROM alerts WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        if (filters.vehicleId) {
            query += ` AND vehicle_id = $${paramIndex++}`;
            values.push(filters.vehicleId);
        }

        if (filters.severity) {
            query += ` AND severity = $${paramIndex++}`;
            values.push(filters.severity);
        }

        if (filters.status) {
            query += ` AND status = $${paramIndex++}`;
            values.push(filters.status);
        }

        if (filters.alertType) {
            query += ` AND alert_type = $${paramIndex++}`;
            values.push(filters.alertType);
        }

        if (filters.startDate) {
            query += ` AND created_at >= $${paramIndex++}`;
            values.push(filters.startDate);
        }

        if (filters.endDate) {
            query += ` AND created_at <= $${paramIndex++}`;
            values.push(filters.endDate);
        }

        query += ' ORDER BY created_at DESC';

        const limit = Math.min(filters.limit || 100, 500);
        query += ` LIMIT $${paramIndex++}`;
        values.push(limit);

        const result = await pool.query(query, values);
        return result.rows;
    },

    /**
     * Get a single alert by ID.
     * @param {number} id
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        const query = 'SELECT * FROM alerts WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    },

    /**
     * Update alert status (e.g. ACKNOWLEDGED, RESOLVED).
     * @param {number} id
     * @param {string} status
     * @returns {Promise<Object|null>}
     */
    async updateStatus(id, status) {
        const resolvedAt = status === 'RESOLVED' ? 'CURRENT_TIMESTAMP' : 'resolved_at';
        const query = `
            UPDATE alerts 
            SET status = $2, 
                resolved_at = ${status === 'RESOLVED' ? 'CURRENT_TIMESTAMP' : 'resolved_at'}
            WHERE id = $1
            RETURNING *
        `;
        const result = await pool.query(query, [id, status]);
        return result.rows[0] || null;
    },

    /**
     * Get active (unresolved) alerts for a vehicle.
     * @param {string} vehicleId
     * @returns {Promise<Array>}
     */
    async getActiveByVehicle(vehicleId) {
        const query = `
            SELECT * FROM alerts
            WHERE vehicle_id = $1 AND status = 'ACTIVE'
            ORDER BY created_at DESC
        `;
        const result = await pool.query(query, [vehicleId]);
        return result.rows;
    },

    /**
     * Get recent alerts across all vehicles.
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    async getRecent(limit = 20) {
        const query = `
            SELECT * FROM alerts
            ORDER BY created_at DESC
            LIMIT $1
        `;
        const result = await pool.query(query, [limit]);
        return result.rows;
    },

    /**
     * Get alert statistics (counts by severity and status).
     * @returns {Promise<Object>}
     */
    async getStats() {
        const severityQuery = `
            SELECT severity, COUNT(*) as count
            FROM alerts
            GROUP BY severity
        `;
        const statusQuery = `
            SELECT status, COUNT(*) as count
            FROM alerts
            GROUP BY status
        `;
        const totalQuery = 'SELECT COUNT(*) as total FROM alerts';

        const [severityResult, statusResult, totalResult] = await Promise.all([
            pool.query(severityQuery),
            pool.query(statusQuery),
            pool.query(totalQuery)
        ]);

        return {
            total: parseInt(totalResult.rows[0].total),
            bySeverity: severityResult.rows,
            byStatus: statusResult.rows
        };
    }
};

module.exports = AlertModel;
