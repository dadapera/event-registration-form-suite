const express = require('express');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const log = require('../../utils/logger'); // Note the path change
const { sendMail } = require('../../utils/mailer');

// CSV parsing and lookup functions
let csvDataCache = null;

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
}

function loadCSVData(instancePath) {
    if (csvDataCache) return csvDataCache; // Return cached data if already loaded
    
    try {
        const csvPath = path.join(instancePath, 'sample_data_with_ids.csv');
        
        if (!fs.existsSync(csvPath)) {
            log('ERROR', `CSV file not found at: ${csvPath}`);
            return null;
        }
        
        const csvText = fs.readFileSync(csvPath, 'utf8');
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) {
            log('ERROR', 'CSV file appears to be empty or has no data rows');
            return null;
        }
        
        const headers = parseCSVLine(lines[0]);
        log('DEBUG', `CSV headers found: ${headers.join(', ')}`);
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) { // Skip empty lines
                const values = parseCSVLine(lines[i]);
                const row = {};
                headers.forEach((header, index) => {
                    row[header.trim()] = values[index] ? values[index].trim() : '';
                });
                data.push(row);
            }
        }
        
        csvDataCache = data; // Cache the data
        log('INFO', `CSV data loaded successfully: ${data.length} rows`);
        return data;
    } catch (error) {
        log('ERROR', `Error loading CSV data: ${error.message}`);
        return null;
    }
}

function lookupUserData(userId, instancePath) {
    const data = loadCSVData(instancePath);
    if (!data) return null;
    
    const user = data.find(row => row['USER_ID'] === userId);
    if (user) {
        return {
            schedaNumero: user['SCHEDA NUMERO'],
            codiceCliente: user['CODICE CLIENTE'],
            email: user['EMAIL'],
            userId: user['USER_ID']
        };
    }
    return null;
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
                .total-cost {
                    font-size: 18px;
                    font-weight: bold;
                    color: #1e40af;
                    margin-top: 15px;
                }
                p {
                    margin: 8px 0;
                    word-wrap: break-word;
                }
                strong {
                    font-weight: 600;
                }
                @media print {
                    body { margin: 0; }
                    .container { box-shadow: none; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Riepilogo Iscrizione</h1>
                    <p>ID Registrazione: ${registrationData.id}</p>
                </div>

                <div class="section">
                    <div class="section-title">Dettagli Evento</div>
                    <p><strong>ID Utente:</strong> ${registrationData.user_id}</p>
                    <p><strong>Evento:</strong> ${registrationData.evento}</p>
                    <p><strong>Aeroporto di Partenza:</strong> ${partenzaText}</p>
                </div>

                <div class="section">
                    <div class="section-title">Dati Capogruppo</div>
                    <div class="grid">
                        <p><strong>Nome:</strong> ${registrationData.nome}</p>
                        <p><strong>Cognome:</strong> ${registrationData.cognome}</p>
                        <p><strong>Data di Nascita:</strong> ${new Date(registrationData.data_nascita).toLocaleDateString('it-IT')}</p>
                        <p><strong>Codice Fiscale:</strong> ${registrationData.codice_fiscale}</p>
                        <p><strong>Email:</strong> ${registrationData.email}</p>
                        <p><strong>Cellulare:</strong> ${registrationData.cellulare}</p>
                    </div>
                    <p><strong>Indirizzo:</strong> ${registrationData.indirizzo}</p>
                </div>

                ${registrationData.ospiti && registrationData.ospiti.length > 0 ? `
                <div class="section">
                    <div class="section-title">Accompagnatori</div>
                    ${registrationData.ospiti.map((ospite, index) => `
                        <div class="guest-block">
                            <div class="guest-title">Ospite ${index + 1}</div>
                            <div class="grid">
                                <p><strong>Nome:</strong> ${ospite.nome}</p>
                                <p><strong>Cognome:</strong> ${ospite.cognome}</p>
                                <p><strong>Data di Nascita:</strong> ${ospite.data_nascita ? new Date(ospite.data_nascita).toLocaleDateString('it-IT') : 'N/D'}</p>
                                <p><strong>Codice Fiscale:</strong> ${ospite.codice_fiscale || 'N/D'}</p>
                            </div>
                            <p><strong>Indirizzo:</strong> ${ospite.indirizzo || 'Non specificato'}</p>
                        </div>
                    `).join('')}
                </div>
                ` : ''}

                ${registrationData.fatturazione_aziendale ? `
                <div class="section">
                    <div class="section-title">Dati Fatturazione Aziendale</div>
                    <p class="grid-full"><strong>Ragione Sociale:</strong> ${registrationData.dati_fatturazione.ragione_sociale}</p>
                    <div class="grid">
                        <p><strong>Partita IVA:</strong> ${registrationData.dati_fatturazione.partita_iva}</p>
                        <p><strong>Codice Fiscale Azienda:</strong> ${registrationData.dati_fatturazione.codice_fiscale_azienda || 'N/D'}</p>
                        <p><strong>Codice SDI:</strong> ${registrationData.dati_fatturazione.codice_sdi || 'N/D'}</p>
                        <p><strong>PEC:</strong> ${registrationData.dati_fatturazione.pec_azienda || 'N/D'}</p>
                    </div>
                    <p><strong>Sede Legale:</strong> ${registrationData.dati_fatturazione.indirizzo_sede_legale}</p>
                </div>
                ` : ''}

                <div class="section">
                    <div class="section-title">Riepilogo Camere e Costi</div>
                    <p><strong>Composizione Camere:</strong> ${
                        Object.entries(registrationData)
                            .filter(([key, value]) => key.startsWith('camera_') && value > 0)
                            .map(([key, value]) => `${value} ${key.replace(/_/g, ' ')}`)
                            .join(', ') || 'N/D'
                    }</p>
                    <div class="total-cost">
                        <strong>Costo Totale: €${registrationData.costo_totale_gruppo.toFixed(2)}</strong>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Function to generate PDF using Puppeteer
async function generateRegistrationPDF(registrationData, partenzaText, eventName) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        const htmlContent = generateSummaryHTML(registrationData, partenzaText);
        
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20px',
                right: '20px',
                bottom: '20px',
                left: '20px'
            }
        });
        
        await browser.close();
        return pdfBuffer;
        
    } catch (error) {
        if (browser) {
            await browser.close();
        }
        throw error;
    }
}

