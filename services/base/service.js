// Base service for individual form instances
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
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
const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const configPath = path.join(__dirname, 'config.json');
const indexPath = path.join(__dirname, 'index.html');
const instanceModulePath = path.join(__dirname, 'instance.js');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log('INFO', `Created data directory: ${dataDir}`);
}

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

// Initialize database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        log('ERROR', `Failed to connect to database: ${err.message}`, { dbPath });
        process.exit(1);
    } else {
        log('INFO', `Connected to SQLite database`, { dbPath });
    }
});

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
        dbPath: dbPath
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    log('SYSTEM', `SIGINT received for service '${INSTANCE_NAME}'. Closing database connection.`);
    db.close(err => {
        if (err) {
            log('ERROR', `Error closing database for '${INSTANCE_NAME}'`, { error: err.message });
        } else {
            log('INFO', `Database connection closed for '${INSTANCE_NAME}'`);
        }
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    log('SYSTEM', `SIGTERM received for service '${INSTANCE_NAME}'. Closing database connection.`);
    db.close(err => {
        if (err) {
            log('ERROR', `Error closing database for '${INSTANCE_NAME}'`, { error: err.message });
        } else {
            log('INFO', `Database connection closed for '${INSTANCE_NAME}'`);
        }
        process.exit(0);
    });
}); 