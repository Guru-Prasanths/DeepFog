/**
 * DEEPFOG — API Communication Module
 * 
 * Handles all HTTP requests to the DEEPFOG backend REST API.
 * This module is used by dashboard.js and app.js to fetch and send data.
 * 
 * Communication Flow:
 *   frontend/js/api.js  →  backend/routes/*  →  backend/controllers/*  →  PostgreSQL
 */

// Base URL for the DEEPFOG backend API
// Change this if the backend runs on a different host/port
const API_BASE_URL = 'http://localhost:4000/api';

/**
 * Generic fetch wrapper with error handling.
 * All API calls go through this function.
 * 
 * @param {string} endpoint - API endpoint path (e.g. '/health')
 * @param {Object} options - Fetch options (method, body, headers)
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} If the request fails or response is not OK
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const defaultHeaders = {
        'Content-Type': 'application/json'
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    };

    try {
        const response = await fetch(url, config);

        // Parse the response body
        const data = await response.json();

        if (!response.ok) {
            const errorMsg = data?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMsg);
        }

        return data;
    } catch (error) {
        // Network errors (backend unavailable, etc.)
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Backend unavailable. Is the DEEPFOG server running on port 4000?');
        }
        throw error;
    }
}

// ============================================================
// HEALTH CHECK
// ============================================================

/**
 * Check if the backend API is running and the database is connected.
 * @returns {Promise<Object>} { status, service, database, timestamp, uptime }
 */
async function apiHealthCheck() {
    return apiRequest('/health');
}

// ============================================================
// DASHBOARD
// ============================================================

/**
 * Get the full dashboard data (vehicles, latest readings, alerts).
 * This is the primary endpoint polled by the dashboard.
 * @returns {Promise<Object>} Complete dashboard data
 */
async function apiGetDashboard() {
    return apiRequest('/dashboard');
}

/**
 * Get detailed dashboard data for a specific vehicle.
 * @param {string} vehicleId
 * @returns {Promise<Object>} Vehicle-specific dashboard data
 */
async function apiGetVehicleDashboard(vehicleId) {
    return apiRequest(`/dashboard/vehicle/${encodeURIComponent(vehicleId)}`);
}

// ============================================================
// VEHICLES
// ============================================================

/**
 * Get all registered vehicles.
 * @returns {Promise<Object>} { success, count, data: [...vehicles] }
 */
async function apiGetVehicles() {
    return apiRequest('/vehicles');
}

/**
 * Get a single vehicle by ID.
 * @param {string} vehicleId
 * @returns {Promise<Object>} { success, data: vehicle }
 */
async function apiGetVehicle(vehicleId) {
    return apiRequest(`/vehicles/${encodeURIComponent(vehicleId)}`);
}

// ============================================================
// SENSOR DATA
// ============================================================

/**
 * Get the latest sensor readings for all vehicles.
 * @returns {Promise<Object>} { success, count, data: [...readings] }
 */
async function apiGetLatestSensors() {
    return apiRequest('/sensors/latest');
}

/**
 * Get sensor history with optional filters.
 * @param {Object} params - { vehicleId, limit, startDate, endDate }
 * @returns {Promise<Object>} { success, count, data: [...readings] }
 */
async function apiGetSensorHistory(params = {}) {
    const query = new URLSearchParams();
    if (params.vehicleId) query.set('vehicleId', params.vehicleId);
    if (params.limit) query.set('limit', params.limit);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);

    const queryStr = query.toString();
    return apiRequest(`/sensors/history${queryStr ? '?' + queryStr : ''}`);
}

/**
 * Get the latest sensor reading for a specific vehicle.
 * @param {string} vehicleId
 * @returns {Promise<Object>} { success, data: reading }
 */
async function apiGetVehicleSensors(vehicleId) {
    return apiRequest(`/sensors/${encodeURIComponent(vehicleId)}`);
}

// ============================================================
// ALERTS
// ============================================================

/**
 * Get alerts with optional filters.
 * @param {Object} params - { vehicleId, severity, status, alertType, limit }
 * @returns {Promise<Object>} { success, count, data: [...alerts] }
 */
async function apiGetAlerts(params = {}) {
    const query = new URLSearchParams();
    if (params.vehicleId) query.set('vehicleId', params.vehicleId);
    if (params.severity) query.set('severity', params.severity);
    if (params.status) query.set('status', params.status);
    if (params.alertType) query.set('alertType', params.alertType);
    if (params.limit) query.set('limit', params.limit);

    const queryStr = query.toString();
    return apiRequest(`/alerts${queryStr ? '?' + queryStr : ''}`);
}

/**
 * Get recent alerts for the live alerts panel.
 * @param {number} limit
 * @returns {Promise<Object>} { success, count, data: [...alerts] }
 */
async function apiGetRecentAlerts(limit = 20) {
    return apiRequest(`/alerts/recent?limit=${limit}`);
}

/**
 * Get alert statistics (counts by severity and status).
 * @returns {Promise<Object>} { success, data: { total, bySeverity, byStatus } }
 */
async function apiGetAlertStats() {
    return apiRequest('/alerts/stats');
}

/**
 * Update an alert's status.
 * @param {number} alertId
 * @param {string} status - 'ACTIVE', 'ACKNOWLEDGED', or 'RESOLVED'
 * @returns {Promise<Object>}
 */
async function apiUpdateAlertStatus(alertId, status) {
    return apiRequest(`/alerts/${alertId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
    });
}
