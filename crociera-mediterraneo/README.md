# Crociera nel Mediterraneo - Standalone Service

Standalone registration service for Crociera nel Mediterraneo events.

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start the service
npm start

# For development with auto-reload
npm run dev
```

### Using Service Deployment Scripts

**Linux/Mac:**
```bash
chmod +x deploy.sh
./deploy.sh
# Follow the interactive menu
```

**Windows:**
```cmd
deploy.bat
# Follow the interactive menu
```

### Docker

```bash
# Build the Docker image
docker build -t crociera-mediterraneo .

# Run the container
docker run -p 3000:3000 crociera-mediterraneo
```

### Render Deployment

This service is designed for easy deployment on Render.com:

1. Connect your repository to Render
2. Create a new Web Service
3. Set the root directory to `crociera-mediterraneo`
4. Use the build command: `npm install`
5. Use the start command: `npm start`
6. Set the environment variables (see Configuration section)

## 🔧 Configuration

The service uses environment variables for configuration. Create a `.env` file in the service root:

```env
PORT=3000
ADMIN_PASSWORD=your_admin_password
CALCULATION_DATE=2024-12-31

# Email configuration
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_email@domain.com
SMTP_PASS=your_email_password
EMAIL_FROM_NAME=Maeviaggi Travel Agency
EMAIL_FROM_ADDRESS=noreply@maeviaggi.com
```

## 📂 Project Structure

```
crociera-mediterraneo/
├── server.js              # Main server entry point
├── instance.js            # Form logic and routes
├── config.json            # Form configuration
├── index.html             # Registration form
├── admin-dashboard.html   # Admin panel
├── admin-login.html       # Admin login
├── package.json           # Dependencies
├── Dockerfile            # Docker configuration
├── deploy.sh             # Linux/Mac deployment script
├── deploy.bat            # Windows deployment script
├── env.template          # Environment variables template
├── .gitignore            # Git ignore rules
├── .dockerignore         # Docker ignore rules
├── utils/                # Service utilities
│   ├── logger.js
│   ├── mailer.js
│   ├── pdfGenerator.js
│   └── envLoader.js
├── tools/                # Data processing tools
│   ├── generate_user_ids.py
│   └── sample_data.csv
├── assets/               # Static assets
└── data/                 # SQLite database (auto-created)
```

## 🔧 Complete Isolation

This service is **completely self-contained** and includes:
- ✅ All dependencies in package.json
- ✅ Independent deployment scripts
- ✅ Service-specific tools and utilities
- ✅ Own environment configuration
- ✅ Isolated database storage
- ✅ No external dependencies on parent project

## 🌐 Endpoints

- **GET /** - Registration form
- **POST /api/registrati** - Submit registration
- **GET /api/config** - Form configuration
- **GET /api/export** - Export registrations as CSV
- **GET /api/registrations** - Get all registrations (admin)
- **POST /api/generate-pdf/:id** - Generate PDF summary
- **GET /admin** - Admin panel
- **GET /health** - Health check

## 💾 Database

Uses SQLite database stored in `data/database.sqlite`. The database is automatically created and initialized on first run.

## 🔒 Admin Access

Access the admin panel at `/admin` using the password set in the `ADMIN_PASSWORD` environment variable.

## 📧 Email Notifications

The service sends confirmation emails to users after successful registration. Configure the SMTP settings in your environment variables.

## 🏥 Health Monitoring

The service includes a health check endpoint at `/health` that returns the service status and timestamp.

## 🛠️ Tools and Utilities

### User ID Generator
Generate unique user IDs from CSV data:

```bash
# Generate IDs from sample data
python tools/generate_user_ids.py tools/sample_data.csv

# Generate IDs from your own CSV file
python tools/generate_user_ids.py your_file.csv output_file.csv

# Use deployment script menu option 8
./deploy.sh  # Select option 8
```

The tool supports:
- Automatic delimiter detection (comma, semicolon, tab)
- Multiple ID generation methods (scheda, cliente, combined)
- Duplicate detection
- Progress tracking for large files

### Deployment Scripts
Interactive deployment scripts for easy service management:

**Features:**
- Dependency installation
- Development and production modes
- Docker build and run
- Service status monitoring
- Container management

**Usage:**
```bash
# Linux/Mac
./deploy.sh

# Windows  
deploy.bat
```
