const { Pool } = require('pg');
const log = require('./logger');

class DatabaseConnection {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    async connect() {
        if (this.isConnected && this.pool) {
            return this.pool;
        }

        const config = {
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        };

        // Support for individual connection parameters (fallback for local development)
        if (!process.env.DATABASE_URL) {
            config.host = process.env.DB_HOST || 'localhost';
            config.port = process.env.DB_PORT || 5432;
            config.database = process.env.DB_NAME || 'event_forms';
            config.user = process.env.DB_USER || 'postgres';
            config.password = process.env.DB_PASSWORD || 'password';
            delete config.connectionString;
        }

        try {
            this.pool = new Pool(config);
            
            // Test the connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            
            this.isConnected = true;
            log('INFO', 'Connected to PostgreSQL database');
            
            return this.pool;
        } catch (error) {
            log('ERROR', `Failed to connect to PostgreSQL database: ${error.message}`);
            throw error;
        }
    }

    async query(text, params = []) {
        if (!this.pool) {
            await this.connect();
        }
        
        try {
            const result = await this.pool.query(text, params);
            return result;
        } catch (error) {
            log('ERROR', `Database query error: ${error.message}`, { query: text, params });
            throw error;
        }
    }

    async getClient() {
        if (!this.pool) {
            await this.connect();
        }
        return this.pool.connect();
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            log('INFO', 'PostgreSQL connection pool closed');
        }
    }

    // Helper method for transactions
    async transaction(callback) {
        const client = await this.getClient();
        
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // SQLite-like methods for easier migration
    serialize(callback) {
        // PostgreSQL doesn't need serialization like SQLite
        callback();
    }

    run(query, params = []) {
        return this.query(query, params);
    }

    get(query, params = []) {
        return this.query(query, params).then(result => result.rows[0] || null);
    }

    all(query, params = []) {
        return this.query(query, params).then(result => result.rows || []);
    }

    prepare(query) {
        // Return a prepared statement-like object
        return {
            run: (params = []) => this.query(query, params),
            get: (params = []) => this.get(query, params),
            all: (params = []) => this.all(query, params),
            finalize: () => {
                // No-op for PostgreSQL compatibility
            }
        };
    }
}

// Create a singleton instance
const dbConnection = new DatabaseConnection();

module.exports = {
    DatabaseConnection,
    dbConnection,
    createDatabase: () => dbConnection
};
