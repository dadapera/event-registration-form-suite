# Maeviaggi - Sistema di Registrazione per Eventi di Viaggio

Un sistema completo per la gestione delle registrazioni ai viaggi organizzati con calcolo dinamico dei prezzi, tracciamento dettagliato degli accompagnatori ed esportazione CSV.

## Caratteristiche

- ✅ **Moduli di registrazione dinamici** con calcolo automatico dei prezzi
- ✅ **Gestione accompagnatori completa** con dati individuali per ogni persona
- ✅ **Database relazionale SQLite** per l'archiviazione persistente dei dati
- ✅ **Calcolo prezzi in tempo reale** basato su:
  - Numero di accompagnatori
  - Città di partenza (con supplementi)
  - Tipo di stanza selezionata
- ✅ **Esportazione CSV** delle registrazioni con dettagli accompagnatori
- ✅ **Dashboard amministratore** protetto da password per la gestione dei dati
- ✅ **Interfaccia moderna** con Tailwind CSS
- ✅ **API RESTful** per integrazioni future
- ✅ **Transazioni database** per integrità dei dati

## Installazione

1. **Clona o scarica il progetto**
   ```bash
   cd maeviaggi
   ```

2. **Installa le dipendenze**
   ```bash
   npm install
   ```

3. **Avvia il server**
   ```bash
   npm start
   ```
   
   Per sviluppo con auto-reload:
   ```bash
   npm run dev
   ```

4. **Accedi all'applicazione**
   - **Modulo di registrazione**: http://localhost:3000
   - **Dashboard admin**: http://localhost:3000/admin (password: 123456)

## Struttura del Progetto

```
maeviaggi/
├── server.js                    # Server Express con API
├── package.json                 # Dipendenze del progetto
├── database.sqlite              # Database SQLite (creato automaticamente)
├── public/
│   ├── index.html              # Modulo di registrazione principale
│   ├── admin-login.html        # Pagina di login amministratore
│   ├── admin-dashboard.html    # Dashboard amministratore
│   ├── assets/                 # Cartella per loghi e immagini
│   └── style.css               # Stili personalizzati (vuoto)
└── README.md                   # Questa documentazione
```

## Gestione Accompagnatori

### Funzionalità Accompagnatori
- **Campi dinamici**: I campi per gli accompagnatori appaiono automaticamente in base al numero selezionato
- **Dati completi**: Nome, cognome, data di nascita e luogo di nascita per ogni accompagnatore
- **Validazione avanzata**:
  - **Codice Fiscale e Provincia**: Convertiti automaticamente in maiuscolo.
  - **Provincia**: Selezionabile da un menu a tendina con ricerca per nome completo e invio della sigla.
  - **CAP**: Limitato a 5 cifre numeriche.
  - Tutti i campi degli accompagnatori sono obbligatori, a meno che non si scelga di usare l'indirizzo del capogruppo.

## API Endpoints

### POST `/api/registrati`
Salva una nuova registrazione con ospiti e dettagli di fatturazione nel database.

**Body (JSON):**
```json
{
  "nome": "Mario",
  "cognome": "Rossi",
  "email": "mario@email.com",
  "cellulare": "3331234567",
  "data_nascita": "1980-01-01",
  "indirizzo": "Via Roma 1, 20100 Milano, MI",
  "codice_fiscale": "RSSMRA80A01H501X",
  "partenza": "mpx",
  "evento": "Crociera sui Fiordi 2025",
  "camera_singola": 0,
  "camera_doppia": 1,
  "camera_tripla": 0,
  "camera_quadrupla": 0,
  "costo_totale_gruppo": 1500.50,
  "ospiti": [
    {
      "nome": "Laura",
      "cognome": "Bianchi",
      "data_nascita": "1982-05-10",
      "codice_fiscale": "BNCLRA82E50H501A",
      "indirizzo": "Via Roma 1, 20100 Milano, MI"
    }
  ],
  "fatturazione_aziendale": true,
  "dati_fatturazione": {
    "ragione_sociale": "Azienda SRL",
    "partita_iva": "12345678901",
    "codice_fiscale_azienda": "12345678901",
    "indirizzo_sede_legale": "Via Garibaldi 10, 20121 Milano, MI",
    "codice_sdi": "SUBM70N",
    "pec_azienda": "azienda@pec.it"
  }
}
```

### GET `/api/export`
Esporta tutte le registrazioni con ospiti in formato CSV.

### GET `/api/registrations`
Restituisce tutte le registrazioni con ospiti in formato JSON (per dashboard admin).

