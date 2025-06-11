// server.js
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const log = require('./utils/logger'); // Import the new logger

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// DB setup
const db = new sqlite3.Database('./database.sqlite');
const createTables = () => {
db.serialize(() => {
    // Using CREATE TABLE IF NOT EXISTS is idempotent and the simplest way to ensure tables exist.
  db.run(`CREATE TABLE IF NOT EXISTS registrazioni (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    cognome TEXT,
    email TEXT,
    cellulare TEXT,
    data_nascita TEXT,
    indirizzo TEXT,
    codice_fiscale TEXT,
    partenza TEXT, 
      camera_singola INTEGER DEFAULT 0,
      camera_doppia INTEGER DEFAULT 0,
      camera_tripla INTEGER DEFAULT 0,
      camera_quadrupla INTEGER DEFAULT 0,
      costo_totale_gruppo REAL,
    evento TEXT,
    data_iscrizione TEXT,
      fatturazione_aziendale BOOLEAN DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS accompagnatori_dettagli (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    registrazione_id INTEGER,
    nome TEXT,
    cognome TEXT,
    data_nascita TEXT,
    indirizzo TEXT,
    codice_fiscale TEXT,
      FOREIGN KEY(registrazione_id) REFERENCES registrazioni(id) ON DELETE CASCADE
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS dati_fatturazione (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    registrazione_id INTEGER,
    ragione_sociale TEXT,
    partita_iva TEXT,
    codice_fiscale_azienda TEXT,
    indirizzo_sede_legale TEXT,
    codice_sdi TEXT,
    pec_azienda TEXT,
      FOREIGN KEY(registrazione_id) REFERENCES registrazioni(id) ON DELETE CASCADE
    )`);
    log('SYSTEM', 'Database tables ready.');
    });
  };

// Initial table creation
createTables();

app.get('/api/config', (req, res) => {
  log('DEBUG', 'Request for config received');
  res.json({
    calculationDate: process.env.CALCULATION_DATE
  });
});

