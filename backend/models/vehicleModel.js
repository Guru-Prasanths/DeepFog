/**
 * DEEPFOG — Vehicle Model
 * 
 * Database operations for the vehicles table.
 * All queries use parameterized statements to prevent SQL injection.
 */

const { pool } = require('../config/database');

const VehicleModel = {
    /**
     * Get all registered vehicles.
     * @returns {Promise<Array>} List of vehicle records
     */
    async getAll() {
        const query = `
            SELECT id, vehicle_id, vehicle_name, vehicle_type, status, created_at, updated_at
            FROM vehicles
            ORDER BY created_at DESC
        `;
        const result = await pool.query(query);
        return result.rows;
    },

    /**
     * Get a single vehicle by its vehicle_id (e.g. "DEEPFOG-01").
     * @param {string} vehicleId
     * @returns {Promise<Object|null>} Vehicle record or null
     */
    async getById(vehicleId) {
        const query = `
            SELECT id, vehicle_id, vehicle_name, vehicle_type, status, created_at, updated_at
            FROM vehicles
            WHERE vehicle_id = $1
        `;
        const result = await pool.query(query, [vehicleId]);
        return result.rows[0] || null;
    },

    /**
     * Create a new vehicle.
     * @param {Object} data - { vehicle_id, vehicle_name, vehicle_type, status }
     * @returns {Promise<Object>} Created vehicle record
     */
    async create(data) {
        const query = `
            INSERT INTO vehicles (vehicle_id, vehicle_name, vehicle_type, status)
            VALUES ($1, $2, $3, $4)
            RETURNING id, vehicle_id, vehicle_name, vehicle_type, status, created_at, updated_at
        `;
        const values = [
            data.vehicle_id,
            data.vehicle_name,
            data.vehicle_type || 'HEMM',
            data.status || 'INACTIVE'
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    /**
     * Update an existing vehicle.
     * @param {string} vehicleId
     * @param {Object} data - Fields to update
     * @returns {Promise<Object|null>} Updated vehicle record or null
     */
    async update(vehicleId, data) {
        const query = `
            UPDATE vehicles
            SET vehicle_name = COALESCE($2, vehicle_name),
                vehicle_type = COALESCE($3, vehicle_type),
                status = COALESCE($4, status)
            WHERE vehicle_id = $1
            RETURNING id, vehicle_id, vehicle_name, vehicle_type, status, created_at, updated_at
        `;
        const values = [
            vehicleId,
            data.vehicle_name || null,
            data.vehicle_type || null,
            data.status || null
        ];
        const result = await pool.query(query, values);
        return result.rows[0] || null;
    },

    /**
     * Update vehicle status (e.g. ACTIVE when ESP32 sends data).
     * @param {string} vehicleId
     * @param {string} status
     * @returns {Promise<Object|null>}
     */
    async updateStatus(vehicleId, status) {
        const query = `
            UPDATE vehicles SET status = $2 WHERE vehicle_id = $1
            RETURNING vehicle_id, status, updated_at
        `;
        const result = await pool.query(query, [vehicleId, status]);
        return result.rows[0] || null;
    }
};

module.exports = VehicleModel;
