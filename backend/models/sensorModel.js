/**
 * DEEPFOG — Sensor Model
 * 
 * Database operations for the sensor_readings table.
 * Includes the sensor-fusion risk calculation engine.
 * 
 * All queries use parameterized statements to prevent SQL injection.
 */

const { pool } = require('../config/database');

// ============================================================
// PROTOTYPE / DEMONSTRATION THRESHOLDS
// These are NOT industrial-certified safety thresholds.
// Real mine deployment requires calibrated, certified sensors.
// ============================================================
const THRESHOLDS = {
    // LDR light sensor: lower value = darker / less visibility
    visibility: {
        poor: 500,      // Below this = poor visibility
        moderate: 1500   // Below this = moderate visibility
    },
    // MQ-2 gas sensor analog reading
    gas: {
        warning: 400,   // Above this = gas warning
        danger: 700     // Above this = gas danger
    },
    // HC-SR04 ultrasonic distance (cm)
    distance: {
        danger: 100,    // Below 100cm = very close obstacle
        warning: 300    // Below 300cm = nearby obstacle
    },
    // MPU6050 acceleration (g-force magnitude)
    acceleration: {
        warning: 2.5,   // Above this = sudden acceleration
        danger: 4.0     // Above this = dangerous acceleration
    },
    // MPU6050 tilt (degrees from level)
    tilt: {
        warning: 15,    // Above 15° = vehicle tilting
        danger: 30      // Above 30° = dangerous tilt
    },
    // DHT11 temperature (°C)
    temperature: {
        high: 45,       // Above 45°C = high temperature warning
        low: 0          // Below 0°C = freezing warning
    },
    // DHT11 humidity (%)
    humidity: {
        high: 90,       // Above 90% = high humidity
        low: 20         // Below 20% = very dry
    }
};

/**
 * Calculate risk level and score from sensor data.
 * 
 * This is the core SENSOR FUSION engine of DEEPFOG.
 * It evaluates multiple sensor conditions together to determine
 * an overall risk level rather than relying on any single sensor.
 * 
 * @param {Object} data - Sensor readings
 * @returns {Object} { riskLevel, riskScore, reasons }
 */
function calculateRisk(data) {
    let score = 0;
    const reasons = [];

    // --- Visibility Assessment (LDR) ---
    if (data.light_level !== null && data.light_level !== undefined) {
        if (data.light_level < THRESHOLDS.visibility.poor) {
            score += 25;
            reasons.push('Poor visibility detected');
        } else if (data.light_level < THRESHOLDS.visibility.moderate) {
            score += 10;
            reasons.push('Reduced visibility');
        }
    }

    // --- Gas / Smoke Assessment (MQ-2) ---
    if (data.gas_level !== null && data.gas_level !== undefined) {
        if (data.gas_level > THRESHOLDS.gas.danger) {
            score += 30;
            reasons.push('Dangerous gas/smoke level');
        } else if (data.gas_level > THRESHOLDS.gas.warning) {
            score += 15;
            reasons.push('Elevated gas/smoke level');
        }
    }

    // --- Obstacle Distance Assessment (HC-SR04) ---
    if (data.distance !== null && data.distance !== undefined) {
        if (data.distance < THRESHOLDS.distance.danger) {
            score += 25;
            reasons.push('Very close obstacle detected');
        } else if (data.distance < THRESHOLDS.distance.warning) {
            score += 10;
            reasons.push('Nearby obstacle');
        }
    }

    // --- Acceleration Assessment (MPU6050) ---
    if (data.acceleration !== null && data.acceleration !== undefined) {
        if (data.acceleration > THRESHOLDS.acceleration.danger) {
            score += 20;
            reasons.push('Dangerous acceleration/deceleration');
        } else if (data.acceleration > THRESHOLDS.acceleration.warning) {
            score += 10;
            reasons.push('Sudden acceleration detected');
        }
    }

    // --- Tilt Assessment (MPU6050) ---
    if (data.tilt !== null && data.tilt !== undefined) {
        const absTilt = Math.abs(data.tilt);
        if (absTilt > THRESHOLDS.tilt.danger) {
            score += 25;
            reasons.push('Dangerous vehicle tilt');
        } else if (absTilt > THRESHOLDS.tilt.warning) {
            score += 10;
            reasons.push('Vehicle tilting detected');
        }
    }

    // --- Vibration Assessment (SW-420) ---
    if (data.vibration === true) {
        score += 15;
        reasons.push('Strong vibration / ground shock');
    }

    // --- Temperature Assessment (DHT11) ---
    if (data.temperature !== null && data.temperature !== undefined) {
        if (data.temperature > THRESHOLDS.temperature.high) {
            score += 10;
            reasons.push('High temperature warning');
        } else if (data.temperature < THRESHOLDS.temperature.low) {
            score += 10;
            reasons.push('Freezing temperature warning');
        }
    }

    // --- Humidity Assessment (DHT11) ---
    if (data.humidity !== null && data.humidity !== undefined) {
        if (data.humidity > THRESHOLDS.humidity.high) {
            score += 5;
            reasons.push('High humidity — reduced visibility likely');
        }
    }

    // Cap score at 100
    score = Math.min(score, 100);

    // Determine risk level from score
    let riskLevel;
    if (score >= 60) {
        riskLevel = 'HIGH';
    } else if (score >= 30) {
        riskLevel = 'MEDIUM';
    } else {
        riskLevel = 'LOW';
    }

    return { riskLevel, riskScore: score, reasons };
}

