# UFABWU Website

Static union portal (index.html) with a Node.js backend for contact messages, newsletter
subscriptions, grievance tickets, and membership ID cards — deployed on **Vercel** with a
**Turso** cloud database and **Brevo** email delivery.

## Project structure

```
api/index.js    Express app (API routes) — runs as a Vercel serverless function
server.js       Local development server (static frontend + API, port 3000)
db.js           Database layer: Turso (cloud) when TURSO_URL is set, otherwise local SQLite
vercel.json     Routes /api/* to the serverless function
index.html      Frontend (unchanged design)
downloads/      PDF resources served statically at /downloads/<file>
data/           Local SQLite database (gitignored, dev only)
.env            Local secrets (gitignored)
```

## Local development

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the SMTP credentials (see below).
3. `npm start` → http://localhost:3000

Without `TURSO_URL` the site uses a local SQLite file at `data/ufabwu.db`.
Without SMTP credentials emails are saved to the `email-outbox/` folder instead.

## Deploying to Vercel (first time)

### 1. Create a Turso database (free)

1. Go to https://turso.tech and create a free account.
2. In the dashboard click **Create Database**, name it `ufabwu`, and copy:
   - the **Database URL** (looks like `libsql://ufabwu-<org>.turso.io`)
   - the **Auth Token** (click *Generate Token*)
3. Keep both values — you need them in step 3.

### 2. Push this folder to GitHub

1. Create a free account/repository on https://github.com (the repo can be private).
2. Upload the project files. The `.gitignore` already excludes `.env`, `data/`,
   `node_modules/`, and `email-outbox/` — do **not** upload `.env`.

### 3. Import into Vercel

1. Go to https://vercel.com and sign up with your GitHub account (free Hobby plan is fine
   — the site is non-commercial).
2. Click **Add New → Project**, select the GitHub repository, keep the default build
   settings (Framework Preset: **Other**), and click **Deploy**.
3. On the **Settings → Environment Variables** page of the project, add these variables
   (use the Turso values and your Brevo SMTP values from step 1 and `.env`):

| Variable            | Value                                             |
|---------------------|---------------------------------------------------|
| `TURSO_URL`         | `libsql://ufabwu-<org>.turso.io`                  |
| `TURSO_AUTH_TOKEN`  | your Turso token                                  |
| `SMTP_HOST`         | `smtp-relay.brevo.com`                            |
| `SMTP_PORT`         | `587`                                             |
| `SMTP_USER`         | your Brevo SMTP login                             |
| `SMTP_PASS`         | your Brevo SMTP key                               |
| `SMTP_SECURE`       | `false`                                           |
| `MAIL_FROM`         | sender name/address, e.g. `UFABWU <you@gmail.com>` |
| `SECRETARIAT_EMAIL` | admin inboxes receiving notifications, comma-separated: `wafananelson3@gmail.com, olivejanetgidudu@gmail.com, ambolive@yahoo.com` |

4. Click **Redeploy** (or just Deploy again). Vercel installs dependencies and serves
   `index.html` as the site and `api/index.js` as the backend automatically.

The live site is at `https://<your-project>.vercel.app`.

## Later changes

Push new commits to the GitHub repo and Vercel redeploys automatically.
Replace the placeholder PDFs in `downloads/` at any time (keep the same filenames).