function createTables(db, instanceName) {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS registrazioni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE,
      nome TEXT, cognome TEXT, email TEXT, cellulare TEXT, data_nascita TEXT,
      indirizzo TEXT, codice_fiscale TEXT, partenza TEXT,
      camera_singola INTEGER DEFAULT 0, camera_doppia INTEGER DEFAULT 0,
      camera_tripla INTEGER DEFAULT 0, camera_quadrupla INTEGER DEFAULT 0,
      costo_totale_gruppo REAL, evento TEXT, data_iscrizione TEXT,
      fatturazione_aziendale BOOLEAN DEFAULT 0
    )`);

        db.run(`CREATE TABLE IF NOT EXISTS accompagnatori_dettagli (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registrazione_id INTEGER, nome TEXT, cognome TEXT, data_nascita TEXT,
      indirizzo TEXT, codice_fiscale TEXT,
      FOREIGN KEY(registrazione_id) REFERENCES registrazioni(id) ON DELETE CASCADE
    )`);

        db.run(`CREATE TABLE IF NOT EXISTS dati_fatturazione (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registrazione_id INTEGER, ragione_sociale TEXT, partita_iva TEXT,
      codice_fiscale_azienda TEXT, indirizzo_sede_legale TEXT,
      codice_sdi TEXT, pec_azienda TEXT,
      FOREIGN KEY(registrazione_id) REFERENCES registrazioni(id) ON DELETE CASCADE
    )`);
        log('SYSTEM', `Database tables ready for instance '${instanceName}'.`);
    });
}

module.exports = function(db, instanceName, config) {
    // Ensure tables are created for this instance
    createTables(db, instanceName);

    const router = express.Router();

    // The root of this router is already namespaced with the instance name
    // So, a GET on '/' here corresponds to a GET on '/{instanceName}/'
    router.get('/', (req, res) => {
        res.sendFile(req.instance.indexPath);
    });

    // --- API Routes for the instance ---

    router.get('/api/config', (req, res) => {
        log('DEBUG', `Request for config received for instance '${instanceName}'`);
        res.json({
            calculationDate: process.env.CALCULATION_DATE
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
                WHERE r.id = ?
            `;
            
            db.get(query, [registrationId], async (err, registration) => {
                if (err) {
                    log('ERROR', `DB error getting registration ${registrationId}: ${err.message}`);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                if (!registration) {
                    log('WARN', `Registration ${registrationId} not found for PDF generation`);
                    return res.status(404).json({ error: 'Registration not found' });
                }
                
                // Get guests data
                const guestsQuery = `
                    SELECT nome, cognome, data_nascita, codice_fiscale, indirizzo
                    FROM accompagnatori_dettagli
                    WHERE registrazione_id = ?
                    ORDER BY id
                `;
                
                db.all(guestsQuery, [registrationId], async (err, guests) => {
                    if (err) {
                        log('ERROR', `DB error getting guests for registration ${registrationId}: ${err.message}`);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
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
                });
            });
            
        } catch (error) {
            log('ERROR', `Error in PDF generation endpoint: ${error.message}`);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    router.get('/api/check-user/:userId', (req, res) => {
        const userId = req.params.userId;
        log('DEBUG', `Checking if user ID ${userId} already exists for instance '${instanceName}'`);
        
        db.get("SELECT id FROM registrazioni WHERE user_id = ?", [userId], (err, row) => {
            if (err) {
                log('ERROR', `Database error checking user ID for '${instanceName}'`, { error: err.message });
                return res.status(500).json({ error: 'Errore del database' });
            }
            
            res.json({ exists: !!row });
        });
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
        const existingUser = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM registrazioni WHERE user_id = ?", [user_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existingUser) {
            log('WARN', `Duplicate registration attempt for user_id ${user_id} in '${instanceName}'`);
            return res.status(400).json({ success: false, error: 'Un modulo con questo ID è già stato inviato.' });
        }
        if (fatturazione_aziendale && (!dati_fatturazione || !dati_fatturazione.ragione_sociale || !dati_fatturazione.partita_iva || !dati_fatturazione.indirizzo_sede_legale)) {
            log('WARN', 'Registration validation failed: Incomplete company billing data.', { instance: instanceName, body: req.body });
            return res.status(400).json({ success: false, error: 'Dati fatturazione aziendale incompleti.' });
        }

        try {
            await new Promise((resolve, reject) => {
                db.run("BEGIN TRANSACTION", err => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            const mainInsertStmt = db.prepare(`
                INSERT INTO registrazioni (
                    user_id, nome, cognome, email, cellulare, data_nascita, indirizzo, codice_fiscale,
                    partenza, camera_singola, camera_doppia, camera_tripla, camera_quadrupla,
                    costo_totale_gruppo, evento, fatturazione_aziendale,
                    data_iscrizione
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const registrazioneId = await new Promise((resolve, reject) => {
                mainInsertStmt.run(
                    user_id, nome, cognome, email, cellulare, data_nascita, indirizzo, codice_fiscale,
                    partenza, camera_singola || 0, camera_doppia || 0, camera_tripla || 0, camera_quadrupla || 0,
                    costo_totale_gruppo, evento, fatturazione_aziendale,
                    data_iscrizione_iso,
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            });
            mainInsertStmt.finalize();

            if (ospiti && ospiti.length > 0) {
                const ospiteStmt = db.prepare(`
                    INSERT INTO accompagnatori_dettagli (
                        registrazione_id, nome, cognome, data_nascita, indirizzo, codice_fiscale
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `);
                for (const ospite of ospiti) {
                    await new Promise((resolve, reject) => {
                        ospiteStmt.run(registrazioneId, ospite.nome, ospite.cognome, ospite.data_nascita, ospite.indirizzo, ospite.codice_fiscale, err => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                }
                ospiteStmt.finalize();
            }

            if (fatturazione_aziendale && dati_fatturazione) {
                await new Promise((resolve, reject) => {
                    db.run(`INSERT INTO dati_fatturazione (
                        registrazione_id, ragione_sociale, partita_iva, codice_fiscale_azienda,
                        indirizzo_sede_legale, codice_sdi, pec_azienda
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [registrazioneId, dati_fatturazione.ragione_sociale, dati_fatturazione.partita_iva,
                        dati_fatturazione.codice_fiscale_azienda, dati_fatturazione.indirizzo_sede_legale,
                        dati_fatturazione.codice_sdi, dati_fatturazione.pec_azienda],
                        err => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }

            await new Promise((resolve, reject) => {
                db.run("COMMIT", err => {
                    if (err) reject(err);
                    else resolve();
                });
            });

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
            db.run("ROLLBACK"); // Attempt to rollback
            res.status(500).json({ success: false, error: 'Errore durante il salvataggio dei dati nel database.' });
        }
    });

    router.get('/api/export', (req, res) => {
        log('DEBUG', `Export CSV for '${instanceName}' with individual rows for each person`);
        
        // First get all registrations (capogruppo)
        const registrationQuery = `
            SELECT
              r.id AS registrazione_id, r.user_id, r.evento, 
              strftime('%Y-%m-%d %H:%M:%S', r.data_iscrizione) AS data_registrazione,
              r.nome, r.cognome, r.email, r.cellulare, r.data_nascita, r.indirizzo, 
              r.codice_fiscale, r.partenza, r.camera_singola, r.camera_doppia, 
              r.camera_tripla, r.camera_quadrupla, r.costo_totale_gruppo,
              r.fatturazione_aziendale, df.ragione_sociale, df.partita_iva, 
              df.codice_fiscale_azienda, df.indirizzo_sede_legale, df.codice_sdi, df.pec_azienda
            FROM registrazioni r
            LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
            ORDER BY r.data_iscrizione DESC
        `;

        db.all(registrationQuery, (err, registrations) => {
            if (err) {
                log('ERROR', `DB error on CSV export for '${instanceName}'`, { error: err.message });
                return res.status(500).json({ error: err.message });
            }
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

            db.all(guestsQuery, (err, guests) => {
                if (err) {
                    log('ERROR', `DB error getting guests for CSV export '${instanceName}'`, { error: err.message });
                    return res.status(500).json({ error: err.message });
                }

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
            });
        });
    });

    router.get('/api/registrations', (req, res) => {
        log('DEBUG', `Request for all registrations for '${instanceName}' with individual rows`);
        
        // Get registrations with expanded person rows for admin dashboard
        const registrationQuery = `
            SELECT
              r.id AS registrazione_id, r.user_id, r.evento, 
              strftime('%Y-%m-%d %H:%M:%S', r.data_iscrizione) AS data_iscrizione_ft,
              r.nome, r.cognome, r.email, r.cellulare, r.data_nascita, r.indirizzo, 
              r.codice_fiscale, r.partenza, r.camera_singola, r.camera_doppia, 
              r.camera_tripla, r.camera_quadrupla, r.costo_totale_gruppo,
              r.fatturazione_aziendale, df.ragione_sociale, df.partita_iva, 
              df.codice_fiscale_azienda, df.indirizzo_sede_legale, df.codice_sdi, df.pec_azienda
            FROM registrazioni r
            LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
            ORDER BY r.data_iscrizione DESC
        `;

        db.all(registrationQuery, (err, registrations) => {
            if (err) {
                log('ERROR', `DB error for admin registrations '${instanceName}'`, { error: err.message });
                return res.status(500).json({ error: err.message });
            }

            // Get all guests for admin dashboard
            const guestsQuery = `
                SELECT registrazione_id, nome, cognome, data_nascita, indirizzo, codice_fiscale
                FROM accompagnatori_dettagli
                ORDER BY registrazione_id, id
            `;

            db.all(guestsQuery, (err, guests) => {
                if (err) {
                    log('ERROR', `DB error getting guests for admin dashboard '${instanceName}'`, { error: err.message });
                    return res.status(500).json({ error: err.message });
                }

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
                    // Add capogruppo row
                    const capogruppoRow = {
                        ...registration,
                        tipo_persona: 'Capogruppo',
                        posizione_gruppo: 1,
                        data_iscrizione: registration.data_iscrizione_ft
                    };
                    expandedRows.push(capogruppoRow);

                    // Add guest rows
                    const registrationGuests = guestsByRegistration[registration.registrazione_id] || [];
                    registrationGuests.forEach((guest, index) => {
                        const guestRow = {
                            registrazione_id: registration.registrazione_id,
                            user_id: registration.user_id,
                            evento: registration.evento,
                            data_iscrizione_ft: registration.data_iscrizione_ft,
                            data_iscrizione: registration.data_iscrizione_ft,
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
            });
        });
    });

    // --- Admin routes for the instance ---

    router.get('/admin', (req, res) => {
        const password = req.query.password;
        if (password !== process.env.ADMIN_PASSWORD) {
            if (password) log('WARN', `Failed admin login for '${instanceName}'`);
            res.sendFile(path.join(__dirname, '..', '..', 'public', 'admin-login.html')); // Adjusted path
        } else {
            log('INFO', `Successful admin login for '${instanceName}'`);
            res.sendFile(path.join(__dirname, '..', '..', 'public', 'admin-dashboard.html')); // Adjusted path
        }
    });

    router.post('/api/admin/delete-database', (req, res) => {
        const { password } = req.body;
        log('INFO', `Request to clear DB for '${instanceName}'`);

        if (password !== process.env.ADMIN_PASSWORD) {
            log('WARN', `Failed DB clear attempt for '${instanceName}': Wrong password`);
            return res.status(401).json({ success: false, error: 'Password errata.' });
        }

        db.serialize(() => {
            db.run(`DROP TABLE IF EXISTS registrazioni`);
            db.run(`DROP TABLE IF EXISTS accompagnatori_dettagli`);
            db.run(`DROP TABLE IF EXISTS dati_fatturazione`);
            log('INFO', `Tables dropped for '${instanceName}'`);
            createTables(db, instanceName);
            res.json({ success: true, message: 'I dati del database sono stati eliminati con successo.' });
        });
    });

    return router;
} 