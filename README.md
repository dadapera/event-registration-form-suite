# Event Form Suite - Standalone Services

A simplified event registration system with standalone services designed for easy deployment on Render.com and other cloud platforms.

## 🏗️ Architecture

This project has been restructured and cleaned up to provide completely isolated standalone services:

```
event-form-suite/
├── settimana-lafenice/        # Complete standalone service for La Fenice cruise
├── crociera-mediterraneo/     # Complete standalone service for Mediterranean cruise
├── deploy-standalone.*        # Deployment scripts for both services
├── README.md                  # This documentation
└── RENDER_DEPLOYMENT_GUIDE.md # Render deployment instructions
```

Each service is completely self-contained with its own:
- Node.js server
- SQLite database
- Dependencies
- Dockerfile
- Configuration

## 🚀 Quick Start

### Option 1: Run Individual Services Locally

**Settimana La Fenice:**
```bash
cd settimana-lafenice
npm install
npm start
# Service available at http://localhost:3000
```

**Crociera nel Mediterraneo:**
```bash
cd crociera-mediterraneo
npm install
npm start
# Service available at http://localhost:3000
```

### Option 2: Install All Dependencies at Once

```bash
npm run install:all
```

### Option 3: Docker

Each service can be built and run independently:

```bash
# Build and run Settimana La Fenice
npm run build:lafenice
docker run -p 3001:3000 settimana-lafenice

# Build and run Crociera Mediterraneo
npm run build:mediterraneo
docker run -p 3002:3000 crociera-mediterraneo
```

## ☁️ Render.com Deployment

Each service can be deployed as a separate web service on Render:

1. **Connect Repository**: Link your GitHub repository to Render
2. **Create Web Service**: Create a new web service for each form
3. **Service Configuration**:
   - **Root Directory**: `settimana-lafenice` or `crociera-mediterraneo`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Set required environment variables

### Required Environment Variables

For each service, set these environment variables in Render:

```env
PORT=3000  # Render sets this automatically
ADMIN_PASSWORD=your_secure_admin_password
CALCULATION_DATE=2024-12-31

# Email Configuration (optional but recommended)
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_email@domain.com
SMTP_PASS=your_email_password
EMAIL_FROM_NAME=Maeviaggi Travel Agency
EMAIL_FROM_ADDRESS=noreply@maeviaggi.com
```

## 📊 Services Overview

| Service | Description | Port (Local) | Main Features |
|---------|-------------|--------------|---------------|
| **Settimana La Fenice** | Registration for La Fenice cruise | 3000 | Form, Admin Panel, PDF Export, Email |
| **Crociera Mediterraneo** | Registration for Mediterranean cruise | 3000 | Form, Admin Panel, PDF Export, Email |

## 🌐 Service Endpoints

Each service provides the same set of endpoints:

- **GET /** - Registration form interface
- **POST /api/registrati** - Submit new registration
- **GET /api/config** - Service configuration
- **GET /api/export** - Export registrations as CSV
- **GET /api/registrations** - List all registrations (admin)
- **POST /api/generate-pdf/:id** - Generate PDF summary
- **GET /admin** - Admin dashboard
- **GET /health** - Health check endpoint

## 🔧 Development

### Local Development with Auto-reload

```bash
# For Settimana La Fenice
npm run dev:lafenice

# For Crociera Mediterraneo
npm run dev:mediterraneo
```

### Adding a New Form Service

1. **Create Service Directory**: Copy one of the existing services
2. **Update Configuration**: Modify `config.json` and `package.json`
3. **Customize Forms**: Update `index.html` and styling
4. **Deploy**: Create new web service on Render

## 💾 Data Persistence

Each service uses SQLite for data storage:
- **Local**: Database files stored in `data/database.sqlite`
- **Render**: Database persists across deployments (stored in container)
- **Backup**: Use the CSV export feature for data backup

## 🔒 Security

- **Admin Access**: Protected by password set in environment variables
- **CORS**: Configured for cross-origin requests
- **Environment Variables**: Sensitive data stored in environment variables
- **Input Validation**: Server-side validation for all form inputs

## 📧 Email Integration

Services can send confirmation emails to users:
- Configure SMTP settings in environment variables
- Automatic email sending after successful registration
- HTML formatted emails with registration summary

## 🏥 Monitoring

Each service includes:
- **Health Check**: `/health` endpoint for monitoring
- **Logging**: Structured logging for debugging
- **Error Handling**: Graceful error responses

## 🔄 Migration from Microservices

This project was migrated from a microservices architecture to standalone services for:
- **Simplified Deployment**: Each service deploys independently
- **Render Compatibility**: Better suited for Render's web service model
- **Reduced Complexity**: No need for API gateway or service discovery
- **Cost Efficiency**: Pay only for active services

## 🛠️ Legacy Files

The following files are from the old microservices architecture and can be removed if not needed:
- `docker-compose.microservices.yml`
- `nginx/`
- `services/`
- `deploy-microservices.*`
- `README_MICROSERVICES.md`

## 📞 Support

For questions or issues:
1. Check the individual service README files
2. Review the service logs via Render dashboard
3. Use the health check endpoints to verify service status

## 🚀 Benefits of New Architecture

- ✅ **Simplified Deployment**: Each service deploys independently
- ✅ **Cloud-Native**: Optimized for Render.com and similar platforms
- ✅ **Scalable**: Services can be scaled independently
- ✅ **Maintainable**: Clear separation of concerns
- ✅ **Cost-Effective**: Only pay for what you use
- ✅ **Reliable**: Service failures are isolated