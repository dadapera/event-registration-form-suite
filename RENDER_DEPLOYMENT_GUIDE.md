# Render.com Deployment Guide

This guide explains how to deploy each standalone service to Render.com.

## 📋 Prerequisites

- GitHub repository connected to Render
- Render.com account
- Environment variables ready

## 🚀 Step-by-Step Deployment

### 1. Crociera sui Fiordi Service

1. **Create Web Service**:
   - Go to Render Dashboard → New → Web Service
   - Connect your repository
   - Service Name: `crociera-fiordi`

2. **Configure Service**:
   - **Root Directory**: `crociera-fiordi`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` or `Starter` (recommended)

3. **Environment Variables**:
   ```env
   ADMIN_PASSWORD=your_secure_password_123
   CALCULATION_DATE=2024-12-31
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   EMAIL_FROM_NAME=Maeviaggi Travel Agency
   EMAIL_FROM_ADDRESS=noreply@yourdomain.com
   ```

4. **Deploy**: Click "Create Web Service"

### 2. Crociera nel Mediterraneo Service

Repeat the same process:

1. **Create Web Service**:
   - Service Name: `crociera-mediterraneo`

2. **Configure Service**:
   - **Root Directory**: `crociera-mediterraneo`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` or `Starter`

3. **Environment Variables**: Same as above

4. **Deploy**: Click "Create Web Service"

## 🌐 Service URLs

After deployment, your services will be available at:
- **Crociera Fiordi**: `https://crociera-fiordi.onrender.com`
- **Crociera Mediterraneo**: `https://crociera-mediterraneo.onrender.com`

## 🔧 Configuration Tips

### Free Tier Considerations
- Services may spin down after 15 minutes of inactivity
- Cold starts may take 30+ seconds
- Consider upgrading to Starter plan for production

### Environment Variables Best Practices
- Use strong passwords for `ADMIN_PASSWORD`
- Set up proper SMTP credentials for email functionality
- Use environment-specific dates for `CALCULATION_DATE`

### Custom Domain (Optional)
1. Go to service settings in Render
2. Add your custom domain
3. Configure DNS records as instructed

## 📊 Monitoring

### Health Checks
Each service provides a health endpoint:
- `https://your-service.onrender.com/health`

### Logs
- Access logs via Render dashboard
- Real-time log streaming available
- Download logs for debugging

### Metrics
- View service metrics in Render dashboard
- Monitor response times and error rates
- Set up alerts for critical issues

## 🔄 Continuous Deployment

Render automatically deploys when you push to your main branch:

1. **Auto-Deploy**: Enabled by default
2. **Deploy Hooks**: Use webhooks for external triggers
3. **Branch Selection**: Configure which branch triggers deployment

## 💾 Data Management

### Database Backup
Since each service uses SQLite:
1. Use the `/api/export` endpoint to download CSV backups
2. Schedule regular exports
3. Store backups in cloud storage

### Database Persistence
- SQLite files persist across deployments
- Data is stored in the container filesystem
- Consider external database for production workloads

## 🚨 Troubleshooting

### Common Issues

**Service Won't Start**:
- Check build logs in Render dashboard
- Verify all environment variables are set
- Ensure `package.json` has correct start script

**404 Errors**:
- Verify root directory is set correctly
- Check that all required files are in the service directory

**Database Issues**:
- Ensure `data/` directory exists
- Check file permissions
- Review database initialization logs

**Email Not Working**:
- Verify SMTP credentials
- Check spam/junk folders
- Test with Gmail App Passwords

### Getting Help
1. Check Render's status page
2. Review service logs
3. Contact Render support
4. Check this project's GitHub issues

## 🎯 Production Recommendations

1. **Use Starter Plan**: For better performance and uptime
2. **Set Up Monitoring**: Use external monitoring services
3. **Configure Backups**: Regular data exports
4. **Use Custom Domains**: Professional appearance
5. **Set Up SSL**: Automatic with custom domains
6. **Monitor Costs**: Track usage and optimize as needed

## 📈 Scaling

- **Horizontal**: Deploy multiple instances if needed
- **Vertical**: Upgrade to higher-tier plans
- **Geographic**: Use multiple regions for better performance
- **Load Balancing**: Configure if running multiple instances
