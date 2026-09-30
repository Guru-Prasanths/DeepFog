/**
 * DEEPFOG — Centralized Error Handler Middleware
 * 
 * Catches all errors passed via next(error) and returns
 * consistent, user-friendly JSON error responses.
 */

/**
 * Custom application error class with HTTP status codes.
 */
class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 404 Not Found handler — catches requests to undefined routes.
 */
function notFoundHandler(req, res, next) {
    const error = new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404);
    next(error);
}

/**
 * Global error handler middleware.
 * Formats error responses consistently and logs details in development.
 */
function errorHandler(err, req, res, _next) {
    const statusCode = err.statusCode || 500;
    const isDev = process.env.NODE_ENV === 'development';

    // Log the error for debugging
    if (statusCode >= 500) {
        console.error('[ERROR]', err.message);
        if (isDev) {
            console.error(err.stack);
        }
    }

    // Send JSON response
    res.status(statusCode).json({
        success: false,
        error: {
            message: statusCode >= 500 && !isDev
                ? 'An internal server error occurred'
                : err.message,
            statusCode: statusCode,
            ...(isDev && { stack: err.stack })
        }
    });
}

module.exports = { AppError, notFoundHandler, errorHandler };
