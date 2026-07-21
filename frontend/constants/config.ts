/**
 * Environment-driven runtime configuration. Never read
 * `process.env.NEXT_PUBLIC_*` outside this file — import from here instead
 * so there is a single place to change defaults or add validation.
 */

// Development: falls back to the local FastAPI dev server.
// Production: set NEXT_PUBLIC_API_URL on Vercel to your deployed backend's
// HTTPS URL (see DEPLOYMENT.md). Must be set at build time — Next.js
// inlines NEXT_PUBLIC_* variables into the client bundle, so changing this
// requires a redeploy, not just an environment variable update.
export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export const APP_NAME = "CanoryAI";

// SEO/AEO config — single source of truth for every metadata surface
// (app/layout.tsx, app/page.tsx, JSON-LD, robots.ts, sitemap.ts). Update
// these here, not in the individual files, if the brand name or domain
// ever changes — see the naming discussion this was built alongside for
// why nothing is hardcoded to a specific brand name yet.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://canoryai.example.com";
export const SITE_TAGLINE = "The Legal Shield for Global Supply Chains";
export const SITE_DESCRIPTION =
  "AI-powered EUDR compliance software for enterprise commodity importers. Automated document extraction, satellite deforestation verification, and immutable audit trails — from supplier receipt to a defensible due diligence statement.";
export const TWITTER_HANDLE = "@canoryai"; // update once a real handle exists

// CanoryAI is an invite-only enterprise product — there is deliberately no
// self-serve signup (see components/auth/signup-form.tsx and
// onboarding-form.tsx). Every "create a workspace" entry point in the app
// is a mailto: link to this address instead of a form, so a prospect
// reaches a real person, not an unauthenticated account-creation flow.
// Set NEXT_PUBLIC_SALES_EMAIL on Vercel; this placeholder is a fallback
// for local development only.
export const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "sales@canoryai.example.com";

export const DEFAULT_WORKSPACE_NAME = "Acme Imports Ltd.";

export const REQUEST_TIMEOUT_MS = 120_000;
