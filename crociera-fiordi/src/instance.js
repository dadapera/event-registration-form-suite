const express = require('express');
const path = require('path');
const fs = require('fs');
const { generateRegistrationPDF } = require('../utils/pdfGenerator');
const log = require('../utils/logger'); // Fixed path for microservices
const { createMailer } = require('../utils/mailer');


async function createTables(pool, instanceName) {
    try {
        // Create registrazioni table
        await pool.query(`CREATE TABLE IF NOT EXISTS registrazioni (
            id SERIAL PRIMARY KEY,
            user_id TEXT UNIQUE,
            nome TEXT, cognome TEXT, email TEXT, cellulare TEXT, data_nascita TEXT,
            indirizzo TEXT, codice_fiscale TEXT, partenza TEXT,
            camera_singola INTEGER DEFAULT 0, camera_doppia INTEGER DEFAULT 0,
            camera_tripla INTEGER DEFAULT 0, camera_quadrupla INTEGER DEFAULT 0,
            costo_totale_gruppo REAL, evento TEXT, data_iscrizione TEXT,
            fatturazione_aziendale BOOLEAN DEFAULT false
        )`);

        // Create accompagnatori_dettagli table
        await pool.query(`CREATE TABLE IF NOT EXISTS accompagnatori_dettagli (
            id SERIAL PRIMARY KEY,
            registrazione_id INTEGER, nome TEXT, cognome TEXT, data_nascita TEXT,
            indirizzo TEXT, codice_fiscale TEXT,
            FOREIGN KEY(registrazione_id) REFERENCES registrazioni(id) ON DELETE CASCADE
        )`);

        // Create dati_fatturazione table
        await pool.query(`CREATE TABLE IF NOT EXISTS dati_fatturazione (
            id SERIAL PRIMARY KEY,
            registrazione_id INTEGER, ragione_sociale TEXT, partita_iva TEXT,
            codice_fiscale_azienda TEXT, indirizzo_sede_legale TEXT,
            codice_sdi TEXT, pec_azienda TEXT,
            FOREIGN KEY(registrazione_id) REFERENCES registrazioni(id) ON DELETE CASCADE
        )`);
        
        log('SYSTEM', `Database tables ready for instance '${instanceName}'.`);
    } catch (error) {
        log('ERROR', `Failed to create tables for instance '${instanceName}': ${error.message}`);
        throw error;
    }
}

