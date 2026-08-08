require('dotenv').config();

const path = require('path');
const express = require('express');
const db = require('./db');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

async function main() {
  await db.init();

  // The API app (also used by Vercel via api/index.js)
  const app = require('./api/index');

  // Serve the static frontend locally (Vercel serves these files itself)
  app.use('/images', express.static(path.join(ROOT, 'images')));
  app.use('/downloads', express.static(path.join(ROOT, 'downloads')));
  app.get('/favicon.svg', (req, res) => res.sendFile(path.join(ROOT, 'favicon.svg')));
  app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

  app.listen(PORT, () => {
    console.log(`UFABWU backend running at http://localhost:${PORT}`);
    console.log(`Database: ${db.isTurso ? 'Turso (cloud)' : path.join(ROOT, 'data', 'ufabwu.db')}`);
    console.log(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
      ? 'Email: SMTP enabled'
      : 'Email: SMTP not configured - emails are saved to the email-outbox/ folder');
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