// POST: salva iscrizione con nuova struttura dati
app.post('/api/registrati', (req, res) => {
  log('DEBUG', 'Received new registration request', { body: req.body });
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
    log('WARN', 'Registration validation failed: Missing required fields.', { body: req.body });
    return res.status(400).json({ error: 'Campi capogruppo, viaggio o costi mancanti o incompleti.' });
  }
  if (fatturazione_aziendale && (!dati_fatturazione || !dati_fatturazione.ragione_sociale || !dati_fatturazione.partita_iva || !dati_fatturazione.indirizzo_sede_legale)) {
    log('WARN', 'Registration validation failed: Incomplete company billing data.', { body: req.body });
    return res.status(400).json({ error: 'Dati fatturazione aziendale incompleti.' });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION", (beginErr) => {
      if (beginErr) {
        log('ERROR', 'Transaction begin error', { error: beginErr.message });
        return res.status(500).json({ error: 'Errore avvio transazione.' });
      }

      let registrazioneId;
      let operationsPending = 1; // Main registration insert
      if (ospiti && ospiti.length > 0) {
        operationsPending += ospiti.length;
      }
      if (fatturazione_aziendale && dati_fatturazione) {
        operationsPending++;
      }

      const completeOperation = (errOccurred = false, opErrorMessage = 'Errore durante operazione database.', errorDetail = {}) => {
        if (errOccurred && operationsPending > -1) {
          operationsPending = -1;
          db.run("ROLLBACK", (rbErr) => {
            if (rbErr) log('ERROR', 'Transaction ROLLBACK error after operation failure', { error: rbErr.message });
          });
          log('ERROR', opErrorMessage, errorDetail);
          if (!res.headersSent) res.status(500).json({ error: opErrorMessage });
          return;
        }

      if (operationsPending === 0) {
        db.run("COMMIT", (commitErr) => {
          if (commitErr) {
              log('ERROR', 'Transaction COMMIT error', { error: commitErr.message });
              db.run("ROLLBACK"); 
              if (!res.headersSent) res.status(500).json({ error: 'Errore finalizzazione transazione.' });
            } else {
              log('INFO', 'Transaction committed successfully', { registrationId: registrazioneId });
              if (!res.headersSent) res.json({ success: true, id: registrazioneId });
          }
        });
      }
    };

      const mainInsertStmt = db.prepare(`
        INSERT INTO registrazioni (
          nome, cognome, email, cellulare, data_nascita, indirizzo, codice_fiscale,
          partenza, camera_singola, camera_doppia, camera_tripla, camera_quadrupla,
          costo_totale_gruppo, evento, fatturazione_aziendale,
          data_iscrizione
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      mainInsertStmt.run(
        nome, cognome, email, cellulare, data_nascita, indirizzo, codice_fiscale,
        partenza, camera_singola || 0, camera_doppia || 0, camera_tripla || 0, camera_quadrupla || 0,
        costo_totale_gruppo, evento, fatturazione_aziendale,
        data_iscrizione_iso,
        function (mainErr) {
          mainInsertStmt.finalize();
          if (mainErr) {
            return completeOperation(true, `Errore salvataggio dati principali`, { error: mainErr.message });
          }
          registrazioneId = this.lastID;
          operationsPending--;
          
          if (operationsPending < 0) return;

          // Insert all guests into accompagnatori_dettagli
          if (ospiti && ospiti.length > 0) {
            const ospiteStmt = db.prepare(`
              INSERT INTO accompagnatori_dettagli (
                registrazione_id, nome, cognome, data_nascita, indirizzo, codice_fiscale
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
            ospiti.forEach(ospite => {
              if (operationsPending < 0) return;
              ospiteStmt.run(
          registrazioneId, ospite.nome, ospite.cognome, ospite.data_nascita, 
                ospite.indirizzo, ospite.codice_fiscale,
                function (guestErr) {
                  if (operationsPending < 0) return;
                  if (guestErr) {
                    ospiteStmt.finalize();
                    return completeOperation(true, `Errore salvataggio ospite`, { error: guestErr.message, guestData: ospite });
                  }
                  operationsPending--;
                  completeOperation();
                }
        );
      });
            ospiteStmt.finalize(); // Finalize after loop if no errors within loop caused early finalization
    }
    
    // Insert billing data if provided
    if (fatturazione_aziendale && dati_fatturazione) {
            if (operationsPending < 0) return;
            db.run(`INSERT INTO dati_fatturazione (
                      registrazione_id, ragione_sociale, partita_iva, codice_fiscale_azienda,
                      indirizzo_sede_legale, codice_sdi, pec_azienda
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [registrazioneId, dati_fatturazione.ragione_sociale, dati_fatturazione.partita_iva,
               dati_fatturazione.codice_fiscale_azienda, dati_fatturazione.indirizzo_sede_legale,
               dati_fatturazione.codice_sdi, dati_fatturazione.pec_azienda],
              function (billingErr) {
                if (operationsPending < 0) return;
        if (billingErr) {
                  return completeOperation(true, `Errore salvataggio dati fatturazione`, { error: billingErr.message });
        }
        operationsPending--;
                completeOperation();
              }
            );
    }
          completeOperation(); // Call in case no optional inserts were pending or all were skipped
        }
      );
    });
  });
});

// GET: esporta CSV con nuova struttura
app.get('/api/export', (req, res) => {
  log('DEBUG', 'Received request to export CSV');
  const query = `
    SELECT 
      r.id AS registrazione_id,
      r.evento,
      strftime('%Y-%m-%d %H:%M:%S', r.data_iscrizione) AS data_registrazione,
      r.nome AS nome,
      r.cognome AS cognome,
      r.email AS email,
      r.cellulare AS cellulare,
      r.data_nascita AS data_nascita,
      r.indirizzo AS indirizzo,
      r.codice_fiscale AS codice_fiscale,
      r.partenza,
      r.camera_singola,
      r.camera_doppia,
      r.camera_tripla,
      r.camera_quadrupla,
      r.costo_totale_gruppo,
      (
        SELECT GROUP_CONCAT(
          IFNULL(replace(g.nome, '''', ''''''), '-') || ' ' || IFNULL(replace(g.cognome, '''', ''''''), '-') || 
          ' (' || IFNULL(g.data_nascita, '-') || ', ' || 
          IFNULL(replace(g.codice_fiscale, '''', ''''''), '-') || ', ' || 
          IFNULL(replace(g.indirizzo, '''', ''''''), '-') || ')',
          ' | '
        )
        FROM accompagnatori_dettagli g WHERE g.registrazione_id = r.id
      ) AS ospiti_dettagli,
      r.fatturazione_aziendale,
      df.ragione_sociale,
      df.partita_iva,
      df.codice_fiscale_azienda,
      df.indirizzo_sede_legale,
      df.codice_sdi,
      df.pec_azienda
    FROM registrazioni r
    LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
    GROUP BY r.id
    ORDER BY r.data_iscrizione DESC
  `;

  db.all(query, (err, rows) => {
    if (err) {
      log('ERROR', 'Database error during CSV export', { error: err.message });
      return res.status(500).json({ error: err.message });
    }
    if (rows.length === 0) {
      log('WARN', 'CSV export requested but no registrations found');
      return res.status(404).json({ error: 'Nessuna registrazione trovata per l\'esportazione' });
    }

    // Defensive copy to prevent object reuse issues from the driver
    const safeRows = rows.map(row => ({...row}));

    const header = Object.keys(safeRows[0]).map(key => {
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }).join(",");

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
    res.attachment('registrazioni_complete.csv'); // Using res.attachment for filename
    res.send(`${header}\n${csvRows.join("\n")}`);
  });
});

// GET: API per ottenere tutte le registrazioni con dettagli per admin dashboard (nuova struttura)
app.get('/api/registrations', (req, res) => {
  log('DEBUG', 'Received request for all registrations for admin dashboard');
  const query = `
    SELECT 
      r.*, 
      strftime('%Y-%m-%d %H:%M:%S', r.data_iscrizione) AS data_iscrizione_ft,
      df.ragione_sociale,
      df.partita_iva,
      df.codice_fiscale_azienda,
      df.indirizzo_sede_legale,
      df.codice_sdi,
      df.pec_azienda,
      (
        SELECT GROUP_CONCAT(
          IFNULL(replace(g.nome, '''', ''''''), '-') || ' ' || IFNULL(replace(g.cognome, '''', ''''''), '-') || 
          ' (' || IFNULL(g.data_nascita, '-') || ', ' || 
          IFNULL(replace(g.codice_fiscale, '''', ''''''), '-') || ', ' || 
          IFNULL(replace(g.indirizzo, '''', ''''''), '-') || ')',
          ' | '
        )
        FROM accompagnatori_dettagli g WHERE g.registrazione_id = r.id
      ) AS ospiti_dettagli
    FROM registrazioni r
    LEFT JOIN dati_fatturazione df ON r.id = df.registrazione_id
    GROUP BY r.id
    ORDER BY r.data_iscrizione DESC
  `;

  db.all(query, (err, rows) => {
    if (err) {
      log('ERROR', 'Database error for admin registrations', { error: err.message });
      return res.status(500).json({ error: err.message });
    }
    // Replace original data_iscrizione with formatted one for easier frontend use
    const processedRows = rows.map(row => ({...row, data_iscrizione: row.data_iscrizione_ft }));
    res.json(processedRows);
  });
});

// GET: admin dashboard
app.get('/admin', (req, res) => {
  const password = req.query.password;
  
  if (password !== process.env.ADMIN_PASSWORD) { 
    if (password) {
      log('WARN', 'Failed admin login attempt', { reason: 'Wrong password' });
      return res.redirect('/admin?error=wrong');
    }
    return res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
  }
  log('INFO', 'Successful admin login');
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// POST: handle database table clearing
app.post('/api/admin/delete-database', (req, res) => {
  const { password } = req.body;
  log('INFO', 'Received request to clear database tables');

  if (password !== process.env.ADMIN_PASSWORD) {
    log('WARN', 'Failed attempt to clear database: Wrong password');
    return res.status(401).json({ success: false, error: 'Password errata.' });
  }

  db.serialize(() => {
    // Drop the tables
    db.run(`DROP TABLE IF EXISTS registrazioni`);
    db.run(`DROP TABLE IF EXISTS accompagnatori_dettagli`);
    db.run(`DROP TABLE IF EXISTS dati_fatturazione`);
    log('INFO', 'All tables dropped successfully');

    // Re-create them immediately
    createTables();

    log('INFO', 'Database tables cleared and re-created successfully');
    res.json({ success: true, message: 'I dati del database sono stati eliminati con successo.' });
  });
});

app.listen(PORT, () => {
  log('SYSTEM', `Server starting up and listening on port ${PORT}`);
});
log('SYSTEM', `Site access: http://localhost:${PORT}`);
log('SYSTEM', `Admin dashboard access: http://localhost:${PORT}/admin`);

// Ensure graceful shutdown
process.on('SIGINT', () => {
  log('SYSTEM', 'SIGINT signal received. Closing database connection.');
  db.close((err) => {
    if (err) {
      log('ERROR', 'Error closing database connection during shutdown', { error: err.message });
      return console.error(err.message);
    }
    log('SYSTEM', 'Database connection closed successfully.');
    process.exit(0);
  });
});