/**
 * Evaluate individual sensor statuses for the risk analysis panel.
 * @param {Object} data - Sensor readings
 * @returns {Object} Individual sensor status assessments
 */
function evaluateSensorStatuses(data) {
    const statuses = {};

    // Visibility
    if (data.light_level !== null && data.light_level !== undefined) {
        if (data.light_level < THRESHOLDS.visibility.poor) statuses.visibility = 'POOR';
        else if (data.light_level < THRESHOLDS.visibility.moderate) statuses.visibility = 'MODERATE';
        else statuses.visibility = 'GOOD';
    } else {
        statuses.visibility = 'N/A';
    }

    // Gas
    if (data.gas_level !== null && data.gas_level !== undefined) {
        if (data.gas_level > THRESHOLDS.gas.danger) statuses.gas = 'DANGER';
        else if (data.gas_level > THRESHOLDS.gas.warning) statuses.gas = 'WARNING';
        else statuses.gas = 'NORMAL';
    } else {
        statuses.gas = 'N/A';
    }

    // Distance
    if (data.distance !== null && data.distance !== undefined) {
        if (data.distance < THRESHOLDS.distance.danger) statuses.obstacle = 'VERY NEAR';
        else if (data.distance < THRESHOLDS.distance.warning) statuses.obstacle = 'NEAR';
        else statuses.obstacle = 'CLEAR';
    } else {
        statuses.obstacle = 'N/A';
    }

    // Acceleration
    if (data.acceleration !== null && data.acceleration !== undefined) {
        if (data.acceleration > THRESHOLDS.acceleration.danger) statuses.acceleration = 'DANGER';
        else if (data.acceleration > THRESHOLDS.acceleration.warning) statuses.acceleration = 'WARNING';
        else statuses.acceleration = 'NORMAL';
    } else {
        statuses.acceleration = 'N/A';
    }

    // Tilt
    if (data.tilt !== null && data.tilt !== undefined) {
        const absTilt = Math.abs(data.tilt);
        if (absTilt > THRESHOLDS.tilt.danger) statuses.tilt = 'DANGER';
        else if (absTilt > THRESHOLDS.tilt.warning) statuses.tilt = 'WARNING';
        else statuses.tilt = 'NORMAL';
    } else {
        statuses.tilt = 'N/A';
    }

    // Vibration
    if (data.vibration !== undefined) {
        statuses.vibration = data.vibration ? 'HIGH' : 'NORMAL';
    } else {
        statuses.vibration = 'N/A';
    }

    // Temperature
    if (data.temperature !== null && data.temperature !== undefined) {
        if (data.temperature > THRESHOLDS.temperature.high) statuses.temperature = 'HIGH';
        else if (data.temperature < THRESHOLDS.temperature.low) statuses.temperature = 'LOW';
        else statuses.temperature = 'NORMAL';
    } else {
        statuses.temperature = 'N/A';
    }

    // Humidity
    if (data.humidity !== null && data.humidity !== undefined) {
        if (data.humidity > THRESHOLDS.humidity.high) statuses.humidity = 'HIGH';
        else statuses.humidity = 'NORMAL';
    } else {
        statuses.humidity = 'N/A';
    }

    return statuses;
}