### GET `/admin`
Dashboard amministratore con autenticazione (password: 123456).

## Database

Il sistema utilizza SQLite con la seguente struttura relazionale:

### Tabella `registrazioni` (Capigruppo)
```sql
CREATE TABLE registrazioni (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evento TEXT NOT NULL,
    nome TEXT NOT NULL,
    cognome TEXT NOT NULL,
    email TEXT NOT NULL,
    cellulare TEXT NOT NULL,
    data_nascita TEXT NOT NULL,
    codice_fiscale TEXT NOT NULL,
    indirizzo TEXT NOT NULL,
    partenza TEXT NOT NULL,
    camera_singola INTEGER DEFAULT 0,
    camera_doppia INTEGER DEFAULT 0,
    camera_tripla INTEGER DEFAULT 0,
    camera_quadrupla INTEGER DEFAULT 0,
    costo_totale_gruppo REAL NOT NULL,
    fatturazione_aziendale BOOLEAN DEFAULT 0,
    ragione_sociale TEXT,
    partita_iva TEXT,
    codice_fiscale_azienda TEXT,
    indirizzo_sede_legale TEXT,
    codice_sdi TEXT,
    pec_azienda TEXT,
    data_iscrizione DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabella `ospiti`
```sql
CREATE TABLE ospiti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    registrazione_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    cognome TEXT NOT NULL,
    data_nascita TEXT NOT NULL,
    codice_fiscale TEXT NOT NULL,
    indirizzo TEXT NOT NULL,
    FOREIGN KEY (registrazione_id) REFERENCES registrazioni(id) ON DELETE CASCADE
);
```

## Configurazione Prezzi

I prezzi sono configurati dinamicamente nello script del file `public/index.html` all'interno dell'oggetto `prices`. La logica di calcolo è gestita dalla funzione `calculateTotal()`.

### Logica di Calcolo
- **Camera 1 (del Capogruppo)**: I primi due occupanti (capogruppo + 1° ospite) sono gratuiti.
- **Ospiti successivi**: Il prezzo varia in base all'età (neonato, bambino, adulto) e alla posizione nel letto (3° o 4°).
- **Camera 2**: I prezzi sono calcolati in base al numero di occupanti (singola, doppia) e all'età per i letti aggiuntivi.
- **Pacchetto Volo**: Il supplemento per l'aeroporto di partenza viene applicato a ogni persona pagante.
- Il costo totale viene calcolato in tempo reale e mostrato nel riepilogo.
- **Calcolo Età**: L'età dei partecipanti viene calcolata in base alla data di partenza del viaggio (es. 12/07/2025), configurata nel file `.env` per garantire coerenza.

## Dashboard Amministratore

### Accesso
- URL: http://localhost:3000/admin
- Password: 123456

### Funzionalità
- **Visualizzazione registrazioni** con dettagli ospiti
- **Statistiche avanzate**:
  - Totale registrazioni
  - Totale persone
  - Media ospiti per registrazione
  - Ricavo totale
- **Esportazione CSV** con tutti i dati
- **Interfaccia responsive** per dispositivi mobili

## Sicurezza

- ✅ **Autenticazione admin** con password
- ✅ **Transazioni database** per integrità dei dati
- ✅ **Validazione completa** lato server e client
- ✅ **Protezione XSS** tramite escape automatico
- ✅ **Validazione email** HTML5
- ⚠️ **Per produzione**: Implementare sessioni sicure per l'admin

## Personalizzazione

### Aggiungere campi per ospiti
Nel file `public/index.html`, modifica la funzione `updateGuestFields()` per aggiungere nuovi campi.

### Modificare la struttura dati
1. Aggiorna la tabella `ospiti` in `server.js`
2. Modifica la query di inserimento
3. Aggiorna il form HTML
4. Modifica le query di esportazione

## Deploy in Produzione

1. **Configura variabili d'ambiente**:
   ```bash
   PORT=80 npm start
   ```

2. **Usa un process manager**:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "maeviaggi"
   ```

3. **Backup automatico del database**:
   ```bash
   # Crea script di backup
   cp database.sqlite backup/database_$(date +%Y%m%d).sqlite
   ```

4. **Configurazione sicurezza produzione**:
   - Cambia password admin
   - Implementa HTTPS
   - Configura firewall
   - Aggiungi rate limiting

## Supporto

Per problemi o domande:
- Verifica che tutte le dipendenze siano installate
- Controlla che la porta 3000 sia libera
- Verifica i permessi di scrittura per il database SQLite
- Controlla i log del server per errori

## Licenza

MIT License - Vedi file LICENSE per i dettagli. 