// Function to generate PDF summary content
function generateSummaryHTML(registrationData, partenzaText) {
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
                    <p>Data iscrizione: ${registrationData.data_iscrizione}</p>
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
                            <div class="info-value">${registrationData.data_nascita}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Indirizzo</div>
                            <div class="info-value">${registrationData.indirizzo}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Codice Fiscale</div>
                            <div class="info-value">${registrationData.codice_fiscale}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Partenza</div>
                            <div class="info-value">${partenzaText}</div>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Configurazione Camere</div>
                    <div class="grid">
                        <div class="info-item">
                            <div class="info-label">Camera Singola</div>
                            <div class="info-value">${registrationData.camera_singola}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Camera Doppia</div>
                            <div class="info-value">${registrationData.camera_doppia}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Camera Tripla</div>
                            <div class="info-value">${registrationData.camera_tripla}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Camera Quadrupla</div>
                            <div class="info-value">${registrationData.camera_quadrupla}</div>
                        </div>
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
                                    <div class="info-value">${ospite.data_nascita}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Codice Fiscale</div>
                                    <div class="info-value">${ospite.codice_fiscale}</div>
                                </div>
                                <div class="info-item grid-full">
                                    <div class="info-label">Indirizzo</div>
                                    <div class="info-value">${ospite.indirizzo}</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}

                ${registrationData.dati_fatturazione ? `
                <div class="section">
                    <div class="section-title">Dati Fatturazione Aziendale</div>
                    <div class="grid">
                        <div class="info-item">
                            <div class="info-label">Ragione Sociale</div>
                            <div class="info-value">${registrationData.dati_fatturazione.ragione_sociale}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Partita IVA</div>
                            <div class="info-value">${registrationData.dati_fatturazione.partita_iva}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Codice Fiscale Azienda</div>
                            <div class="info-value">${registrationData.dati_fatturazione.codice_fiscale_azienda}</div>
                        </div>
                        <div class="info-item grid-full">
                            <div class="info-label">Indirizzo Sede Legale</div>
                            <div class="info-value">${registrationData.dati_fatturazione.indirizzo_sede_legale}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Codice SDI</div>
                            <div class="info-value">${registrationData.dati_fatturazione.codice_sdi}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">PEC Azienda</div>
                            <div class="info-value">${registrationData.dati_fatturazione.pec_azienda}</div>
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
            calculationDate: process.env.CALCULATION_DATE
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
                SELECT nome, cognome, data_nascita, codice_fiscale, indirizzo
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
            
            // Map partenza to readable text
            const partenzaMapping = {
                'autonomo': 'Arrivo autonomo',
                'fco': 'FCO - Roma Fiumicino',
                'nap': 'NAP - Napoli',
                'bcn': 'BCN - Barcellona',
                'mpx': 'MXP - Malpensa'
            };
            const partenzaText = partenzaMapping[registration.partenza] || registration.partenza;
            
            try {
                // Generate PDF
                const pdfBuffer = await generateRegistrationPDF(registrationData, partenzaText, registration.evento);
                
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
            user_id, nome, cognome, email, cellulare, data_nascita, indirizzo, codice_fiscale,
            partenza, evento,
            camera_singola, camera_doppia, camera_tripla, camera_quadrupla,
            costo_totale_gruppo,
            ospiti,
            fatturazione_aziendale,
            dati_fatturazione
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
                        user_id, nome, cognome, email, cellulare, data_nascita, indirizzo, codice_fiscale,
                        partenza, evento, camera_singola, camera_doppia, camera_tripla, camera_quadrupla,
                        costo_totale_gruppo, data_iscrizione, fatturazione_aziendale
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                    RETURNING id
                `;
                
                const mainInsertResult = await client.query(mainInsertQuery, [
                    user_id, nome, cognome, email, cellulare, data_nascita, indirizzo, codice_fiscale,
                    partenza, evento, camera_singola, camera_doppia, camera_tripla, camera_quadrupla,
                    costo_totale_gruppo, new Date().toISOString(), fatturazione_aziendale
                ]);
                
                const registrationId = mainInsertResult.rows[0].id;

                // Insert guests if any
                if (ospiti && ospiti.length > 0) {
                    const ospiteQuery = `
                        INSERT INTO accompagnatori_dettagli (
                            registrazione_id, nome, cognome, data_nascita, indirizzo, codice_fiscale
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                    `;
                    
                    for (const ospite of ospiti) {
                        await client.query(ospiteQuery, [
                            registrationId, ospite.nome, ospite.cognome, 
                            ospite.data_nascita, ospite.indirizzo, ospite.codice_fiscale
                        ]);
                    }
                }

                // Insert billing data if corporate billing
                if (fatturazione_aziendale && dati_fatturazione) {
                    await client.query(`
                        INSERT INTO dati_fatturazione (
                            registrazione_id, ragione_sociale, partita_iva, codice_fiscale_azienda,
                            indirizzo_sede_legale, codice_sdi, pec_azienda
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [
                        registrationId, dati_fatturazione.ragione_sociale, dati_fatturazione.partita_iva,
                        dati_fatturazione.codice_fiscale_azienda, dati_fatturazione.indirizzo_sede_legale,
                        dati_fatturazione.codice_sdi, dati_fatturazione.pec_azienda
                    ]);
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
                    const emailContent = generateSummaryHTML({
                        ...req.body,
                        id: registrationId,
                        data_iscrizione: new Date().toISOString(),
                        ospiti: ospiti || []
                    }, partenza);

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
                    r.indirizzo, r.codice_fiscale, r.partenza, r.evento, 
                    r.camera_singola, r.camera_doppia, r.camera_tripla, r.camera_quadrupla,
                    r.costo_totale_gruppo, r.data_iscrizione, r.fatturazione_aziendale,
                    'Capogruppo' as tipo_persona, r.id as registrazione_id,
                    df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
                    df.indirizzo_sede_legale, df.codice_sdi, df.pec_azienda
                FROM registrazioni r
                LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
                
                UNION ALL
                
                SELECT 
                    ad.id, ad.nome, ad.cognome, NULL as email, NULL as cellulare, 
                    ad.data_nascita, ad.indirizzo, ad.codice_fiscale, 
                    NULL as partenza, r.evento,
                    0 as camera_singola, 0 as camera_doppia, 0 as camera_tripla, 0 as camera_quadrupla,
                    0 as costo_totale_gruppo, NULL as data_iscrizione, false as fatturazione_aziendale,
                    'Ospite' as tipo_persona, ad.registrazione_id,
                    NULL as ragione_sociale, NULL as partita_iva, NULL as codice_fiscale_azienda,
                    NULL as indirizzo_sede_legale, NULL as codice_sdi, NULL as pec_azienda
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
                    df.indirizzo_sede_legale, df.codice_sdi, df.pec_azienda
                FROM registrazioni r
                LEFT JOIN accompagnatori_dettagli a ON r.id = a.registrazione_id
                LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
                GROUP BY r.id, df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
                         df.indirizzo_sede_legale, df.codice_sdi, df.pec_azienda
                ORDER BY r.data_iscrizione DESC
            `;
            
            const registrationsResult = await pool.query(registrationQuery);
            const registrations = registrationsResult.rows;

            const guestsQuery = `
                SELECT registrazione_id, nome, cognome, data_nascita, codice_fiscale, indirizzo
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
            let csvContent = 'ID,User ID,Nome,Cognome,Email,Cellulare,Data Nascita,Indirizzo,Codice Fiscale,Partenza,Camera Singola,Camera Doppia,Camera Tripla,Camera Quadrupla,Costo Totale,Evento,Data Iscrizione,Fatturazione Aziendale,Ragione Sociale,Partita IVA,Codice Fiscale Azienda,Indirizzo Sede Legale,Codice SDI,PEC Azienda,Numero Accompagnatori,Accompagnatori\n';

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
                    `"${reg.indirizzo}"`,
                    `"${reg.codice_fiscale}"`,
                    reg.partenza,
                    reg.camera_singola,
                    reg.camera_doppia,
                    reg.camera_tripla,
                    reg.camera_quadrupla,
                    reg.costo_totale_gruppo,
                    `"${reg.evento}"`,
                    reg.data_iscrizione,
                    reg.fatturazione_aziendale ? 'Sì' : 'No',
                    `"${reg.ragione_sociale || ''}"`,
                    `"${reg.partita_iva || ''}"`,
                    `"${reg.codice_fiscale_azienda || ''}"`,
                    `"${reg.indirizzo_sede_legale || ''}"`,
                    `"${reg.codice_sdi || ''}"`,
                    `"${reg.pec_azienda || ''}"`,
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
                    df.ragione_sociale, df.partita_iva
                FROM registrazioni r
                LEFT JOIN accompagnatori_dettagli a ON r.id = a.registrazione_id
                LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
                GROUP BY r.id, df.ragione_sociale, df.partita_iva
                ORDER BY r.data_iscrizione DESC
            `;
            
            const registrationsResult = await pool.query(registrationQuery);
            const registrations = registrationsResult.rows;

            // Get guests for each registration
            const guestsQuery = `
                SELECT registrazione_id, nome, cognome, data_nascita, codice_fiscale, indirizzo
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
                    df.indirizzo_sede_legale, df.codice_sdi, df.pec_azienda
                FROM registrazioni r
                LEFT JOIN accompagnatori_dettagli a ON r.id = a.registrazione_id
                LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
                GROUP BY r.id, df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
                         df.indirizzo_sede_legale, df.codice_sdi, df.pec_azienda
                ORDER BY r.data_iscrizione DESC
            `;
            
            const registrationsResult = await pool.query(registrationQuery);
            const registrations = registrationsResult.rows;

            const guestsQuery = `
                SELECT registrazione_id, nome, cognome, data_nascita, codice_fiscale, indirizzo
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
            let csvContent = 'ID,User ID,Nome,Cognome,Email,Cellulare,Data Nascita,Indirizzo,Codice Fiscale,Partenza,Camera Singola,Camera Doppia,Camera Tripla,Camera Quadrupla,Costo Totale,Evento,Data Iscrizione,Fatturazione Aziendale,Ragione Sociale,Partita IVA,Codice Fiscale Azienda,Indirizzo Sede Legale,Codice SDI,PEC Azienda,Numero Accompagnatori,Accompagnatori\n';

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
                    `"${reg.indirizzo}"`,
                    `"${reg.codice_fiscale}"`,
                    reg.partenza,
                    reg.camera_singola,
                    reg.camera_doppia,
                    reg.camera_tripla,
                    reg.camera_quadrupla,
                    reg.costo_totale_gruppo,
                    `"${reg.evento}"`,
                    reg.data_iscrizione,
                    reg.fatturazione_aziendale ? 'Sì' : 'No',
                    `"${reg.ragione_sociale || ''}"`,
                    `"${reg.partita_iva || ''}"`,
                    `"${reg.codice_fiscale_azienda || ''}"`,
                    `"${reg.indirizzo_sede_legale || ''}"`,
                    `"${reg.codice_sdi || ''}"`,
                    `"${reg.pec_azienda || ''}"`,
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

