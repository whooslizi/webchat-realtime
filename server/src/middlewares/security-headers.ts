import type { RequestHandler } from 'express';
import helmet from 'helmet';
import type { AppConfig } from '../config.js';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * Origins (besides our own) that serve stored files: the Supabase project in production.
 * The local adapter serves `/uploads` from this same origin, so it adds nothing.
 */
function storageOrigins(config: AppConfig): string[] {
  return config.storage.provider === 'supabase' ? [new URL(config.storage.url).origin] : [];
}

/**
 * Content-Security-Policy for the single-host app (ADR 0010): only our own scripts and styles run,
 * images may also come from storage and Giphy, and the page cannot be framed by another site.
 * The Vite build has no inline `<script>` or `<style>`, and React sets `style` props through the
 * CSSOM, so `style-src 'self'` needs no `'unsafe-inline'`.
 */
function buildContentSecurityPolicy(config: AppConfig): Record<string, string[]> {
  const storage = storageOrigins(config);
  // The Turnstile widget is a script plus an iframe from Cloudflare, allowed only when it is on.
  const turnstile = config.turnstile ? [TURNSTILE_ORIGIN] : [];
  return {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...turnstile],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'blob:', ...storage, 'https://*.giphy.com'],
    'connect-src': ["'self'", ...storage],
    // Document previews open storage files in an iframe; with local storage they are same-origin.
    'frame-src': [...(storage.length > 0 ? storage : ["'self'"]), ...turnstile],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
}

/** Security headers for every response: SPA, API and static files alike. */
export function securityHeaders(config: AppConfig): RequestHandler[] {
  return [
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: buildContentSecurityPolicy(config) },
      strictTransportSecurity: { maxAge: ONE_YEAR_SECONDS, includeSubDomains: true },
      xContentTypeOptions: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xFrameOptions: { action: 'deny' },
      xXssProtection: true, // helmet sends `X-XSS-Protection: 0`, turning off the legacy auditor
      xPoweredBy: true, // helmet removes `X-Powered-By`
    }),
    (_req, res, next) => {
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      next();
    },
  ];
}
