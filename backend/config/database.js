/**
 * DEEPFOG — Database Configuration
 * 
 * Creates and exports a PostgreSQL connection pool using the
 * DATABASE_URL from environment variables.
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Connection pool settings for development
    max: 10,                   // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,  // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000 // Return an error after 5 seconds if connection cannot be established
});

// Log connection events for debugging
pool.on('connect', () => {
    console.log('[DB] New client connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected error on idle client:', err.message);
});

/**
 * Test the database connection.
 * @returns {Promise<boolean>} true if connection is successful
 */
async function testConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() AS current_time');
        client.release();
        console.log('[DB] Connection test successful:', result.rows[0].current_time);
        return true;
    } catch (error) {
        console.error('[DB] Connection test failed:', error.message);
        return false;
    }
}

module.exports = { pool, testConnection };
