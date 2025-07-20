// server.js
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const log = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // For shared assets like admin panel, css, js

const formsDir = path.join(__dirname, 'forms');
const instances = {};

// --- Server Initialization ---

try {
    if (!fs.existsSync(formsDir)) {
        fs.mkdirSync(formsDir);
        log('INFO', `Created 'forms' directory, as it did not exist.`)
    }

    const instanceFolders = fs.readdirSync(formsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const instanceName of instanceFolders) {
        const instancePath = path.join(formsDir, instanceName);
        const configPath = path.join(instancePath, 'config.json');
        const dbPath = path.join(instancePath, 'database.sqlite');
        const indexPath = path.join(instancePath, 'index.html');
        const instanceModulePath = path.join(instancePath, 'instance.js');

        if (fs.existsSync(configPath) && fs.existsSync(indexPath) && fs.existsSync(instanceModulePath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            
            // Create database if it doesn't exist
            if (!fs.existsSync(dbPath)) {
                log('INFO', `Database file not found for instance ${instanceName}, creating new database`, { dbPath });
            }
            
            const db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    log('ERROR', `Failed to connect to database for instance ${instanceName}`, { error: err.message, dbPath });
            } else {
                    log('INFO', `Connected to database for instance ${instanceName}`, { dbPath });
                }
            });

            // Dynamically load the instance-specific router module
            const createInstanceRouter = require(instanceModulePath);
            const router = createInstanceRouter(db, instanceName, config);

            instances[instanceName] = {
                name: config.name || instanceName,
                indexPath,
                db,
                router
            };

            // Mount the instance router
            app.use(`/${instanceName}`, (req, res, next) => {
                // Attach instance-specific context to the request for use in handlers
                req.instance = instances[instanceName];
                next();
            }, router);

            log('SYSTEM', `Instance '${instanceName}' loaded and mounted.`);
        } else {
            log('WARN', `Instance '${instanceName}' is missing required files (config.json, index.html, instance.js) and will be skipped.`);
        }
    }
} catch (error) {
    log('ERROR', 'Failed to load form instances.', { error: error.message, stack: error.stack });
    process.exit(1);
}

// Root redirect to the first available instance
app.get('/', (req, res) => {
    const defaultInstance = Object.keys(instances)[0];
    if (defaultInstance) {
        return res.redirect(`/${defaultInstance}`);
    }
    res.status(404).send('<h1>Event Form Suite</h1><p>No form instances configured.</p>');
});

// Start Server
app.listen(PORT, () => {
  log('SYSTEM', `Server starting up and listening on port ${PORT}`);
    if (Object.keys(instances).length > 0) {
        log('SYSTEM', `Available form instances:`);
        Object.keys(instances).forEach(instanceName => {
            log('SYSTEM', `  - ${instances[instanceName].name}: http://localhost:${PORT}/${instanceName}`);
            log('SYSTEM', `    Admin: http://localhost:${PORT}/${instanceName}/admin`);
        });
    } else {
        log('WARN', 'No form instances were loaded. Check the ./forms directory and logs.');
    }
});

// Graceful Shutdown
process.on('SIGINT', () => {
    log('SYSTEM', 'SIGINT signal received. Closing all database connections.');
    const closers = Object.values(instances).map(instance => {
        return new Promise((resolve) => {
            if (instance.db) {
                instance.db.close(err => {
    if (err) {
                        log('ERROR', `Error closing DB for instance ${instance.name}`, { error: err.message });
                    } else {
                        log('INFO', `Database connection closed for instance ${instance.name}.`);
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    });

    Promise.all(closers).then(() => {
        log('SYSTEM', 'All database connections closed.');
    process.exit(0);
  });
});