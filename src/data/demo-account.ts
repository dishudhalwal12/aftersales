/**
 * The published demo account (PRD §1.3 — "1-Click Judge Demo Login").
 *
 * It lives in its own module so the login route never imports the seeded
 * business corpus from `seed-facts.ts` into the server bundle.
 *
 * The password is public on purpose: the seed prints it, the README documents
 * it, and the account owns only seeded demo data. It is not a real user.
 */
export const DEMO_EMAIL = "judge@demo.aftersales.ai";
export const DEMO_PASSWORD = "judge-demo-41";
