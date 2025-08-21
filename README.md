# Sistema di Registrazione per Eventi di Viaggio

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
   git clone https://github.com/dadapera/event-registration-form-suite.git
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
event-form-suite/
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

Il sistema utilizza PostgreSQL come database per garantire migliori prestazioni con accesso concorrente. 

### Configurazione PostgreSQL

#### Variabili di Ambiente Richieste

Per la connessione al database PostgreSQL, configurare le seguenti variabili di ambiente:

```bash
# Render PostgreSQL Connection (raccomandato)
DATABASE_URL=postgresql://username:password@host:port/database

# O configurazione alternativa
DB_HOST=localhost
DB_PORT=5432
DB_NAME=event_forms
DB_USER=postgres
DB_PASSWORD=your_password
```

#### Setup su Render

1. Crea un nuovo database PostgreSQL su Render
2. Copia l'URL di connessione interno dal dashboard
3. Aggiungi `DATABASE_URL` come variabile di ambiente al tuo web service
4. Il sistema creerà automaticamente le tabelle al primo avvio

#### Test della Connessione Database

Prima di effettuare il deploy, testa la connessione al database:

```bash
# Installa le dipendenze
npm install

# Testa la connessione database
npm run test-db
```

#### Deploy Locale con Docker

```bash
# Linux/macOS
./deploy-microservices.sh

# Windows
./deploy-microservices.bat
```

Gli script di deploy automaticamente:
- Verificano che Docker sia in esecuzione
- Creano il file .env con le variabili di ambiente necessarie
- Costruiscono e avviano i servizi Docker
- Testano la salute dei servizi

#### Esempio File .env

```bash
# PostgreSQL Database Configuration
DATABASE_URL=postgresql://username:password@host:port/database_name

# Application Settings
NODE_ENV=production
SERVICE_PORT=3000

# Email Configuration (per instance)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_email_password
EMAIL_FROM_NAME=Event Registration
EMAIL_FROM_ADDRESS=noreply@example.com

# Admin Settings
ADMIN_PASSWORD=your_admin_password

# Event Configuration
CALCULATION_DATE=2025-07-12
```

### Struttura Database

### Tabella `registrazioni` (Capigruppo)
```sql
CREATE TABLE registrazioni (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE,
    evento VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    cognome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    cellulare VARCHAR(255) NOT NULL,
    data_nascita DATE NOT NULL,
    codice_fiscale VARCHAR(255) NOT NULL,
    indirizzo TEXT NOT NULL,
    partenza VARCHAR(255) NOT NULL,
    camera_singola INTEGER DEFAULT 0,
    camera_doppia INTEGER DEFAULT 0,
    camera_tripla INTEGER DEFAULT 0,
    camera_quadrupla INTEGER DEFAULT 0,
    costo_totale_gruppo DECIMAL(10,2) NOT NULL,
    fatturazione_aziendale BOOLEAN DEFAULT false,
    data_iscrizione TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tabella `accompagnatori_dettagli`
```sql
CREATE TABLE accompagnatori_dettagli (
    id SERIAL PRIMARY KEY,
    registrazione_id INTEGER REFERENCES registrazioni(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    cognome VARCHAR(255) NOT NULL,
    data_nascita DATE NOT NULL,
    codice_fiscale VARCHAR(255) NOT NULL,
    indirizzo TEXT NOT NULL
);
```

### Tabella `dati_fatturazione`
```sql
CREATE TABLE dati_fatturazione (
    id SERIAL PRIMARY KEY,
    registrazione_id INTEGER REFERENCES registrazioni(id) ON DELETE CASCADE,
    ragione_sociale VARCHAR(255),
    partita_iva VARCHAR(255),
    codice_fiscale_azienda VARCHAR(255),
    indirizzo_sede_legale TEXT,
    codice_sdi VARCHAR(255),
    pec_azienda VARCHAR(255)
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
   pm2 start server.js --name "event-form"
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
