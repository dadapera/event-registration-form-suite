const path = require('path');
const dotenvFlow = require('dotenv-flow');
const log = require('./logger');

/**
 * Loads environment variables from .env files in the specified directory using dotenv-flow
 * @param {string} instancePath - Path to the instance directory
 * @param {string} instanceName - Name of the instance (for logging)
 * @returns {object} Object containing environment variables and helper function
 */
function loadInstanceEnvironment(instancePath, instanceName) {
    try {
        // Use dotenv-flow to securely load environment variables
        // Save current working directory and change to instance path
        const originalCwd = process.cwd();
        process.chdir(instancePath);
        
        const result = dotenvFlow.config({
            silent: true, // Don't throw errors if files don't exist
            node_env: process.env.NODE_ENV || 'development'
        });
        
        // Restore original working directory
        process.chdir(originalCwd);

        const formEnvVars = result.parsed || {};
        
        if (result.error) {
            log('WARN', `Error loading .env files for instance ${instanceName}`, { 
                error: result.error.message,
                path: instancePath 
            });
        } else {
            log('INFO', `Loaded environment variables for instance ${instanceName} using dotenv-flow`, { 
                path: instancePath,
                variableCount: Object.keys(formEnvVars).length,
                files: result.parsed ? 'found' : 'none'
            });
        }
        
        // Helper function to get environment variable with form-specific override
        const getEnvVar = (key, fallback = undefined) => {
            return formEnvVars[key] !== undefined ? formEnvVars[key] : (process.env[key] || fallback);
        };
        
        return {
            envVars: formEnvVars,
            getEnvVar
        };
        
    } catch (error) {
        log('ERROR', `Failed to load environment variables for instance ${instanceName}`, { 
            error: error.message,
            path: instancePath 
        });
        
        // Return empty but functional fallback
        return {
            envVars: {},
            getEnvVar: (key, fallback = undefined) => process.env[key] || fallback
        };
    }
}

module.exports = { loadInstanceEnvironment }; 