const express = require('express');
const path = require('path');
const log = require('../../utils/logger'); // Note the path change
const { sendMail } = require('../../utils/mailer');

function createTables(db, instanceName) {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS registrazioni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    router.post('/api/registrati', async (req, res) => {
        log('DEBUG', `New registration for '${instanceName}'`, { body: req.body });
        const {
            nome, cognome, email, cellulare, data_nascita, indirizzo, codice_fiscale,
            partenza, evento,
            camera_singola, camera_doppia, camera_tripla, camera_quadrupla,
            costo_totale_gruppo,
            ospiti,
            fatturazione_aziendale, dati_fatturazione
        } = req.body;

        const data_iscrizione_iso = new Date().toISOString();

        if (!nome || !cognome || !email || !cellulare || !data_nascita || !indirizzo || !codice_fiscale || !partenza || costo_totale_gruppo === undefined) {
            log('WARN', 'Registration validation failed: Missing required fields.', { instance: instanceName, body: req.body });
            return res.status(400).json({ success: false, error: 'Campi capogruppo, viaggio o costi mancanti o incompleti.' });
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
                    nome, cognome, email, cellulare, data_nascita, indirizzo, codice_fiscale,
                    partenza, camera_singola, camera_doppia, camera_tripla, camera_quadrupla,
                    costo_totale_gruppo, evento, fatturazione_aziendale,
                    data_iscrizione
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const registrazioneId = await new Promise((resolve, reject) => {
                mainInsertStmt.run(
                    nome, cognome, email, cellulare, data_nascita, indirizzo, codice_fiscale,
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
        log('DEBUG', `Export CSV for '${instanceName}'`);
        const query = `
    SELECT
      r.id AS registrazione_id, r.evento, strftime('%Y-%m-%d %H:%M:%S', r.data_iscrizione) AS data_registrazione,
      r.nome, r.cognome, r.email, r.cellulare, r.data_nascita, r.indirizzo, r.codice_fiscale, r.partenza,
      r.camera_singola, r.camera_doppia, r.camera_tripla, r.camera_quadrupla, r.costo_totale_gruppo,
      ( SELECT GROUP_CONCAT(
          IFNULL(replace(g.nome, '''', ''''''), '-') || ' ' || IFNULL(replace(g.cognome, '''', ''''''), '-') ||
          ' (' || IFNULL(g.data_nascita, '-') || ', ' || IFNULL(replace(g.codice_fiscale, '''', ''''''), '-') || ', ' ||
          IFNULL(replace(g.indirizzo, '''', ''''''), '-') || ')', ' | '
        ) FROM accompagnatori_dettagli g WHERE g.registrazione_id = r.id
      ) AS ospiti_dettagli,
      r.fatturazione_aziendale, df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda,
      df.indirizzo_sede_legale, df.codice_sdi, df.pec_azienda
    FROM registrazioni r
    LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
    GROUP BY r.id ORDER BY r.data_iscrizione DESC
  `;

        db.all(query, (err, rows) => {
            if (err) {
                log('ERROR', `DB error on CSV export for '${instanceName}'`, { error: err.message });
                return res.status(500).json({ error: err.message });
            }
            if (rows.length === 0) {
                log('WARN', `CSV export for '${instanceName}' - no data.`);
                return res.status(404).json({ error: 'Nessuna registrazione trovata.' });
            }

            const safeRows = rows.map(row => ({ ...row }));
            const header = Object.keys(safeRows[0]).map(key => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(",");
            const csvRows = safeRows.map(row =>
                Object.values(row).map(value => {
                    const stringValue = value === null || value === undefined ? '' : String(value);
                    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
                        return `"${stringValue.replace(/"/g, '""')}"`;
                    }
                    return stringValue;
                }).join(",")
            );

            res.header("Content-Type", "text/csv; charset=utf-8");
            res.attachment(`registrazioni_${instanceName}.csv`);
            res.send(`${header}\n${csvRows.join("\n")}`);
        });
    });

    router.get('/api/registrations', (req, res) => {
        log('DEBUG', `Request for all registrations for '${instanceName}'`);
        const query = `
    SELECT
      r.*, strftime('%Y-%m-%d %H:%M:%S', r.data_iscrizione) AS data_iscrizione_ft,
      df.ragione_sociale, df.partita_iva, df.codice_fiscale_azienda, df.indirizzo_sede_legale,
      df.codice_sdi, df.pec_azienda,
      ( SELECT GROUP_CONCAT(
          IFNULL(replace(g.nome, '''', ''''''), '-') || ' ' || IFNULL(replace(g.cognome, '''', ''''''), '-') ||
          ' (' || IFNULL(g.data_nascita, '-') || ', ' || IFNULL(replace(g.codice_fiscale, '''', ''''''), '-') || ', ' ||
          IFNULL(replace(g.indirizzo, '''', ''''''), '-') || ')', ' | '
        ) FROM accompagnatori_dettagli g WHERE g.registrazione_id = r.id
      ) AS ospiti_dettagli
    FROM registrazioni r
    LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
    GROUP BY r.id ORDER BY r.data_iscrizione DESC
  `;

        db.all(query, (err, rows) => {
            if (err) {
                log('ERROR', `DB error for admin registrations '${instanceName}'`, { error: err.message });
                return res.status(500).json({ error: err.message });
            }
            const processedRows = rows.map(row => ({ ...row, data_iscrizione: row.data_iscrizione_ft }));
            res.json(processedRows);
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