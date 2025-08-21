#!/usr/bin/env node

/**
 * Database Connection Test Script
 * Tests PostgreSQL connection and table creation for Event Form Suite
 */

require('dotenv').config();
const { createDatabase } = require('./utils/database');

const testConnection = async () => {
    console.log('🔍 Testing PostgreSQL Database Connection...\n');
    
    try {
        // Create database connection
        const db = createDatabase();
        
        console.log('📡 Connecting to PostgreSQL...');
        await db.connect();
        console.log('✅ Database connection successful!\n');
        
        // Test basic query
        console.log('🔍 Testing basic query...');
        const result = await db.query('SELECT NOW() as current_time, version() as pg_version');
        console.log(`✅ Query successful!`);
        console.log(`   Current time: ${result.rows[0].current_time}`);
        console.log(`   PostgreSQL version: ${result.rows[0].pg_version}\n`);
        
        // Test table creation for crociera-fiordi instance
        console.log('🏗️  Testing table creation...');
        
        // Create registrazioni table
        await db.run(`
            CREATE TABLE IF NOT EXISTS test_registrazioni (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) UNIQUE,
                nome VARCHAR(255), 
                cognome VARCHAR(255), 
                email VARCHAR(255), 
                cellulare VARCHAR(255), 
                data_nascita DATE,
                indirizzo TEXT, 
                codice_fiscale VARCHAR(255), 
                partenza VARCHAR(255),
                camera_singola INTEGER DEFAULT 0, 
                camera_doppia INTEGER DEFAULT 0,
                camera_tripla INTEGER DEFAULT 0, 
                camera_quadrupla INTEGER DEFAULT 0,
                costo_totale_gruppo DECIMAL(10,2), 
                evento VARCHAR(255), 
                data_iscrizione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fatturazione_aziendale BOOLEAN DEFAULT false
            )
        `);
        console.log('✅ test_registrazioni table created successfully');
        
        // Create accompagnatori_dettagli table
        await db.run(`
            CREATE TABLE IF NOT EXISTS test_accompagnatori_dettagli (
                id SERIAL PRIMARY KEY,
                registrazione_id INTEGER REFERENCES test_registrazioni(id) ON DELETE CASCADE, 
                nome VARCHAR(255), 
                cognome VARCHAR(255), 
                data_nascita DATE,
                indirizzo TEXT, 
                codice_fiscale VARCHAR(255)
            )
        `);
        console.log('✅ test_accompagnatori_dettagli table created successfully');
        
        // Create dati_fatturazione table
        await db.run(`
            CREATE TABLE IF NOT EXISTS test_dati_fatturazione (
                id SERIAL PRIMARY KEY,
                registrazione_id INTEGER REFERENCES test_registrazioni(id) ON DELETE CASCADE, 
                ragione_sociale VARCHAR(255), 
                partita_iva VARCHAR(255),
                codice_fiscale_azienda VARCHAR(255), 
                indirizzo_sede_legale TEXT,
                codice_sdi VARCHAR(255), 
                pec_azienda VARCHAR(255)
            )
        `);
        console.log('✅ test_dati_fatturazione table created successfully\n');
        
        // Test transaction
        console.log('🔄 Testing transaction...');
        const testData = await db.transaction(async (client) => {
            const insertResult = await client.query(`
                INSERT INTO test_registrazioni (
                    user_id, nome, cognome, email, cellulare, data_nascita, 
                    indirizzo, codice_fiscale, partenza, evento, costo_totale_gruppo
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id
            `, [
                'TEST_001', 'Test', 'User', 'test@example.com', '1234567890', 
                '1990-01-01', 'Test Address', 'TESTCF90A01H501Z', 'fco', 
                'Test Event', 199.99
            ]);
            return insertResult.rows[0].id;
        });
        console.log(`✅ Transaction successful! Test record ID: ${testData}\n`);
        
        // Clean up test data
        console.log('🧹 Cleaning up test data...');
        await db.run('DROP TABLE IF EXISTS test_dati_fatturazione');
        await db.run('DROP TABLE IF EXISTS test_accompagnatori_dettagli');
        await db.run('DROP TABLE IF EXISTS test_registrazioni');
        console.log('✅ Test tables cleaned up\n');
        
        // Close connection
        console.log('🔌 Closing database connection...');
        await db.close();
        console.log('✅ Connection closed successfully\n');
        
        console.log('🎉 All database tests passed! Your PostgreSQL setup is working correctly.\n');
        console.log('📝 Next steps:');
        console.log('   1. Run the deployment script: ./deploy-microservices.sh');
        console.log('   2. Check the services at http://localhost:3000');
        console.log('   3. Configure your SMTP settings in the .env file for email functionality\n');
        
    } catch (error) {
        console.error('❌ Database test failed:', error.message);
        console.error('\n🔧 Troubleshooting:');
        console.error('   1. Verify your DATABASE_URL is correct');
        console.error('   2. Check that the PostgreSQL database is accessible');
        console.error('   3. Ensure the database user has CREATE TABLE permissions');
        console.error('   4. Check network connectivity to the database host\n');
        process.exit(1);
    }
};

// Run the test
testConnection();
