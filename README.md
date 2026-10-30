# ResumeBoost (micro-SaaS starter)

Landing page + AI endpoint + free tier + Stripe Payment Link paywall. No npm dependencies (Node 20+).

## Run
1. Copy `.env.example` to `.env` and fill in values.
2. `node --env-file=.env server.js`
3. Open http://localhost:3000

## Customize
- Niche: edit `SYSTEM_PROMPT` in `server.js` (or env var) and the copy in `public/index.html`.
- Payments: create a Stripe Payment Link; after a customer pays, email them a code from `ACCESS_CODES`.

## Before real launch
Free-use counts and codes are in-memory/env based. Move to a database, per-user auth, and Stripe webhooks to issue codes automatically; add rate limiting and HTTPS.