const SensorModel = {
    /**
     * Insert a new sensor reading into the database.
     * @param {Object} data - Processed sensor data with risk calculation
     * @returns {Promise<Object>} Inserted sensor reading
     */
    async create(data) {
        const query = `
            INSERT INTO sensor_readings 
                (vehicle_id, latitude, longitude, temperature, humidity,
                 gas_level, light_level, distance, acceleration, tilt,
                 vibration, risk_level, risk_score, risk_reasons)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `;
        const values = [
            data.vehicle_id,
            data.latitude || null,
            data.longitude || null,
            data.temperature !== undefined ? data.temperature : null,
            data.humidity !== undefined ? data.humidity : null,
            data.gas_level !== undefined ? data.gas_level : null,
            data.light_level !== undefined ? data.light_level : null,
            data.distance !== undefined ? data.distance : null,
            data.acceleration !== undefined ? data.acceleration : null,
            data.tilt !== undefined ? data.tilt : null,
            data.vibration || false,
            data.risk_level,
            data.risk_score,
            data.risk_reasons || []
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    /**
     * Get the latest sensor reading for a specific vehicle.
     * @param {string} vehicleId
     * @returns {Promise<Object|null>}
     */
    async getLatestByVehicle(vehicleId) {
        const query = `
            SELECT * FROM sensor_readings
            WHERE vehicle_id = $1
            ORDER BY recorded_at DESC
            LIMIT 1
        `;
        const result = await pool.query(query, [vehicleId]);
        return result.rows[0] || null;
    },

    /**
     * Get the latest sensor reading across all vehicles.
     * @returns {Promise<Array>}
     */
    async getLatest() {
        const query = `
            SELECT DISTINCT ON (vehicle_id) *
            FROM sensor_readings
            ORDER BY vehicle_id, recorded_at DESC
        `;
        const result = await pool.query(query);
        return result.rows;
    },

    /**
     * Get sensor history for a vehicle with optional limit.
     * @param {string} vehicleId
     * @param {number} limit - Number of records to return (default 100)
     * @returns {Promise<Array>}
     */
    async getHistory(vehicleId, limit = 100) {
        const query = `
            SELECT * FROM sensor_readings
            WHERE vehicle_id = $1
            ORDER BY recorded_at DESC
            LIMIT $2
        `;
        const result = await pool.query(query, [vehicleId, limit]);
        return result.rows;
    },

    /**
     * Get sensor history across all vehicles with optional filters.
     * @param {Object} filters - { limit, vehicleId, startDate, endDate }
     * @returns {Promise<Array>}
     */
    async getHistoryAll(filters = {}) {
        let query = 'SELECT * FROM sensor_readings WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        if (filters.vehicleId) {
            query += ` AND vehicle_id = $${paramIndex++}`;
            values.push(filters.vehicleId);
        }

        if (filters.startDate) {
            query += ` AND recorded_at >= $${paramIndex++}`;
            values.push(filters.startDate);
        }

        if (filters.endDate) {
            query += ` AND recorded_at <= $${paramIndex++}`;
            values.push(filters.endDate);
        }

        query += ' ORDER BY recorded_at DESC';

        const limit = Math.min(filters.limit || 200, 1000);
        query += ` LIMIT $${paramIndex++}`;
        values.push(limit);

        const result = await pool.query(query, values);
        return result.rows;
    }
};

module.exports = { SensorModel, calculateRisk, evaluateSensorStatuses, THRESHOLDS };
