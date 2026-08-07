// Sends a single test email to verify the SMTP setup in .env is working.
// Usage:  node test-email.js
require('dotenv').config();
const nodemailer = require('nodemailer');

const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const to = process.env.SECRETARIAT_EMAIL || user;

if (!host || !user || !pass) {
  console.error('SMTP is not fully configured yet. Open .env and fill in SMTP_USER and SMTP_PASS, then verify SMTP_HOST is set for your provider.');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user, pass },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000
});

transporter.verify()
  .then(() => {
    console.log('SMTP connection verified successfully.');
    return transporter.sendMail({
      from: process.env.MAIL_FROM || user,
      to,
      subject: 'UFABWU Email Setup Test',
      html: '<p>Hello! This is a test email from the <strong>UFABWU website backend</strong>.</p><p>If you received this, real email sending is fully working. ✅</p><p>Solidarity,<br>UFABWU National Secretariat</p>',
      text: 'Hello! This is a test email from the UFABWU website backend. If you received this, real email sending is fully working.'
    });
  })
  .then((info) => {
    console.log('Test email SENT to: ' + to);
    console.log('Message ID: ' + info.messageId);
    console.log('Done. Real email delivery is now active.');
  })
  .catch((err) => {
    console.error('Email setup check FAILED:');
    console.error(err.message);
    if (err.code === 'EAUTH') {
      console.error('\nAuthentication failed. Check your SMTP_USER / SMTP_PASS.');
      console.error('For Brevo: SMTP_USER is the SMTP Login (looks like 7xxxxx@smtp-brevo.com) and SMTP_PASS is the SMTP master key - both from Settings -> SMTP & API. They are NOT your Gmail or your Gmail password.');
    }
    if (err.message && /sender|550|not verified/i.test(err.message)) {
      console.error('\nThe From address was rejected or not verified. Verify the sender in Brevo: Senders, Domains & Dedicated IPs -> Senders -> Add Sender, confirm the 6-digit code, and make sure MAIL_FROM uses that exact address.');
    }
    process.exit(1);
  });
