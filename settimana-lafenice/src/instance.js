const express = require('express');
const path = require('path');
const fs = require('fs');
const { generateRegistrationPDF } = require('../utils/pdfGenerator');
const log = require('../utils/logger'); // Fixed path for microservices
const { createMailer } = require('../utils/mailer');

// Function to format date to readable Italian format
function formatDateToItalian(dateString) {
    if (!dateString) return '';
    
    try {
        const date = new Date(dateString);
        
        // Check if date is valid
        if (isNaN(date.getTime())) return dateString;
        
        return date.toLocaleDateString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Rome'
        });
    } catch (error) {
        return dateString;
    }
}

// Function to format birth date (date only, no time)
function formatBirthDate(dateString) {
    if (!dateString) return '';
    
    try {
        const date = new Date(dateString);
        
        // Check if date is valid
        if (isNaN(date.getTime())) return dateString;
        
        return date.toLocaleDateString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Europe/Rome'
        });
    } catch (error) {
        return dateString;
    }
}


async function createTables(pool, instanceName) {
    try {
        // Create registrazioni table
        await pool.query(`CREATE TABLE IF NOT EXISTS registrazioni (
            id SERIAL PRIMARY KEY,
            user_id TEXT UNIQUE,
            nome TEXT, cognome TEXT, email TEXT, cellulare TEXT, data_nascita TEXT,
            via_e_numero_civico TEXT, cap TEXT, citta TEXT, provincia TEXT,
            indirizzo TEXT, codice_fiscale TEXT, luogo_nascita TEXT, cittadinanza TEXT,
            esigenze_alimentari TEXT,
            camera_singola INTEGER DEFAULT 0, camera_doppia INTEGER DEFAULT 0,
            camera_tripla INTEGER DEFAULT 0, camera_quadrupla INTEGER DEFAULT 0,
            costo_totale_gruppo REAL, evento TEXT, data_iscrizione TEXT,
            fatturazione_aziendale BOOLEAN DEFAULT false, agente TEXT
        )`);

        // Create accompagnatori_dettagli table
        await pool.query(`CREATE TABLE IF NOT EXISTS accompagnatori_dettagli (
            id SERIAL PRIMARY KEY,
            registrazione_id INTEGER, nome TEXT, cognome TEXT, data_nascita TEXT,
            indirizzo TEXT, codice_fiscale TEXT, luogo_nascita TEXT, cittadinanza TEXT,
            email TEXT, cellulare TEXT, esigenze_alimentari TEXT,
            FOREIGN KEY(registrazione_id) REFERENCES registrazioni(id) ON DELETE CASCADE
        )`);

        // Create dati_fatturazione table with enhanced private billing support
        await pool.query(`CREATE TABLE IF NOT EXISTS dati_fatturazione (
            id SERIAL PRIMARY KEY,
            registrazione_id INTEGER,
            -- Company billing fields
            ragione_sociale TEXT, partita_iva TEXT,
            codice_fiscale_azienda TEXT, indirizzo_sede_legale TEXT,
            sede_via_e_numero_civico TEXT, sede_cap TEXT, sede_citta TEXT,
            codice_sdi TEXT, pec_azienda TEXT,
            -- Private billing fields  
            fattura_nome TEXT, fattura_cognome TEXT, fattura_codice_fiscale TEXT,
            fattura_via_e_numero_civico TEXT, fattura_cap TEXT, fattura_citta TEXT,
            indirizzo_residenza TEXT,
            FOREIGN KEY(registrazione_id) REFERENCES registrazioni(id) ON DELETE CASCADE
        )`);
        
        // Add new columns to existing tables if they don't exist
        try {
            await pool.query(`ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS luogo_nascita TEXT`);
            await pool.query(`ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS cittadinanza TEXT`);
            await pool.query(`ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS esigenze_alimentari TEXT`);
            await pool.query(`ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS via_e_numero_civico TEXT`);
            await pool.query(`ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS cap TEXT`);
            await pool.query(`ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS citta TEXT`);
            await pool.query(`ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS provincia TEXT`);
            await pool.query(`ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS agente TEXT`);
            
            await pool.query(`ALTER TABLE accompagnatori_dettagli ADD COLUMN IF NOT EXISTS luogo_nascita TEXT`);
            await pool.query(`ALTER TABLE accompagnatori_dettagli ADD COLUMN IF NOT EXISTS cittadinanza TEXT`);
            await pool.query(`ALTER TABLE accompagnatori_dettagli ADD COLUMN IF NOT EXISTS email TEXT`);
            await pool.query(`ALTER TABLE accompagnatori_dettagli ADD COLUMN IF NOT EXISTS cellulare TEXT`);
            await pool.query(`ALTER TABLE accompagnatori_dettagli ADD COLUMN IF NOT EXISTS esigenze_alimentari TEXT`);
            
            await pool.query(`ALTER TABLE dati_fatturazione ADD COLUMN IF NOT EXISTS fattura_nome TEXT`);
            await pool.query(`ALTER TABLE dati_fatturazione ADD COLUMN IF NOT EXISTS fattura_cognome TEXT`);
            await pool.query(`ALTER TABLE dati_fatturazione ADD COLUMN IF NOT EXISTS fattura_codice_fiscale TEXT`);
            await pool.query(`ALTER TABLE dati_fatturazione ADD COLUMN IF NOT EXISTS fattura_via_e_numero_civico TEXT`);
            await pool.query(`ALTER TABLE dati_fatturazione ADD COLUMN IF NOT EXISTS fattura_cap TEXT`);
            await pool.query(`ALTER TABLE dati_fatturazione ADD COLUMN IF NOT EXISTS fattura_citta TEXT`);
            await pool.query(`ALTER TABLE dati_fatturazione ADD COLUMN IF NOT EXISTS indirizzo_residenza TEXT`);
            await pool.query(`ALTER TABLE dati_fatturazione ADD COLUMN IF NOT EXISTS sede_via_e_numero_civico TEXT`);
            await pool.query(`ALTER TABLE dati_fatturazione ADD COLUMN IF NOT EXISTS sede_cap TEXT`);
            await pool.query(`ALTER TABLE dati_fatturazione ADD COLUMN IF NOT EXISTS sede_citta TEXT`);
            
            log('SYSTEM', `Database schema updated with new fields for instance '${instanceName}'.`);
        } catch (error) {
            log('WARN', `Schema update failed (may be normal if columns already exist): ${error.message}`);
        }
        
        log('SYSTEM', `Database tables ready for instance '${instanceName}'.`);
    } catch (error) {
        log('ERROR', `Failed to create tables for instance '${instanceName}': ${error.message}`);
        throw error;
    }
}

