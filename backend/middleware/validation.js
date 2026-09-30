/**
 * DEEPFOG — Input Validation Middleware
 * 
 * Validates incoming request data for sensor payloads, vehicle data,
 * and ESP32 API key authentication.
 */

const { AppError } = require('./errorHandler');

/**
 * Validate ESP32 API key from the request header.
 * The ESP32 must send: X-API-Key: <key>
 */
function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.ESP32_API_KEY;

    // Skip API key validation if no key is configured (development convenience)
    if (!expectedKey || expectedKey === 'change_this_for_development') {
        return next();
    }

    if (!apiKey) {
        return next(new AppError('Missing API key. Set X-API-Key header.', 401));
    }

    if (apiKey !== expectedKey) {
        return next(new AppError('Invalid API key.', 403));
    }

    next();
}

/**
 * Validate sensor data payload from ESP32.
 * Ensures required fields are present and within reasonable ranges.
 */
function validateSensorData(req, res, next) {
    const data = req.body;

    // Required field: vehicleId
    if (!data.vehicleId || typeof data.vehicleId !== 'string') {
        return next(new AppError('Missing or invalid vehicleId. Must be a non-empty string.', 400));
    }

    // Validate GPS coordinates (optional but if provided, must be valid)
    if (data.gps) {
        if (typeof data.gps !== 'object') {
            return next(new AppError('GPS data must be an object with latitude and longitude.', 400));
        }
        if (data.gps.latitude !== undefined) {
            const lat = Number(data.gps.latitude);
            if (isNaN(lat) || lat < -90 || lat > 90) {
                return next(new AppError('GPS latitude must be between -90 and 90.', 400));
            }
        }
        if (data.gps.longitude !== undefined) {
            const lng = Number(data.gps.longitude);
            if (isNaN(lng) || lng < -180 || lng > 180) {
                return next(new AppError('GPS longitude must be between -180 and 180.', 400));
            }
        }
    }

    // Validate numeric sensor values (optional, but must be numbers if present)
    const numericFields = [
        { name: 'temperature', min: -40, max: 85 },
        { name: 'humidity', min: 0, max: 100 },
        { name: 'gas', min: 0, max: 4095 },
        { name: 'light', min: 0, max: 4095 },
        { name: 'distance', min: 0, max: 400 },
        { name: 'acceleration', min: 0, max: 20 },
        { name: 'tilt', min: -180, max: 180 }
    ];

    for (const field of numericFields) {
        if (data[field.name] !== undefined && data[field.name] !== null) {
            const value = Number(data[field.name]);
            if (isNaN(value)) {
                return next(new AppError(`${field.name} must be a number.`, 400));
            }
            if (value < field.min || value > field.max) {
                return next(new AppError(
                    `${field.name} value ${value} is out of expected range [${field.min}, ${field.max}].`, 400
                ));
            }
        }
    }

    // Validate vibration (boolean)
    if (data.vibration !== undefined && typeof data.vibration !== 'boolean') {
        return next(new AppError('vibration must be a boolean (true/false).', 400));
    }

    next();
}

/**
 * Validate vehicle creation/update payload.
 */
function validateVehicleData(req, res, next) {
    const data = req.body;

    if (!data.vehicle_id || typeof data.vehicle_id !== 'string') {
        return next(new AppError('Missing or invalid vehicle_id.', 400));
    }

    if (!data.vehicle_name || typeof data.vehicle_name !== 'string') {
        return next(new AppError('Missing or invalid vehicle_name.', 400));
    }

    const validTypes = ['HEMM', 'Dumper', 'Excavator', 'Loader', 'Drill', 'Other'];
    if (data.vehicle_type && !validTypes.includes(data.vehicle_type)) {
        return next(new AppError(`vehicle_type must be one of: ${validTypes.join(', ')}`, 400));
    }

    const validStatuses = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];
    if (data.status && !validStatuses.includes(data.status)) {
        return next(new AppError(`status must be one of: ${validStatuses.join(', ')}`, 400));
    }

    next();
}

module.exports = { validateApiKey, validateSensorData, validateVehicleData };
