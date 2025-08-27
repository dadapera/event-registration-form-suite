require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const log = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;
const INSTANCE_NAME = 'settimana-bianca-Lafenice-2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        service: INSTANCE_NAME,
        instance: INSTANCE_NAME,
        timestamp: new Date().toISOString()
    });
});

// Favicon endpoint to prevent 404 logs
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content response
});

// Robots.txt endpoint to prevent 404 logs
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send('User-agent: *\nDisallow: /');
});

// Database setup
const configPath = path.join(__dirname, 'config.json');
const indexPath = path.join(__dirname, 'src', 'index.html');
const instanceModulePath = path.join(__dirname, 'src', 'instance.js');

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
log('INFO', `Loaded configuration for ${config.name || INSTANCE_NAME}`);

// Validate database URL
const databaseUrl = process.env.RENDER_POSTGRESQL_DB_URL;
if (!databaseUrl) {
    log('ERROR', 'Database URL not found. Please set RENDER_POSTGRESQL_DB_URL environment variable or configure database.url in config.json');
    process.exit(1);
}

if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    log('ERROR', 'Invalid database URL format. Expected postgresql:// or postgres:// URL');
    process.exit(1);
}

log('INFO', 'Database URL validated successfully');

// Initialize PostgreSQL connection pool
const dbConfig = {
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
};

const pool = new Pool(dbConfig);

// Retry connection function
async function connectWithRetry(maxRetries = 5, delay = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await pool.query('SELECT NOW()');
            log('INFO', `Connected to PostgreSQL database on attempt ${attempt}`, { 
                host: pool.options.host,
                database: pool.options.database,
                port: pool.options.port
            });
            return result;
        } catch (err) {
            log('WARN', `Database connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
            
            if (attempt === maxRetries) {
                log('ERROR', `Failed to connect to PostgreSQL database after ${maxRetries} attempts`, { 
                    dbConfig: { ...dbConfig, connectionString: '***' } 
                });
                process.exit(1);
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Test database connection with retry
connectWithRetry();

// Load instance router
const createInstanceRouter = require(instanceModulePath);
const router = createInstanceRouter(pool, INSTANCE_NAME, config);

// Create instance context for requests
app.use((req, res, next) => {
    req.instance = {
        name: config.name || INSTANCE_NAME,
        indexPath,
        pool,
        router
    };
    next();
});

// Mount the instance router at root (standalone service)
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
    // Don't log common browser requests that are expected to 404
    const commonBrowserRequests = [
        '/favicon.ico',
        '/robots.txt',
        '/.well-known/appspecific/com.chrome.devtools.json',
        '/.well-known/security.txt'
    ];
    
    if (!commonBrowserRequests.includes(req.url)) {
        log('WARN', `404 - Route not found in ${INSTANCE_NAME}`, { 
            url: req.url, 
            method: req.method 
        });
    }
    
    res.status(404).json({ 
        success: false, 
        error: 'Route not found' 
    });
});

// Start server
app.listen(PORT, () => {
    log('SYSTEM', `${INSTANCE_NAME} service started`, { 
        port: PORT,
        name: config.name,
        instanceName: INSTANCE_NAME
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    log('SYSTEM', `SIGINT received for ${INSTANCE_NAME}. Closing database pool.`);
    pool.end(err => {
        if (err) {
            log('ERROR', `Error closing database pool for ${INSTANCE_NAME}`, { error: err.message });
        } else {
            log('INFO', `Database pool closed for ${INSTANCE_NAME}`);
        }
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    log('SYSTEM', `SIGTERM received for ${INSTANCE_NAME}. Closing database pool.`);
    pool.end(err => {
        if (err) {
            log('ERROR', `Error closing database pool for ${INSTANCE_NAME}`, { error: err.message });
        } else {
            log('INFO', `Database pool closed for ${INSTANCE_NAME}`);
        }
        process.exit(0);
    });
});