// Function to generate PDF summary content
function generateSummaryHTML(registrationData) {
    return `
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Riepilogo Iscrizione</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    margin: 0;
                    padding: 20px;
                    color: #333;
                    background: white;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: white;
                    padding: 20px;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    border-bottom: 2px solid #1e40af;
                    padding-bottom: 15px;
                }
                .section {
                    margin: 20px 0;
                    page-break-inside: avoid;
                }
                .section-title {
                    font-weight: bold;
                    color: #1e40af;
                    border-bottom: 1px solid #1e40af;
                    padding-bottom: 5px;
                    margin-bottom: 15px;
                    font-size: 16px;
                }
                .grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    margin-bottom: 10px;
                }
                .grid-full {
                    grid-column: 1 / -1;
                }
                .guest-block {
                    border: 1px solid #e5e7eb;
                    border-radius: 5px;
                    padding: 15px;
                    margin: 10px 0;
                    page-break-inside: avoid;
                }
                .guest-title {
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: #1e40af;
                }
                .guest-info {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }
                .info-item {
                    margin-bottom: 8px;
                }
                .info-label {
                    font-weight: bold;
                    color: #6b7280;
                    font-size: 14px;
                }
                .info-value {
                    color: #111827;
                }
                .total-section {
                    background: #f3f4f6;
                    padding: 20px;
                    border-radius: 8px;
                    margin-top: 20px;
                    text-align: center;
                }
                .total-amount {
                    font-size: 24px;
                    font-weight: bold;
                    color: #1e40af;
                }
                .footer {
                    margin-top: 40px;
                    text-align: center;
                    font-size: 14px;
                    color: #6b7280;
                    border-top: 1px solid #e5e7eb;
                    padding-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Riepilogo Iscrizione</h1>
                    <h2>${registrationData.evento}</h2>
                    <p>Data iscrizione: ${formatDateToItalian(registrationData.data_iscrizione)}</p>
                </div>

                <div class="section">
                    <div class="section-title">Dati Principali</div>
                    <div class="grid">
                        <div class="info-item">
                            <div class="info-label">Nome</div>
                            <div class="info-value">${registrationData.nome}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Cognome</div>
                            <div class="info-value">${registrationData.cognome}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Email</div>
                            <div class="info-value">${registrationData.email}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Cellulare</div>
                            <div class="info-value">${registrationData.cellulare}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Data di Nascita</div>
                            <div class="info-value">${formatBirthDate(registrationData.data_nascita)}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Indirizzo</div>
                            <div class="info-value">${registrationData.via_e_numero_civico ? `${registrationData.via_e_numero_civico}, ${registrationData.cap} ${registrationData.citta}, ${registrationData.provincia}` : registrationData.indirizzo}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Codice Fiscale</div>
                            <div class="info-value">${registrationData.codice_fiscale}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Luogo di Nascita</div>
                            <div class="info-value">${registrationData.luogo_nascita || '-'}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Cittadinanza</div>
                            <div class="info-value">${registrationData.cittadinanza || '-'}</div>
                        </div>
                        ${registrationData.esigenze_alimentari ? `<div class="info-item grid-full">
                            <div class="info-label">Esigenze Alimentari</div>
                            <div class="info-value">${registrationData.esigenze_alimentari}</div>
                        </div>` : ''}

                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Configurazione Camere</div>
                    <div class="grid">
                        ${registrationData.camera_singola > 0 ? `<div class="info-item">
                            <div class="info-label">Camera Singola</div>
                            <div class="info-value">${registrationData.camera_singola}</div>
                        </div>` : ''}
                        ${registrationData.camera_doppia > 0 ? `<div class="info-item">
                            <div class="info-label">Camera Doppia</div>
                            <div class="info-value">${registrationData.camera_doppia}</div>
                        </div>` : ''}
                        ${registrationData.camera_tripla > 0 ? `<div class="info-item">
                            <div class="info-label">Camera Tripla</div>
                            <div class="info-value">${registrationData.camera_tripla}</div>
                        </div>` : ''}
                        ${registrationData.camera_quadrupla > 0 ? `<div class="info-item">
                            <div class="info-label">Camera Quadrupla</div>
                            <div class="info-value">${registrationData.camera_quadrupla}</div>
                        </div>` : ''}
                    </div>
                </div>

                ${registrationData.ospiti && registrationData.ospiti.length > 0 ? `
                <div class="section">
                    <div class="section-title">Accompagnatori (${registrationData.ospiti.length})</div>
                    ${registrationData.ospiti.map((ospite, index) => `
                        <div class="guest-block">
                            <div class="guest-title">Accompagnatore ${index + 1}</div>
                            <div class="guest-info">
                                <div class="info-item">
                                    <div class="info-label">Nome</div>
                                    <div class="info-value">${ospite.nome}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Cognome</div>
                                    <div class="info-value">${ospite.cognome}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Data di Nascita</div>
                                    <div class="info-value">${formatBirthDate(ospite.data_nascita)}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Codice Fiscale</div>
                                    <div class="info-value">${ospite.codice_fiscale || '-'}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Luogo di Nascita</div>
                                    <div class="info-value">${ospite.luogo_nascita || '-'}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Cittadinanza</div>
                                    <div class="info-value">${ospite.cittadinanza || '-'}</div>
                                </div>
                                ${ospite.email ? `<div class="info-item">
                                    <div class="info-label">Email</div>
                                    <div class="info-value">${ospite.email}</div>
                                </div>` : ''}
                                ${ospite.cellulare ? `<div class="info-item">
                                    <div class="info-label">Cellulare</div>
                                    <div class="info-value">${ospite.cellulare}</div>
                                </div>` : ''}
                                <div class="info-item grid-full">
                                    <div class="info-label">Indirizzo</div>
                                    <div class="info-value">${ospite.indirizzo || '-'}</div>
                                </div>
                                ${ospite.esigenze_alimentari ? `<div class="info-item grid-full">
                                    <div class="info-label">Esigenze Alimentari</div>
                                    <div class="info-value">${ospite.esigenze_alimentari}</div>
                                </div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}

                ${registrationData.dati_fatturazione && registrationData.dati_fatturazione.ragione_sociale ? `
                <div class="section">
                    <div class="section-title">Dati Fatturazione Aziendale</div>
                    <div class="grid">
                        <div class="info-item">
                            <div class="info-label">Nome Azienda</div>
                            <div class="info-value">${registrationData.dati_fatturazione.ragione_sociale || '-'}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Partita IVA</div>
                            <div class="info-value">${registrationData.dati_fatturazione.partita_iva || '-'}</div>
                        </div>
                        <div class="info-item grid-full">
                            <div class="info-label">Via e Nr. Civico, CAP, Città</div>
                            <div class="info-value">${registrationData.dati_fatturazione.indirizzo_sede_legale || '-'}</div>
                        </div>
                    </div>
                </div>
                ` : ''}

                ${registrationData.dati_fatturazione && registrationData.dati_fatturazione.fattura_nome ? `
                <div class="section">
                    <div class="section-title">Dati Fatturazione Privata</div>
                    <div class="grid">
                        <div class="info-item">
                            <div class="info-label">Nome</div>
                            <div class="info-value">${registrationData.dati_fatturazione.fattura_nome || '-'}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Cognome</div>
                            <div class="info-value">${registrationData.dati_fatturazione.fattura_cognome || '-'}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Codice Fiscale</div>
                            <div class="info-value">${registrationData.dati_fatturazione.fattura_codice_fiscale || '-'}</div>
                        </div>
                        <div class="info-item grid-full">
                            <div class="info-label">Indirizzo Fatturazione</div>
                            <div class="info-value">${registrationData.dati_fatturazione.fattura_via_e_numero_civico ? `${registrationData.dati_fatturazione.fattura_via_e_numero_civico}, ${registrationData.dati_fatturazione.fattura_cap} ${registrationData.dati_fatturazione.fattura_citta}` : registrationData.dati_fatturazione.indirizzo_residenza || '-'}</div>
                        </div>
                    </div>
                </div>
                ` : ''}

                <div class="total-section">
                    <div class="info-label">Costo Totale Gruppo</div>
                    <div class="total-amount">€ ${registrationData.costo_totale_gruppo}</div>
                </div>

                <div class="footer">
                    <p>Questo documento è stato generato automaticamente dal sistema di registrazione.</p>
                    <p>Per qualsiasi chiarimento, contattare l'agenzia di viaggio.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// PDF generation is now handled by utils/pdfGenerator.js

module.exports = function(pool, instanceName, config) {
    // Create instance-specific mailer with environment variables
    const envConfig = {
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_PORT: process.env.SMTP_PORT,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS,
        EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
        EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS
    };
    const { sendMail } = createMailer(envConfig);
    
    // Ensure tables are created for this instance
    createTables(pool, instanceName).catch(err => {
        log('ERROR', `Failed to create tables for instance '${instanceName}': ${err.message}`);
    });

    const router = express.Router();

    // Serve static assets (images, CSS, JS) from the instance's assets directory
    router.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

    // The root of this router is already namespaced with the instance name
    // So, a GET on '/' here corresponds to a GET on '/{instanceName}/'
    router.get('/', (req, res) => {
        res.sendFile(req.instance.indexPath);
    });

    // --- API Routes for the instance ---

    router.get('/api/config', (req, res) => {
        log('DEBUG', `Request for config received for instance '${instanceName}'`);
        res.json({
            name: config.name || instanceName,
            eventName: config.eventName || config.name || instanceName,
            eventLocation: config.eventLocation,
            eventStartDate: config.eventStartDate,
            eventEndDate: config.eventEndDate,
            deadlineSubmission: config.deadlineSubmission,
            calculationDate: config.calculationDate
        });
    });

    router.post('/api/generate-pdf/:registrationId', async (req, res) => {
        const registrationId = req.params.registrationId;
        log('DEBUG', `Request to generate PDF for registration ${registrationId} in instance '${instanceName}'`);
        
        try {
            // Get registration data from database
            const query = `
                SELECT 
                    r.*, 
                    df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
                    df.indirizzo_sede_legale, df.codice_sdi, df.pec_azienda
                FROM registrazioni r
                LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
                WHERE r.id = $1
            `;
            
            const registrationResult = await pool.query(query, [registrationId]);
            const registration = registrationResult.rows[0];
            
            if (!registration) {
                log('WARN', `Registration ${registrationId} not found for PDF generation`);
                return res.status(404).json({ error: 'Registration not found' });
            }
            
            // Get guests data
            const guestsQuery = `
                SELECT nome, cognome, data_nascita, codice_fiscale, indirizzo, luogo_nascita, cittadinanza
                FROM accompagnatori_dettagli
                WHERE registrazione_id = $1
                ORDER BY id
            `;
            
            const guestsResult = await pool.query(guestsQuery, [registrationId]);
            const guests = guestsResult.rows;
            
            // Prepare registration data with guests
            const registrationData = {
                ...registration,
                ospiti: guests || [],
                dati_fatturazione: registration.fatturazione_aziendale ? {
                    ragione_sociale: registration.ragione_sociale,
                    partita_iva: registration.partita_iva,
                    codice_fiscale_azienda: registration.codice_fiscale_azienda,
                    indirizzo_sede_legale: registration.indirizzo_sede_legale,
                    codice_sdi: registration.codice_sdi,
                    pec_azienda: registration.pec_azienda
                } : null
            };
            

            
            try {
                // Generate PDF
                const pdfBuffer = await generateRegistrationPDF(registrationData, registration.evento);
                
                // Set response headers for PDF download
                const safeEventName = registration.evento.replace(/[^a-z0-9]/gi, '-').toLowerCase();
                const filename = `riepilogo-iscrizione-${safeEventName}-${registrationId}.pdf`;
                
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.setHeader('Content-Length', pdfBuffer.length);
                
                res.send(pdfBuffer);
                
                log('INFO', `PDF generated successfully for registration ${registrationId}`);
                
            } catch (pdfError) {
                log('ERROR', `Error generating PDF for registration ${registrationId}: ${pdfError.message}`);
                res.status(500).json({ error: 'PDF generation failed' });
            }
            
        } catch (error) {
            log('ERROR', `Error in PDF generation endpoint: ${error.message}`);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    router.post('/api/registrati', async (req, res) => {
        log('DEBUG', `New registration for '${instanceName}'`, { body: req.body });
        const {
            user_id, nome, cognome, email, cellulare, data_nascita, 
            via_e_numero_civico, cap, citta, provincia, indirizzo, 
            codice_fiscale, luogo_nascita, cittadinanza, esigenze_alimentari, evento,
            camera_singola, camera_doppia, camera_tripla, camera_quadrupla,
            costo_totale_gruppo,
            ospiti,
            tipo_fatturazione,
            fatturazione_aziendale,
            dati_fatturazione,
            agente
        } = req.body;

        try {
            // Check if user_id already exists
            const existingUserResult = await pool.query(
                "SELECT id FROM registrazioni WHERE user_id = $1", 
                [user_id]
            );
            
            if (existingUserResult.rows.length > 0) {
                log('WARN', `Duplicate user_id '${user_id}' for '${instanceName}'`);
                return res.status(400).json({ 
                    success: false, 
                    error: 'User ID already exists' 
                });
            }


            // Begin transaction
            const client = await pool.connect();
            
            try {
                await client.query('BEGIN');

                // Insert main registration
                const mainInsertQuery = `
                    INSERT INTO registrazioni (
                        user_id, nome, cognome, email, cellulare, data_nascita, 
                        via_e_numero_civico, cap, citta, provincia, indirizzo, codice_fiscale,
                        luogo_nascita, cittadinanza, esigenze_alimentari, evento, 
                        camera_singola, camera_doppia, camera_tripla, camera_quadrupla,
                        costo_totale_gruppo, data_iscrizione, fatturazione_aziendale, agente
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
                    RETURNING id
                `;
                
                const mainInsertResult = await client.query(mainInsertQuery, [
                    user_id, nome, cognome, email, cellulare, data_nascita, 
                    via_e_numero_civico, cap, citta, provincia, indirizzo, codice_fiscale,
                    luogo_nascita, cittadinanza, esigenze_alimentari || '', evento, 
                    camera_singola, camera_doppia, camera_tripla, camera_quadrupla,
                    costo_totale_gruppo, new Date().toISOString(), 
                    tipo_fatturazione === 'azienda', agente
                ]);
                
                const registrationId = mainInsertResult.rows[0].id;

                // Insert guests if any
                if (ospiti && ospiti.length > 0) {
                    const ospiteQuery = `
                        INSERT INTO accompagnatori_dettagli (
                            registrazione_id, nome, cognome, data_nascita, indirizzo, codice_fiscale, 
                            luogo_nascita, cittadinanza, email, cellulare, esigenze_alimentari
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    `;
                    
                    for (const ospite of ospiti) {
                        await client.query(ospiteQuery, [
                            registrationId, ospite.nome, ospite.cognome, 
                            ospite.data_nascita, ospite.indirizzo, ospite.codice_fiscale,
                            ospite.luogo_nascita, ospite.cittadinanza,
                            ospite.email || null, ospite.cellulare || null, 
                            ospite.esigenze_alimentari || ''
                        ]);
                    }
                }

                // Insert billing data (both corporate and private)
                if (dati_fatturazione) {
                    if (tipo_fatturazione === 'azienda') {
                        // Corporate billing
                        await client.query(`
                            INSERT INTO dati_fatturazione (
                                registrazione_id, ragione_sociale, partita_iva, codice_fiscale_azienda,
                                indirizzo_sede_legale, sede_via_e_numero_civico, sede_cap, sede_citta,
                                codice_sdi, pec_azienda
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        `, [
                            registrationId, dati_fatturazione.ragione_sociale, dati_fatturazione.partita_iva,
                            dati_fatturazione.codice_fiscale_azienda, dati_fatturazione.indirizzo_sede_legale,
                            dati_fatturazione.sede_via_e_numero_civico, dati_fatturazione.sede_cap, 
                            dati_fatturazione.sede_citta, dati_fatturazione.codice_sdi, dati_fatturazione.pec_azienda
                        ]);
                    } else {
                        // Private billing
                        await client.query(`
                            INSERT INTO dati_fatturazione (
                                registrazione_id, fattura_nome, fattura_cognome, fattura_codice_fiscale,
                                fattura_via_e_numero_civico, fattura_cap, fattura_citta, indirizzo_residenza
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        `, [
                            registrationId, dati_fatturazione.nome, dati_fatturazione.cognome,
                            dati_fatturazione.codice_fiscale, dati_fatturazione.fattura_via_e_numero_civico,
                            dati_fatturazione.fattura_cap, dati_fatturazione.fattura_citta,
                            dati_fatturazione.indirizzo_residenza
                        ]);
                    }
                }

                await client.query('COMMIT');
                
                log('INFO', `Registration successful for '${instanceName}'`, { 
                    user_id, 
                    registrationId,
                    email,
                    evento 
                });

                // Send confirmation email
                try {
                    // Prepare email data with proper billing structure
                    const emailData = {
                        ...req.body,
                        id: registrationId,
                        data_iscrizione: new Date().toISOString(),
                        ospiti: ospiti || []
                    };
                    
                    // Add structured billing data based on billing type
                    if (tipo_fatturazione === 'azienda' && dati_fatturazione) {
                        emailData.dati_fatturazione = {
                            ragione_sociale: dati_fatturazione.ragione_sociale,
                            partita_iva: dati_fatturazione.partita_iva,
                            codice_fiscale_azienda: dati_fatturazione.codice_fiscale_azienda,
                            indirizzo_sede_legale: dati_fatturazione.indirizzo_sede_legale,
                            sede_via_e_numero_civico: dati_fatturazione.sede_via_e_numero_civico,
                            sede_cap: dati_fatturazione.sede_cap,
                            sede_citta: dati_fatturazione.sede_citta,
                            codice_sdi: dati_fatturazione.codice_sdi,
                            pec_azienda: dati_fatturazione.pec_azienda
                        };
                    } else if (tipo_fatturazione === 'privato' && dati_fatturazione) {
                        emailData.dati_fatturazione = {
                            fattura_nome: dati_fatturazione.nome,
                            fattura_cognome: dati_fatturazione.cognome,
                            fattura_codice_fiscale: dati_fatturazione.codice_fiscale,
                            fattura_via_e_numero_civico: dati_fatturazione.fattura_via_e_numero_civico,
                            fattura_cap: dati_fatturazione.fattura_cap,
                            fattura_citta: dati_fatturazione.fattura_citta,
                            indirizzo_residenza: dati_fatturazione.indirizzo_residenza
                        };
                    }

                    const emailContent = generateSummaryHTML(emailData);

                    await sendMail(email, `Conferma Iscrizione - ${evento}`, emailContent);

                    log('INFO', `Confirmation email sent for '${instanceName}'`, { email, evento });
                } catch (emailError) {
                    log('WARN', `Failed to send confirmation email for '${instanceName}'`, { 
                        error: emailError.message, 
                        email, 
                        evento 
                    });
                    // Don't fail the registration if email fails
                }

                res.json({ 
                    success: true, 
                    message: 'Registrazione completata con successo!',
                    id: registrationId,
                    email
                });

            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

        } catch (error) {
            log('ERROR', `Registration failed for '${instanceName}'`, { 
                error: error.message, 
                user_id, 
                email, 
                evento 
            });
            res.status(500).json({ 
                success: false, 
                error: 'Registration failed' 
            });
        }
    });

    router.get('/admin/dashboard', (req, res) => {
        res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
    });

    router.post('/admin/login', async (req, res) => {
        const { username, password } = req.body;
        
        // Simple authentication - you might want to enhance this
        if (username === 'admin' && password === 'admin123') {
            res.json({ success: true, message: 'Login successful' });
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    });

    // Add the route that admin dashboard expects
    router.get('/api/registrations', async (req, res) => {
        try {
            const query = `
                SELECT 
                    r.id, r.nome, r.cognome, r.email, r.cellulare, r.data_nascita, 
                    r.via_e_numero_civico, r.cap, r.citta, r.provincia, r.indirizzo, 
                    r.codice_fiscale, r.luogo_nascita, r.cittadinanza, r.esigenze_alimentari, r.evento, 
                    r.camera_singola, r.camera_doppia, r.camera_tripla, r.camera_quadrupla,
                    r.costo_totale_gruppo, r.data_iscrizione, r.fatturazione_aziendale, r.agente,
                    'Capogruppo' as tipo_persona, r.id as registrazione_id,
                    df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
                    df.indirizzo_sede_legale, df.sede_via_e_numero_civico, df.sede_cap, df.sede_citta,
                    df.codice_sdi, df.pec_azienda,
                    df.fattura_nome, df.fattura_cognome, df.fattura_codice_fiscale,
                    df.fattura_via_e_numero_civico, df.fattura_cap, df.fattura_citta, df.indirizzo_residenza
                FROM registrazioni r
                LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
                
                UNION ALL
                
                SELECT 
                    ad.id, ad.nome, ad.cognome, ad.email, ad.cellulare, 
                    ad.data_nascita, NULL as via_e_numero_civico, NULL as cap, NULL as citta, NULL as provincia,
                    ad.indirizzo, ad.codice_fiscale, ad.luogo_nascita, ad.cittadinanza, ad.esigenze_alimentari,
                    r.evento,
                    0 as camera_singola, 0 as camera_doppia, 0 as camera_tripla, 0 as camera_quadrupla,
                    0 as costo_totale_gruppo, NULL as data_iscrizione, false as fatturazione_aziendale, NULL as agente,
                    'Ospite' as tipo_persona, ad.registrazione_id,
                    NULL as ragione_sociale, NULL as partita_iva, NULL as codice_fiscale_azienda,
                    NULL as indirizzo_sede_legale, NULL as sede_via_e_numero_civico, NULL as sede_cap, NULL as sede_citta,
                    NULL as codice_sdi, NULL as pec_azienda,
                    NULL as fattura_nome, NULL as fattura_cognome, NULL as fattura_codice_fiscale,
                    NULL as fattura_via_e_numero_civico, NULL as fattura_cap, NULL as fattura_citta, NULL as indirizzo_residenza
                FROM accompagnatori_dettagli ad
                JOIN registrazioni r ON ad.registrazione_id = r.id
                
                ORDER BY registrazione_id, tipo_persona DESC
            `;
            
            const result = await pool.query(query);
            res.json(result.rows);

        } catch (error) {
            log('ERROR', `Failed to fetch registrations for '${instanceName}'`, { error: error.message });
            res.status(500).json({ error: 'Failed to fetch registrations' });
        }
    });

            // Add the export route that admin dashboard expects
        router.get('/api/export', async (req, res) => {
            try {
                const registrationQuery = `
                    SELECT 
                        r.*, 
                        COUNT(a.id) as num_accompagnatori,
                        df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
                        df.indirizzo_sede_legale, df.sede_via_e_numero_civico, df.sede_cap, df.sede_citta,
                        df.codice_sdi, df.pec_azienda,
                        df.fattura_nome, df.fattura_cognome, df.fattura_codice_fiscale,
                        df.fattura_via_e_numero_civico, df.fattura_cap, df.fattura_citta, df.indirizzo_residenza
                    FROM registrazioni r
                    LEFT JOIN accompagnatori_dettagli a ON r.id = a.registrazione_id
                    LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
                    GROUP BY r.id, df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
                             df.indirizzo_sede_legale, df.sede_via_e_numero_civico, df.sede_cap, df.sede_citta,
                             df.codice_sdi, df.pec_azienda,
                             df.fattura_nome, df.fattura_cognome, df.fattura_codice_fiscale,
                             df.fattura_via_e_numero_civico, df.fattura_cap, df.fattura_citta, df.indirizzo_residenza
                    ORDER BY r.data_iscrizione DESC
                `;
                
                const registrationsResult = await pool.query(registrationQuery);
                const registrations = registrationsResult.rows;

                const guestsQuery = `
                    SELECT registrazione_id, nome, cognome, data_nascita, codice_fiscale, indirizzo,
                           luogo_nascita, cittadinanza, email, cellulare, esigenze_alimentari
                    FROM accompagnatori_dettagli
                    ORDER BY registrazione_id, id
                `;
            
            const guestsResult = await pool.query(guestsQuery);
            const guests = guestsResult.rows;

            // Group guests by registration_id
            const guestsByRegistration = guests.reduce((acc, guest) => {
                if (!acc[guest.registrazione_id]) {
                    acc[guest.registrazione_id] = [];
                }
                acc[guest.registrazione_id].push(guest);
                return acc;
            }, {});

            // Generate CSV content
            let csvContent = 'ID,User ID,Nome,Cognome,Email,Cellulare,Data Nascita,Via e Numero,CAP,Città,Provincia,Indirizzo,Codice Fiscale,Luogo Nascita,Cittadinanza,Esigenze Alimentari,Camera Singola,Camera Doppia,Camera Tripla,Camera Quadrupla,Costo Totale,Evento,Data Iscrizione,Agente,Fatturazione Aziendale,Ragione Sociale,Partita IVA,Codice Fiscale Azienda,Indirizzo Sede Legale,Codice SDI,PEC Azienda,Fattura Nome,Fattura Cognome,Fattura CF,Fattura Indirizzo,Numero Accompagnatori,Accompagnatori\n';

            registrations.forEach(reg => {
                const ospiti = guestsByRegistration[reg.id] || [];
                const ospitiString = ospiti.map(o => `${o.nome} ${o.cognome}`).join('; ');
                
                const row = [
                    reg.id,
                    reg.user_id,
                    `"${reg.nome}"`,
                    `"${reg.cognome}"`,
                    `"${reg.email}"`,
                    `"${reg.cellulare}"`,
                    `"${reg.data_nascita}"`,
                    `"${reg.via_e_numero_civico || ''}"`,
                    `"${reg.cap || ''}"`,
                    `"${reg.citta || ''}"`,
                    `"${reg.provincia || ''}"`,
                    `"${reg.indirizzo || ''}"`,
                    `"${reg.codice_fiscale}"`,
                    `"${reg.luogo_nascita || ''}"`,
                    `"${reg.cittadinanza || ''}"`,
                    `"${reg.esigenze_alimentari || ''}"`,
                    reg.camera_singola,
                    reg.camera_doppia,
                    reg.camera_tripla,
                    reg.camera_quadrupla,
                    reg.costo_totale_gruppo,
                    `"${reg.evento}"`,
                    reg.data_iscrizione,
                    `"${reg.agente || ''}"`,
                    reg.fatturazione_aziendale ? 'Sì' : 'No',
                    `"${reg.ragione_sociale || ''}"`,
                    `"${reg.partita_iva || ''}"`,
                    `"${reg.codice_fiscale_azienda || ''}"`,
                    `"${reg.indirizzo_sede_legale || ''}"`,
                    `"${reg.codice_sdi || ''}"`,
                    `"${reg.pec_azienda || ''}"`,
                    `"${reg.fattura_nome || ''}"`,
                    `"${reg.fattura_cognome || ''}"`,
                    `"${reg.fattura_codice_fiscale || ''}"`,
                    `"${reg.fattura_via_e_numero_civico || ''} ${reg.fattura_cap || ''} ${reg.fattura_citta || ''}"`,
                    reg.num_accompagnatori,
                    `"${ospitiString}"`
                ].join(',');
                
                csvContent += row + '\n';
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="registrazioni-${instanceName}-${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csvContent);

        } catch (error) {
            log('ERROR', `Failed to export CSV for '${instanceName}'`, { 
                error: error.message 
            });
            res.status(500).json({ 
                success: false, 
                error: 'Failed to export CSV' 
            });
        }
    });

    router.get('/api/admin/registrations', async (req, res) => {
        try {
            const registrationQuery = `
                SELECT 
                    r.*, 
                    COUNT(a.id) as num_accompagnatori,
                    df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
                    df.indirizzo_sede_legale, df.sede_via_e_numero_civico, df.sede_cap, df.sede_citta,
                    df.codice_sdi, df.pec_azienda,
                    df.fattura_nome, df.fattura_cognome, df.fattura_codice_fiscale,
                    df.fattura_via_e_numero_civico, df.fattura_cap, df.fattura_citta, df.indirizzo_residenza
                FROM registrazioni r
                LEFT JOIN accompagnatori_dettagli a ON r.id = a.registrazione_id
                LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
                GROUP BY r.id, df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
                         df.indirizzo_sede_legale, df.sede_via_e_numero_civico, df.sede_cap, df.sede_citta,
                         df.codice_sdi, df.pec_azienda,
                         df.fattura_nome, df.fattura_cognome, df.fattura_codice_fiscale,
                         df.fattura_via_e_numero_civico, df.fattura_cap, df.fattura_citta, df.indirizzo_residenza
                ORDER BY r.data_iscrizione DESC
            `;
            
            const registrationsResult = await pool.query(registrationQuery);
            const registrations = registrationsResult.rows;

            // Get guests for each registration
            const guestsQuery = `
                SELECT registrazione_id, nome, cognome, data_nascita, codice_fiscale, indirizzo,
                       luogo_nascita, cittadinanza, email, cellulare, esigenze_alimentari
                FROM accompagnatori_dettagli
                ORDER BY registrazione_id, id
            `;
            
            const guestsResult = await pool.query(guestsQuery);
            const guests = guestsResult.rows;

            // Group guests by registration_id
            const guestsByRegistration = guests.reduce((acc, guest) => {
                if (!acc[guest.registrazione_id]) {
                    acc[guest.registrazione_id] = [];
                }
                acc[guest.registrazione_id].push(guest);
                return acc;
            }, {});

            // Attach guests to registrations
            const registrationsWithGuests = registrations.map(reg => ({
                ...reg,
                ospiti: guestsByRegistration[reg.id] || []
            }));

            res.json({ 
                success: true, 
                registrations: registrationsWithGuests 
            });

        } catch (error) {
            log('ERROR', `Failed to fetch registrations for admin dashboard '${instanceName}'`, { 
                error: error.message 
            });
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch registrations' 
            });
        }
    });

    router.get('/api/admin/export-csv', async (req, res) => {
        try {
            const registrationQuery = `
                SELECT 
                    r.*, 
                    COUNT(a.id) as num_accompagnatori,
                    df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
                    df.indirizzo_sede_legale, df.sede_via_e_numero_civico, df.sede_cap, df.sede_citta,
                    df.codice_sdi, df.pec_azienda,
                    df.fattura_nome, df.fattura_cognome, df.fattura_codice_fiscale,
                    df.fattura_via_e_numero_civico, df.fattura_cap, df.fattura_citta, df.indirizzo_residenza
                FROM registrazioni r
                LEFT JOIN accompagnatori_dettagli a ON r.id = a.registrazione_id
                LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
                GROUP BY r.id, df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
                         df.indirizzo_sede_legale, df.sede_via_e_numero_civico, df.sede_cap, df.sede_citta,
                         df.codice_sdi, df.pec_azienda,
                         df.fattura_nome, df.fattura_cognome, df.fattura_codice_fiscale,
                         df.fattura_via_e_numero_civico, df.fattura_cap, df.fattura_citta, df.indirizzo_residenza
                ORDER BY r.data_iscrizione DESC
            `;
            
            const registrationsResult = await pool.query(registrationQuery);
            const registrations = registrationsResult.rows;

            const guestsQuery = `
                SELECT registrazione_id, nome, cognome, data_nascita, codice_fiscale, indirizzo, 
                       luogo_nascita, cittadinanza, email, cellulare, esigenze_alimentari
                FROM accompagnatori_dettagli
                ORDER BY registrazione_id, id
            `;
            
            const guestsResult = await pool.query(guestsQuery);
            const guests = guestsResult.rows;

            // Group guests by registration_id
            const guestsByRegistration = guests.reduce((acc, guest) => {
                if (!acc[guest.registrazione_id]) {
                    acc[guest.registrazione_id] = [];
                }
                acc[guest.registrazione_id].push(guest);
                return acc;
            }, {});

            // Generate CSV content
            let csvContent = 'ID,User ID,Nome,Cognome,Email,Cellulare,Data Nascita,Via e Numero,CAP,Città,Provincia,Indirizzo,Codice Fiscale,Luogo Nascita,Cittadinanza,Esigenze Alimentari,Camera Singola,Camera Doppia,Camera Tripla,Camera Quadrupla,Costo Totale,Evento,Data Iscrizione,Agente,Fatturazione Aziendale,Ragione Sociale,Partita IVA,Codice Fiscale Azienda,Indirizzo Sede Legale,Codice SDI,PEC Azienda,Fattura Nome,Fattura Cognome,Fattura CF,Fattura Indirizzo,Numero Accompagnatori,Accompagnatori\n';

            registrations.forEach(reg => {
                const ospiti = guestsByRegistration[reg.id] || [];
                const ospitiString = ospiti.map(o => `${o.nome} ${o.cognome}`).join('; ');
                
                const row = [
                    reg.id,
                    reg.user_id,
                    `"${reg.nome}"`,
                    `"${reg.cognome}"`,
                    `"${reg.email}"`,
                    `"${reg.cellulare}"`,
                    `"${reg.data_nascita}"`,
                    `"${reg.via_e_numero_civico || ''}"`,
                    `"${reg.cap || ''}"`,
                    `"${reg.citta || ''}"`,
                    `"${reg.provincia || ''}"`,
                    `"${reg.indirizzo || ''}"`,
                    `"${reg.codice_fiscale}"`,
                    `"${reg.luogo_nascita || ''}"`,
                    `"${reg.cittadinanza || ''}"`,
                    `"${reg.esigenze_alimentari || ''}"`,
                    reg.camera_singola,
                    reg.camera_doppia,
                    reg.camera_tripla,
                    reg.camera_quadrupla,
                    reg.costo_totale_gruppo,
                    `"${reg.evento}"`,
                    reg.data_iscrizione,
                    `"${reg.agente || ''}"`,
                    reg.fatturazione_aziendale ? 'Sì' : 'No',
                    `"${reg.ragione_sociale || ''}"`,
                    `"${reg.partita_iva || ''}"`,
                    `"${reg.codice_fiscale_azienda || ''}"`,
                    `"${reg.indirizzo_sede_legale || ''}"`,
                    `"${reg.codice_sdi || ''}"`,
                    `"${reg.pec_azienda || ''}"`,
                    `"${reg.fattura_nome || ''}"`,
                    `"${reg.fattura_cognome || ''}"`,
                    `"${reg.fattura_codice_fiscale || ''}"`,
                    `"${reg.fattura_via_e_numero_civico || ''} ${reg.fattura_cap || ''} ${reg.fattura_citta || ''}"`,
                    reg.num_accompagnatori,
                    `"${ospitiString}"`
                ].join(',');
                
                csvContent += row + '\n';
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="registrazioni-${instanceName}-${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csvContent);

        } catch (error) {
            log('ERROR', `Failed to export CSV for '${instanceName}'`, { 
                error: error.message 
            });
            res.status(500).json({ 
                success: false, 
                error: 'Failed to export CSV' 
            });
        }
    });

    router.delete('/api/admin/clear-data', async (req, res) => {
        try {
            // Drop and recreate tables
            await pool.query(`DROP TABLE IF EXISTS dati_fatturazione CASCADE`);
            await pool.query(`DROP TABLE IF EXISTS accompagnatori_dettagli CASCADE`);
            await pool.query(`DROP TABLE IF EXISTS registrazioni CASCADE`);
            
            log('INFO', `Tables dropped for '${instanceName}'`);
            
            // Recreate tables
            await createTables(pool, instanceName);
            
            res.json({ success: true, message: 'I dati del database sono stati eliminati con successo.' });
        } catch (error) {
            log('ERROR', `Failed to clear data for '${instanceName}'`, { 
                error: error.message 
            });
            res.status(500).json({ 
                success: false, 
                error: 'Failed to clear data' 
            });
        }
    });

    // Success page route
    router.get('/success', (req, res) => {
        res.sendFile(path.join(__dirname, 'success.html'));
    });

    // --- Admin routes for the instance ---

    router.get('/admin', (req, res) => {
        const password = req.query.password;
        if (password !== process.env.ADMIN_PASSWORD) {
            if (password) log('WARN', `Failed admin login for '${instanceName}'`);
            res.sendFile(path.join(__dirname, 'admin-login.html'));
        } else {
            log('INFO', `Successful admin login for '${instanceName}'`);
            res.sendFile(path.join(__dirname, 'admin-dashboard.html')); // Adjusted path
        }
    });

    router.post('/api/admin/delete-database', (req, res) => {
        const { password } = req.body;
        log('INFO', `Request to clear DB for '${instanceName}'`);

        if (password !== process.env.ADMIN_PASSWORD) {
            log('WARN', `Failed DB clear attempt for '${instanceName}': Wrong password`);
            return res.status(401).json({ success: false, error: 'Password errata.' });
        }

        pool.query('DROP TABLE IF EXISTS dati_fatturazione CASCADE', (err) => {
            if (err) {
                log('ERROR', `Failed to drop dati_fatturazione table for '${instanceName}'`, { error: err.message });
                return res.status(500).json({ success: false, error: 'Database error' });
            }
            
            pool.query('DROP TABLE IF EXISTS accompagnatori_dettagli CASCADE', (err) => {
                if (err) {
                    log('ERROR', `Failed to drop accompagnatori_dettagli table for '${instanceName}'`, { error: err.message });
                    return res.status(500).json({ success: false, error: 'Database error' });
                }
                
                pool.query('DROP TABLE IF EXISTS registrazioni CASCADE', (err) => {
                    if (err) {
                        log('ERROR', `Failed to drop registrazioni table for '${instanceName}'`, { error: err.message });
                        return res.status(500).json({ success: false, error: 'Database error' });
                    }
                    
                    log('INFO', `Tables dropped for '${instanceName}'`);
                    createTables(pool, instanceName);
                    res.json({ success: true, message: 'I dati del database sono stati eliminati con successo.' });
                });
            });
        });
    });

    return router;
};

