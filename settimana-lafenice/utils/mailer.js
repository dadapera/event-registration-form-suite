const nodemailer = require('nodemailer');
const log = require('./logger');
const path = require('path');

/**
 * Creates a mailer instance with the provided environment configuration
 * @param {object} envConfig - Environment configuration object
 * @returns {object} Object with sendMail function
 */
function createMailer(envConfig) {
    // Create a reusable transporter object using the provided SMTP configuration
    const transporter = nodemailer.createTransport({
        host: envConfig.SMTP_HOST,
        port: envConfig.SMTP_PORT,
        secure: envConfig.SMTP_PORT == 465, // true for 465, false for other ports
        auth: {
            user: envConfig.SMTP_USER,
            pass: envConfig.SMTP_PASS,
        },
        tls: {
            // do not fail on invalid certs
            rejectUnauthorized: false
        }
    });

    /**
     * Sends an email using the configured transporter
     * @param {string|string[]} to - Recipient's email address(es) - can be a single email or array of emails
     * @param {string} subject - Email subject
     * @param {string} html - HTML body of the email
     * @returns {Promise<boolean>} - True if email was sent successfully, false otherwise
     */
    async function sendMail(to, subject, html) {
        // Convert single email to array for consistent handling
        const recipients = Array.isArray(to) ? to : [to];
        const recipientString = recipients.join(', ');

        const mailOptions = {
            from: `"${envConfig.EMAIL_FROM_NAME}" <${envConfig.EMAIL_FROM_ADDRESS}>`,
            to: recipientString,
            subject: subject,
            html: html
        };

        try {
            const info = await transporter.sendMail(mailOptions);
            log('INFO', `Email sent successfully to ${recipientString}`, { 
                messageId: info.messageId,
                fromName: envConfig.EMAIL_FROM_NAME,
                fromAddress: envConfig.EMAIL_FROM_ADDRESS
            });
            return true;
        } catch (error) {
            log('ERROR', `Failed to send email to ${recipientString}`, { 
                error: error.message,
                smtpHost: envConfig.SMTP_HOST,
                smtpPort: envConfig.SMTP_PORT
            });
            return false;
        }
    }

    // Verify the transporter configuration
    transporter.verify(function(error, success) {
        if (error) {
            log('ERROR', `SMTP transporter verification failed`, { 
                error: error.message,
                host: envConfig.SMTP_HOST,
                port: envConfig.SMTP_PORT,
                user: envConfig.SMTP_USER
            });
        } else {
            log('SYSTEM', `SMTP transporter is configured and ready`, {
                host: envConfig.SMTP_HOST,
                port: envConfig.SMTP_PORT,
                fromName: envConfig.EMAIL_FROM_NAME
            });
        }
    });

    return { sendMail };
}

module.exports = { createMailer }; 