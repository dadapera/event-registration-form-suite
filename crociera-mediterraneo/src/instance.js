const express = require('express');
const path = require('path');
const fs = require('fs');
const { generateRegistrationPDF } = require('../utils/pdfGenerator');
const log = require('../utils/logger'); // Note the path change
const { createMailer } = require('../utils/mailer');
const { loadInstanceEnvironment } = require('../utils/envLoader');
const { lookupUserData } = require('../utils/csvUtils');

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

module.exports = function(pool, instanceName, config) {
    // Load instance-specific environment variables
    const instancePath = path.join(__dirname, '..'); // Go up to project root for .env files
    const { envVars: formEnvVars, getEnvVar: getFormEnvVar } = loadInstanceEnvironment(instancePath, instanceName);

    // Create instance-specific mailer with form environment variables
    const envConfig = {
        SMTP_HOST: getFormEnvVar('SMTP_HOST'),
        SMTP_PORT: getFormEnvVar('SMTP_PORT'),
        SMTP_USER: getFormEnvVar('SMTP_USER'),
        SMTP_PASS: getFormEnvVar('SMTP_PASS'),
        EMAIL_FROM_NAME: getFormEnvVar('EMAIL_FROM_NAME'),
        EMAIL_FROM_ADDRESS: getFormEnvVar('EMAIL_FROM_ADDRESS')
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
            calculationDate: getFormEnvVar('CALCULATION_DATE')
        });
    });

    router.get('/api/lookup-user/:userId', (req, res) => {
        const userId = req.params.userId;
        log('DEBUG', `Looking up user data for ID ${userId} in instance '${instanceName}'`);
        
        try {
            // Get instance path from the index.html path
            const instancePath = path.dirname(req.instance.indexPath);
            const userData = lookupUserData(userId, instancePath);
            
            if (userData) {
                log('DEBUG', `User data found for ID ${userId}: Scheda ${userData.schedaNumero}, Cliente ${userData.codiceCliente}`);
                res.json({
                    found: true,
                    userData: userData
                });
            } else {
                log('DEBUG', `User ID ${userId} not found in CSV for instance '${instanceName}'`);
                res.json({
                    found: false,
                    error: 'User ID not found'
                });
            }
        } catch (error) {
            log('ERROR', `Error looking up user ${userId}: ${error.message}`);
            res.status(500).json({
                found: false,
                error: 'Internal server error'
            });
        }
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

    router.get('/api/check-user/:userId', async (req, res) => {
        const userId = req.params.userId;
        log('DEBUG', `Checking if user ID ${userId} already exists for instance '${instanceName}'`);

        try {
            const result = await pool.query("SELECT id FROM registrazioni WHERE user_id = $1", [userId]);
            res.json({ exists: result.rows.length > 0 });
        } catch (err) {
            log('ERROR', `Database error checking user ID for '${instanceName}'`, { error: err.message });
            res.status(500).json({ error: 'Errore del database' });
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
            fatturazione_aziendale, dati_fatturazione
        } = req.body;

        const data_iscrizione_iso = new Date().toISOString();

        if (!user_id || !nome || !cognome || !email || !cellulare || !data_nascita || !indirizzo || !codice_fiscale || !partenza || costo_totale_gruppo === undefined) {
            log('WARN', 'Registration validation failed: Missing required fields.', { instance: instanceName, body: req.body });
            return res.status(400).json({ success: false, error: 'Campi capogruppo, viaggio, user ID o costi mancanti o incompleti.' });
        }

        // Check if user_id already exists
        const existingUserResult = await pool.query(
            "SELECT id FROM registrazioni WHERE user_id = $1",
            [user_id]
        );

        if (existingUserResult.rows.length > 0) {
            log('WARN', `Duplicate registration attempt for user_id ${user_id} in '${instanceName}'`);
            return res.status(400).json({ success: false, error: 'Un modulo con questo ID è già stato inviato.' });
        }
        if (fatturazione_aziendale && (!dati_fatturazione || !dati_fatturazione.ragione_sociale || !dati_fatturazione.partita_iva || !dati_fatturazione.indirizzo_sede_legale)) {
            log('WARN', 'Registration validation failed: Incomplete company billing data.', { instance: instanceName, body: req.body });
            return res.status(400).json({ success: false, error: 'Dati fatturazione aziendale incompleti.' });
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
                costo_totale_gruppo, data_iscrizione_iso, fatturazione_aziendale
            ]);

            const registrazioneId = mainInsertResult.rows[0].id;

            // Insert guests if any
            if (ospiti && ospiti.length > 0) {
                const ospiteQuery = `
                    INSERT INTO accompagnatori_dettagli (
                        registrazione_id, nome, cognome, data_nascita, indirizzo, codice_fiscale
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                `;

                for (const ospite of ospiti) {
                    await client.query(ospiteQuery, [
                        registrazioneId, ospite.nome, ospite.cognome,
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
                    registrazioneId, dati_fatturazione.ragione_sociale, dati_fatturazione.partita_iva,
                    dati_fatturazione.codice_fiscale_azienda, dati_fatturazione.indirizzo_sede_legale,
                    dati_fatturazione.codice_sdi, dati_fatturazione.pec_azienda
                ]);
            }

            await client.query('COMMIT');

            log('INFO', `Transaction committed for '${instanceName}'`, { registrationId: registrazioneId });

            // --- Send Confirmation Email ---
            const emailSubject = `Conferma Iscrizione: ${evento}`;
            const summaryHtml = `
                <h1>Grazie per la tua iscrizione, ${nome}!</h1>
                <p>Ecco il riepilogo della tua prenotazione per l'evento: <strong>${evento}</strong></p>
                <h2>Dati del Capogruppo</h2>
                <ul>
                    <li><strong>Nome:</strong> ${nome} ${cognome}</li>
                    <li><strong>Email:</strong> ${email}</li>
                    <li><strong>Cellulare:</strong> ${cellulare}</li>
                    <li><strong>Data di Nascita:</strong> ${new Date(data_nascita).toLocaleDateString('it-IT')}</li>
                    <li><strong>Indirizzo:</strong> ${indirizzo}</li>
                    <li><strong>Codice Fiscale:</strong> ${codice_fiscale}</li>
                    <li><strong>Partenza:</strong> ${partenza}</li>
                </ul>
                <h2>Riepilogo Camere</h2>
                <ul>
                    ${camera_singola > 0 ? `<li>Camera Singola: ${camera_singola}</li>` : ''}
                    ${camera_doppia > 0 ? `<li>Camera Doppia: ${camera_doppia}</li>` : ''}
                    ${camera_tripla > 0 ? `<li>Camera Tripla: ${camera_tripla}</li>` : ''}
                    ${camera_quadrupla > 0 ? `<li>Camera Quadrupla: ${camera_quadrupla}</li>` : ''}
                </ul>
                ${ospiti && ospiti.length > 0 ? `
                <h2>Accompagnatori</h2>
                <ul>
                    ${ospiti.map(o => `<li>${o.nome} ${o.cognome} (${new Date(o.data_nascita).toLocaleDateString('it-IT')})</li>`).join('')}
                </ul>
                ` : ''}
                ${fatturazione_aziendale && dati_fatturazione ? `
                <h2>Dati Fatturazione Aziendale</h2>
                <ul>
                    <li><strong>Ragione Sociale:</strong> ${dati_fatturazione.ragione_sociale}</li>
                    <li><strong>Partita IVA:</strong> ${dati_fatturazione.partita_iva}</li>
                    <li><strong>Codice Fiscale Azienda:</strong> ${dati_fatturazione.codice_fiscale_azienda}</li>
                    <li><strong>Indirizzo Sede Legale:</strong> ${dati_fatturazione.indirizzo_sede_legale}</li>
                    <li><strong>Codice SDI:</strong> ${dati_fatturazione.codice_sdi}</li>
                    <li><strong>PEC:</strong> ${dati_fatturazione.pec_azienda}</li>
                </ul>
                ` : ''}
                <h2>Costo Totale</h2>
                <p><strong>€${costo_totale_gruppo.toFixed(2)}</strong></p>
                <hr>
                <p>Verrai ricontattato a breve per la conferma definitiva.</p>
            `;

            sendMail(email, emailSubject, summaryHtml)
                .catch(err => log('ERROR', 'Email sending threw an unhandled exception.', { error: err.message }));
            // End of email sending

            res.json({ success: true, id: registrazioneId });
        } catch (err) {
            log('ERROR', `Transaction failed for '${instanceName}', rolling back.`, { error: err.message });
            
            // Properly handle rollback with error checking
            try {
                await client.query('ROLLBACK');
                log('DEBUG', `Rollback successful for '${instanceName}'`);
            } catch (rollbackError) {
                log('ERROR', `Rollback error for '${instanceName}': ${rollbackError.message}`);
            } finally {
                client.release();
            }
            
            res.status(500).json({ success: false, error: 'Errore durante il salvataggio dei dati nel database.' });
        }
    });

    router.get('/api/export', async (req, res) => {
        log('DEBUG', `Export CSV for '${instanceName}' with individual rows for each person`);

        try {
            // First get all registrations (capogruppo)
            const registrationQuery = `
                SELECT
                  r.id AS registrazione_id, r.user_id, r.evento,
                  to_char(r.data_iscrizione, 'YYYY-MM-DD HH24:MI:SS') AS data_registrazione,
                  r.nome, r.cognome, r.email, r.cellulare, r.data_nascita, r.indirizzo,
                  r.codice_fiscale, r.partenza, r.camera_singola, r.camera_doppia,
                  r.camera_tripla, r.camera_quadrupla, r.costo_totale_gruppo,
                  r.fatturazione_aziendale, df.ragione_sociale, df.partita_iva,
                  df.codice_fiscale_azienda, df.indirizzo_sede_legale, df.codice_sdi, df.pec_azienda
                FROM registrazioni r
                LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
                ORDER BY r.data_iscrizione DESC
            `;

            const registrationsResult = await pool.query(registrationQuery);
            const registrations = registrationsResult.rows;

            if (registrations.length === 0) {
                log('WARN', `CSV export for '${instanceName}' - no data.`);
                return res.status(404).json({ error: 'Nessuna registrazione trovata.' });
            }

            // Get all guests for all registrations
            const guestsQuery = `
                SELECT registrazione_id, nome, cognome, data_nascita, indirizzo, codice_fiscale
                FROM accompagnatori_dettagli
                ORDER BY registrazione_id, id
            `;

            const guestsResult = await pool.query(guestsQuery);
            const guests = guestsResult.rows;

                // Group guests by registration ID
                const guestsByRegistration = {};
                guests.forEach(guest => {
                    if (!guestsByRegistration[guest.registrazione_id]) {
                        guestsByRegistration[guest.registrazione_id] = [];
                    }
                    guestsByRegistration[guest.registrazione_id].push(guest);
                });

                // Build the CSV rows - each person gets their own row
                const csvRows = [];
                
                registrations.forEach(registration => {
                    // Add capogruppo row
                    const capogruppoRow = {
                        registrazione_id: registration.registrazione_id,
                        user_id: registration.user_id,
                        evento: registration.evento,
                        data_registrazione: registration.data_registrazione,
                        tipo_persona: 'Capogruppo',
                        posizione_gruppo: 1,
                        nome: registration.nome,
                        cognome: registration.cognome,
                        email: registration.email,
                        cellulare: registration.cellulare,
                        data_nascita: registration.data_nascita,
                        indirizzo: registration.indirizzo,
                        codice_fiscale: registration.codice_fiscale,
                        partenza: registration.partenza,
                        camera_singola: registration.camera_singola,
                        camera_doppia: registration.camera_doppia,
                        camera_tripla: registration.camera_tripla,
                        camera_quadrupla: registration.camera_quadrupla,
                        costo_totale_gruppo: registration.costo_totale_gruppo,
                        fatturazione_aziendale: registration.fatturazione_aziendale,
                        ragione_sociale: registration.ragione_sociale,
                        partita_iva: registration.partita_iva,
                        codice_fiscale_azienda: registration.codice_fiscale_azienda,
                        indirizzo_sede_legale: registration.indirizzo_sede_legale,
                        codice_sdi: registration.codice_sdi,
                        pec_azienda: registration.pec_azienda
                    };
                    csvRows.push(capogruppoRow);

                    // Add guest rows
                    const registrationGuests = guestsByRegistration[registration.registrazione_id] || [];
                    registrationGuests.forEach((guest, index) => {
                        const guestRow = {
                            registrazione_id: registration.registrazione_id,
                            user_id: registration.user_id,
                            evento: registration.evento,
                            data_registrazione: registration.data_registrazione,
                            tipo_persona: 'Ospite',
                            posizione_gruppo: index + 2,
                            nome: guest.nome,
                            cognome: guest.cognome,
                            email: '', // Guests don't have separate email/phone
                            cellulare: '',
                            data_nascita: guest.data_nascita,
                            indirizzo: guest.indirizzo,
                            codice_fiscale: guest.codice_fiscale,
                            partenza: registration.partenza, // Same as capogruppo
                            camera_singola: '', // Room details only on capogruppo row
                            camera_doppia: '',
                            camera_tripla: '',
                            camera_quadrupla: '',
                            costo_totale_gruppo: '', // Cost only on capogruppo row
                            fatturazione_aziendale: '', // Billing only on capogruppo row
                            ragione_sociale: '',
                            partita_iva: '',
                            codice_fiscale_azienda: '',
                            indirizzo_sede_legale: '',
                            codice_sdi: '',
                            pec_azienda: ''
                        };
                        csvRows.push(guestRow);
                    });
                });

                // Generate CSV
                if (csvRows.length === 0) {
                    log('WARN', `CSV export for '${instanceName}' - no processed data.`);
                    return res.status(404).json({ error: 'Nessun dato processato.' });
                }

                const header = Object.keys(csvRows[0]).map(key => 
                    key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                ).join(",");

                const csvRowStrings = csvRows.map(row =>
                    Object.values(row).map(value => {
                        const stringValue = value === null || value === undefined ? '' : String(value);
                        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
                            return `"${stringValue.replace(/"/g, '""')}"`;
                        }
                        return stringValue;
                    }).join(",")
                );

                res.header("Content-Type", "text/csv; charset=utf-8");
                res.attachment(`registrazioni_${instanceName}_dettagliate.csv`);
                res.send(`${header}\n${csvRowStrings.join("\n")}`);
                
                log('INFO', `CSV export completed for '${instanceName}': ${csvRows.length} total rows (${registrations.length} registrations)`);

        } catch (error) {
            log('ERROR', `Error in CSV export for '${instanceName}'`, { error: error.message });
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/api/registrations', async (req, res) => {
        log('DEBUG', `Request for all registrations for '${instanceName}' with individual rows`);

        try {
            // Get registrations with expanded person rows for admin dashboard
            const registrationQuery = `
                SELECT
                  r.id AS registrazione_id, r.user_id, r.evento,
                  to_char(r.data_iscrizione, 'YYYY-MM-DD HH24:MI:SS') AS data_iscrizione_ft,
                  r.nome, r.cognome, r.email, r.cellulare, r.data_nascita, r.indirizzo,
                  r.codice_fiscale, r.partenza, r.camera_singola, r.camera_doppia,
                  r.camera_tripla, r.camera_quadrupla, r.costo_totale_gruppo,
                  r.fatturazione_aziendale, df.ragione_sociale, df.partita_iva,
                  df.codice_fiscale_azienda, df.indirizzo_sede_legale, df.codice_sdi, df.pec_azienda
                FROM registrazioni r
                LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
                ORDER BY r.data_iscrizione DESC
            `;

            const registrationsResult = await pool.query(registrationQuery);
            const registrations = registrationsResult.rows;

            // Get all guests for admin dashboard
            const guestsQuery = `
                SELECT registrazione_id, nome, cognome, data_nascita, indirizzo, codice_fiscale
                FROM accompagnatori_dettagli
                ORDER BY registrazione_id, id
            `;

            const guestsResult = await pool.query(guestsQuery);
            const guests = guestsResult.rows;

                // Group guests by registration ID
                const guestsByRegistration = {};
                guests.forEach(guest => {
                    if (!guestsByRegistration[guest.registrazione_id]) {
                        guestsByRegistration[guest.registrazione_id] = [];
                    }
                    guestsByRegistration[guest.registrazione_id].push(guest);
                });

                // Build expanded rows for admin dashboard
                const expandedRows = [];
                
                registrations.forEach(registration => {
                    // Get guest details for this registration
                    const registrationGuests = guestsByRegistration[registration.registrazione_id] || [];
                    
                    // Create ospiti_dettagli string for admin dashboard
                    const ospiti_dettagli = registrationGuests.length > 0 
                        ? registrationGuests.map(guest => `${guest.nome} ${guest.cognome}`).join(' | ')
                        : '';

                    // Add capogruppo row
                    const capogruppoRow = {
                        ...registration,
                        id: registration.registrazione_id, // Fix: Add id field for admin dashboard
                        ospiti_dettagli: ospiti_dettagli, // Fix: Add guest details for admin dashboard
                        tipo_persona: 'Capogruppo',
                        posizione_gruppo: 1,
                        data_iscrizione: registration.data_iscrizione_ft
                    };
                    expandedRows.push(capogruppoRow);

                    // Add guest rows
                    registrationGuests.forEach((guest, index) => {
                        const guestRow = {
                            registrazione_id: registration.registrazione_id,
                            id: registration.registrazione_id, // Fix: Add id field for admin dashboard
                            user_id: registration.user_id,
                            evento: registration.evento,
                            data_iscrizione_ft: registration.data_iscrizione_ft,
                            data_iscrizione: registration.data_iscrizione_ft,
                            ospiti_dettagli: ospiti_dettagli, // Fix: Add guest details for admin dashboard
                            tipo_persona: 'Ospite',
                            posizione_gruppo: index + 2,
                            nome: guest.nome,
                            cognome: guest.cognome,
                            email: '', // Guests don't have separate email/phone
                            cellulare: '',
                            data_nascita: guest.data_nascita,
                            indirizzo: guest.indirizzo,
                            codice_fiscale: guest.codice_fiscale,
                            partenza: registration.partenza, // Same as capogruppo
                            camera_singola: '',
                            camera_doppia: '',
                            camera_tripla: '',
                            camera_quadrupla: '',
                            costo_totale_gruppo: '',
                            fatturazione_aziendale: '',
                            ragione_sociale: '',
                            partita_iva: '',
                            codice_fiscale_azienda: '',
                            indirizzo_sede_legale: '',
                            codice_sdi: '',
                            pec_azienda: ''
                        };
                        expandedRows.push(guestRow);
                    });
                });

                log('INFO', `Admin registrations request completed for '${instanceName}': ${expandedRows.length} total rows (${registrations.length} registrations)`);
                res.json(expandedRows);

        } catch (error) {
            log('ERROR', `Error in admin registrations request for '${instanceName}'`, { error: error.message });
            res.status(500).json({ error: error.message });
        }
    });

    // --- Admin routes for the instance ---

    router.get('/admin', (req, res) => {
        const password = req.query.password;
        if (password !== getFormEnvVar('ADMIN_PASSWORD')) {
            if (password) log('WARN', `Failed admin login for '${instanceName}'`);
            res.sendFile(path.join(__dirname, 'admin-login.html'));
        } else {
            log('INFO', `Successful admin login for '${instanceName}'`);
            res.sendFile(path.join(__dirname, 'admin-dashboard.html')); // Adjusted path
        }
    });

    router.post('/api/admin/delete-database', async (req, res) => {
        const { password } = req.body;
        log('INFO', `Request to clear DB for '${instanceName}'`);

        if (password !== getFormEnvVar('ADMIN_PASSWORD')) {
            log('WARN', `Failed DB clear attempt for '${instanceName}': Wrong password`);
            return res.status(401).json({ success: false, error: 'Password errata.' });
        }

        try {
            await pool.query(`DROP TABLE IF EXISTS dati_fatturazione CASCADE`);
            await pool.query(`DROP TABLE IF EXISTS accompagnatori_dettagli CASCADE`);
            await pool.query(`DROP TABLE IF EXISTS registrazioni CASCADE`);

            log('INFO', `Tables dropped for '${instanceName}'`);

            await createTables(pool, instanceName);
            res.json({ success: true, message: 'I dati del database sono stati eliminati con successo.' });
        } catch (error) {
            log('ERROR', `Failed to clear data for '${instanceName}'`, { error: error.message });
            res.status(500).json({ success: false, error: 'Failed to clear data' });
        }
    });

    return router;
} 