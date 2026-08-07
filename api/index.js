require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../db');

const app = express();

const EMAIL_OUTBOX = path.join(__dirname, '..', 'email-outbox');

// ---------------------------------------------------------------------------
// Email service (Nodemailer). Falls back to a local email-outbox folder when
// SMTP is not configured yet, so the site keeps working during development.
// ---------------------------------------------------------------------------
function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
}

async function sendMail({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'UFABWU Portal <no-reply@ufabwu.org>';
  const transporter = getTransporter();

  if (!transporter) {
    fs.mkdirSync(EMAIL_OUTBOX, { recursive: true });
    const fileName = `email-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.eml`;
    const body = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      '',
      text || html.replace(/<[^>]+>/g, ' ')
    ].join('\n');
    fs.writeFileSync(path.join(EMAIL_OUTBOX, fileName), body);
    console.log(`[MAIL-OUTBOX] ${fileName} -> ${to} (subject: ${subject})`);
    return { outbox: fileName };
  }

  return transporter.sendMail({ from, to, subject, html, text });
}

function notifyTeam({ subject, html, text }) {
  const secretariat = process.env.SECRETARIAT_EMAIL || 'info@ufabwu.org';
  return sendMail({ to: secretariat, subject, html, text });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function genReference(prefix) {
  return `${prefix}-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;
}

async function genUnique(prefix, table, column) {
  let id = genReference(prefix);
  while ((await db.get(`SELECT COUNT(*) AS c FROM ${table} WHERE ${column} = ?`, [id])).c > 0) {
    id = genReference(prefix);
  }
  return id;
}

function required(req, res, fields) {
  for (const f of fields) {
    if (!req.body || String(req.body[f] || '').trim() === '') {
      res.status(400).json({ ok: false, error: `Missing required field: ${f}` });
      return false;
    }
  }
  return true;
}

const esc = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'UFABWU backend', time: new Date().toISOString() });
});

// 1. Contact messages -> delivered to the secretariat
app.post('/api/contact', async (req, res) => {
  if (!required(req, res, ['name', 'message'])) return;

  const name = String(req.body.name).trim();
  const phone = String(req.body.phone || '').trim();
  const email = String(req.body.email || '').trim();
  const subject = String(req.body.subject || 'General Inquiry').trim();
  const message = String(req.body.message).trim();

  const refId = await genUnique('MSG', 'messages', 'ref_id');
  await db.run(
    `INSERT INTO messages (ref_id, name, phone, email, subject, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [refId, name, phone, email, subject, message]
  );

  try {
    await notifyTeam({
      subject: `[UFABWU Contact] ${subject} - ${name}`,
      html: `
        <h3>New contact message from the website</h3>
        <p><strong>Reference:</strong> ${esc(refId)}</p>
        <p><strong>Name:</strong> ${esc(name)}</p>
        <p><strong>Phone:</strong> ${esc(phone) || '—'}</p>
        <p><strong>Email:</strong> ${esc(email) || '—'}</p>
        <p><strong>Subject:</strong> ${esc(subject)}</p>
        <hr>
        <p>${esc(message).replace(/\n/g, '<br>')}</p>
      `,
      text: `New contact message\nReference: ${refId}\nName: ${name}\nPhone: ${phone}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }

  res.json({ ok: true, refId });
});

// 2. Newsletter subscription -> confirm to subscriber + notify secretariat
app.post('/api/newsletter', async (req, res) => {
  if (!required(req, res, ['email'])) return;

  const email = String(req.body.email).trim().toLowerCase();
  const sector = String(req.body.sector || 'All Sectors').trim();

  const info = await db.run(
    `INSERT INTO newsletter_subscribers (email, sector) VALUES (?, ?)
     ON CONFLICT(email) DO NOTHING`,
    [email, sector]
  );

  const isNew = info.changes === 1;

  try {
    await sendMail({
      to: email,
      subject: 'Welcome to the UFABWU Labor Rights Dispatch',
      html: `
        <p>Dear subscriber,</p>
        <p>Thank you for subscribing to the <strong>UFABWU Labor Rights Dispatch</strong>.</p>
        <p>You will receive monthly summaries of CBA agreements, Industrial Court decisions, SACCO bursary deadlines and rally dates.</p>
        <p><em>You can unsubscribe at any time with one click.</em></p>
        <p>Solidarity,<br>UFABWU National Secretariat · LUN 38</p>
      `,
      text: 'Dear subscriber,\n\nThank you for subscribing to the UFABWU Labor Rights Dispatch. You will receive monthly summaries of CBA agreements, Industrial Court decisions, SACCO bursary deadlines and rally dates.\n\nYou can unsubscribe at any time with one click.\n\nSolidarity,\nUFABWU National Secretariat · LUN 38'
    });
    await notifyTeam({
      subject: `[UFABWU Newsletter] New subscriber - ${email}`,
      html: `<p>New newsletter subscription.</p><p><strong>Email:</strong> ${esc(email)}</p><p><strong>Sector:</strong> ${esc(sector)}</p>`,
      text: `New newsletter subscription.\nEmail: ${email}\nSector: ${sector}`
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }

  res.json({ ok: true, email, existing: !isNew });
});

// 3. Grievance -> stored with a trackable ticket, emailed to legal dept + worker
app.post('/api/grievance', async (req, res) => {
  if (!required(req, res, ['name', 'details'])) return;

  const name = String(req.body.name).trim();
  const phone = String(req.body.phone || '').trim();
  const employer = String(req.body.employer || '').trim();
  const category = String(req.body.category || 'General').trim();
  const district = String(req.body.district || '').trim();
  const details = String(req.body.details).trim();

  const ticketId = await genUnique('GRV', 'grievances', 'ticket_id');
  await db.run(
    `INSERT INTO grievances (ticket_id, name, phone, employer, category, district, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ticketId, name, phone, employer, category, district, details]
  );

  try {
    await notifyTeam({
      subject: `[UFABWU Grievance] Ticket ${ticketId} - ${category}`,
      html: `
        <h3>Workplace dispute reported via the website</h3>
        <p><strong>Tracking ticket:</strong> ${esc(ticketId)}</p>
        <p><strong>Worker:</strong> ${esc(name)}</p>
        <p><strong>Phone:</strong> ${esc(phone) || '—'}</p>
        <p><strong>Employer:</strong> ${esc(employer) || '—'}</p>
        <p><strong>Category:</strong> ${esc(category)}</p>
        <p><strong>District:</strong> ${esc(district) || '—'}</p>
        <hr>
        <p>${esc(details).replace(/\n/g, '<br>')}</p>
      `,
      text: `Workplace dispute reported\nTracking ticket: ${ticketId}\nWorker: ${name}\nPhone: ${phone}\nEmployer: ${employer}\nCategory: ${category}\nDistrict: ${district}\n\n${details}`
    });

    if (req.body.email) {
      await sendMail({
        to: String(req.body.email).trim(),
        subject: `UFABWU Grievance Received - Ticket ${ticketId}`,
        html: `
          <p>Dear ${esc(name)},</p>
          <p>Your workplace dispute has been received by the UFABWU Legal & Grievance Department.</p>
          <p><strong>Your tracking ticket is: ${esc(ticketId)}</strong></p>
          <p>Please keep this code safe. You can quote it whenever you contact the secretariat at <strong>+256 772 518902</strong>.</p>
          <p>Status: Assigned to the Legal Department.</p>
          <p>Solidarity,<br>UFABWU National Secretariat · LUN 38</p>
        `,
        text: `Dear ${name},\n\nYour workplace dispute has been received by the UFABWU Legal & Grievance Department.\n\nYour tracking ticket is: ${ticketId}\n\nPlease keep this code safe. You can quote it whenever you contact the secretariat at +256 772 518902.\n\nStatus: Assigned to the Legal Department.\n\nSolidarity,\nUFABWU National Secretariat · LUN 38`
      });
    }
  } catch (err) {
    console.error('Email send failed:', err.message);
  }

  res.json({ ok: true, ticketId });
});

// 4. Ticket lookup -> retrieve status by tracking code
app.get('/api/ticket/:ticketId', async (req, res) => {
  const row = await db.get(
    `SELECT ticket_id, name, category, district, employer, status, created_at
     FROM grievances WHERE ticket_id = ?`,
    [String(req.params.ticketId).trim().toUpperCase()]
  );

  if (!row) return res.status(404).json({ ok: false, error: 'Ticket not found' });
  res.json({ ok: true, ticket: row });
});

// 5. Membership registration -> member card record with a unique member ID
app.post('/api/membership', async (req, res) => {
  if (!required(req, res, ['name'])) return;

  const name = String(req.body.name).trim();
  const nin = String(req.body.nin || '').trim();
  const phone = String(req.body.phone || '').trim();
  const sector = String(req.body.sector || 'Tea & Sugar Plantation').trim();
  const employer = String(req.body.employer || '').trim();
  const branch = String(req.body.branch || 'Kampala Central Branch').trim();

  const memberId = await genUnique('UFAB', 'members', 'member_id');
  await db.run(
    `INSERT INTO members (member_id, name, nin, phone, sector, employer, branch)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [memberId, name, nin, phone, sector, employer, branch]
  );

  try {
    if (req.body.email) {
      await sendMail({
        to: String(req.body.email).trim(),
        subject: `Welcome to UFABWU - Your Member ID ${memberId}`,
        html: `
          <p>Dear ${esc(name)},</p>
          <p>Your UFABWU membership registration was successful.</p>
          <p><strong>Member ID:</strong> ${esc(memberId)}</p>
          <p><strong>Branch:</strong> ${esc(branch)}</p>
          <p><strong>Sector:</strong> ${esc(sector)}</p>
          <p>Keep this digital card safe and present it at any UFABWU branch for benefits and services.</p>
          <p>Solidarity,<br>UFABWU National Secretariat · LUN 38</p>
        `,
        text: `Dear ${name},\n\nYour UFABWU membership registration was successful.\n\nMember ID: ${memberId}\nBranch: ${branch}\nSector: ${sector}\n\nKeep this digital card safe and present it at any UFABWU branch for benefits and services.\n\nSolidarity,\nUFABWU National Secretariat · LUN 38`
      });
    }
    await notifyTeam({
      subject: `[UFABWU Membership] New member ${memberId} - ${name}`,
      html: `<p>New member registered online.</p><p><strong>Member ID:</strong> ${esc(memberId)}</p><p><strong>Name:</strong> ${esc(name)}</p><p><strong>NIN:</strong> ${esc(nin) || '—'}</p><p><strong>Phone:</strong> ${esc(phone) || '—'}</p><p><strong>Employer:</strong> ${esc(employer) || '—'}</p><p><strong>Branch:</strong> ${esc(branch)}</p>`,
      text: `New member registered online.\nMember ID: ${memberId}\nName: ${name}\nNIN: ${nin}\nPhone: ${phone}\nEmployer: ${employer}\nBranch: ${branch}`
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }

  res.json({ ok: true, memberId, name, branch, sector });
});

module.exports = app;
