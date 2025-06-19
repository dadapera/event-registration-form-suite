require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const nodemailer = require('nodemailer');
const log = require('./logger');

// Create a reusable transporter object using the default SMTP transport
// We use environment variables to keep credentials secure.
// You should create a .env file in the root of your project with these variables.
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        // do not fail on invalid certs
        rejectUnauthorized: false
    }
});

transporter.verify(function(error, success) {
    if (error) {
        log('ERROR', `SMTP transporter verification failed: ${error.message}`);
    } else {
        log('SYSTEM', 'SMTP transporter is configured and ready to send emails.');
    }
});

/**
 * Sends an email.
 * @param {string} to - Recipient's email address.
 * @param {string} subject - Email subject.
 * @param {string} html - HTML body of the email.
 * @returns {Promise<boolean>} - True if email was sent successfully, false otherwise.
 */
async function sendMail(to, subject, html) {
    const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
        to: to,
        subject: subject,
        html: html,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        log('INFO', `Email sent successfully to ${to}`, { messageId: info.messageId });
        return true;
    } catch (error) {
        log('ERROR', `Failed to send email to ${to}`, { error: error.message });
        return false;
    }
}

module.exports = { sendMail }; 