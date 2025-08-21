// Base service for individual form instances
require('dotenv').config();
const express = require('express');
const { createDatabase } = require('./utils/database');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const log = require('./utils/logger');

const app = express();
const PORT = process.env.SERVICE_PORT || 3000;
const INSTANCE_NAME = process.env.INSTANCE_NAME;

if (!INSTANCE_NAME) {
    log('ERROR', 'INSTANCE_NAME environment variable is required');
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        instance: INSTANCE_NAME,
        timestamp: new Date().toISOString()
    });
});

// Database setup
const configPath = path.join(__dirname, 'config.json');
const indexPath = path.join(__dirname, 'index.html');
const instanceModulePath = path.join(__dirname, 'instance.js');

// Validate required files
if (!fs.existsSync(configPath)) {
    log('ERROR', `Configuration file not found: ${configPath}`);
    process.exit(1);
}

if (!fs.existsSync(indexPath)) {
    log('ERROR', `Index file not found: ${indexPath}`);
    process.exit(1);
}

if (!fs.existsSync(instanceModulePath)) {
    log('ERROR', `Instance module not found: ${instanceModulePath}`);
    process.exit(1);
}

// Load configuration
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
log('INFO', `Loaded configuration for instance: ${INSTANCE_NAME}`, { name: config.name });

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database
        const db = createDatabase();
        await db.connect();
        log('INFO', `Connected to PostgreSQL database for instance: ${INSTANCE_NAME}`);

        // Load instance router
        const createInstanceRouter = require(instanceModulePath);
        const router = createInstanceRouter(db, INSTANCE_NAME, config);

        // Create instance context for requests
        app.use((req, res, next) => {
            req.instance = {
                name: config.name || INSTANCE_NAME,
                indexPath,
                db,
                router
            };
            next();
        });

        // Mount the instance router at root (since each service handles one instance)
        app.use('/', router);

        // Error handling middleware
        app.use((err, req, res, next) => {
            log('ERROR', `Unhandled error in ${INSTANCE_NAME}`, { 
                error: err.message, 
                stack: err.stack,
                url: req.url,
                method: req.method
            });
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error' 
            });
        });

        // 404 handler
        app.use((req, res) => {
            log('WARN', `404 - Route not found in ${INSTANCE_NAME}`, { 
                url: req.url, 
                method: req.method 
            });
            res.status(404).json({ 
                success: false, 
                error: 'Route not found' 
            });
        });

        // Start server
        app.listen(PORT, () => {
            log('SYSTEM', `Service '${INSTANCE_NAME}' started`, { 
                port: PORT,
                name: config.name,
                database: 'PostgreSQL'
            });
        });

        // Store db reference globally for graceful shutdown
        global.dbInstance = db;

    } catch (err) {
        log('ERROR', `Failed to start service: ${err.message}`);
        process.exit(1);
    }
}

// Start the server
startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
    log('SYSTEM', `SIGINT received for service '${INSTANCE_NAME}'. Closing database connection.`);
    try {
        if (global.dbInstance) {
            await global.dbInstance.close();
            log('INFO', `Database connection closed for '${INSTANCE_NAME}'`);
        }
    } catch (err) {
        log('ERROR', `Error closing database for '${INSTANCE_NAME}'`, { error: err.message });
    } finally {
        process.exit(0);
    }
});

process.on('SIGTERM', async () => {
    log('SYSTEM', `SIGTERM received for service '${INSTANCE_NAME}'. Closing database connection.`);
    try {
        if (global.dbInstance) {
            await global.dbInstance.close();
            log('INFO', `Database connection closed for '${INSTANCE_NAME}'`);
        }
    } catch (err) {
        log('ERROR', `Error closing database for '${INSTANCE_NAME}'`, { error: err.message });
    } finally {
        process.exit(0);
    }
}); 