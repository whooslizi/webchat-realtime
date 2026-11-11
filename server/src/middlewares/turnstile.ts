import type { Request, Response, NextFunction } from 'express';
import { ERROR_CODES, TurnstileConfigDto } from '@webchat/shared';
import { getServerContext } from '../context.js';
import { AppError } from '../lib/errors.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SITEVERIFY_TIMEOUT_MS = 5000;

/** `GET /api/auth/turnstile`: tells the client whether to show the widget, and with which site key. */
export function turnstileConfig(req: Request, res: Response): void {
  const body: TurnstileConfigDto = { siteKey: getServerContext(req).config.turnstile?.siteKey ?? null };
  res.json(body);
}

/**
 * Refuses a login or register whose `turnstileToken` Cloudflare does not confirm. A no-op when
 * Turnstile is off. Fails closed: if Cloudflare cannot be reached, the request is refused too.
 */
export async function requireTurnstile(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const { turnstile } = getServerContext(req).config;
  if (!turnstile) return next();

  const token = req.body?.turnstileToken;
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    throw new AppError(400, ERROR_CODES.CAPTCHA_FAILED, 'Complete the verification and try again');
  }

  let outcome: { success?: boolean; 'error-codes'?: string[] };
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret: turnstile.secretKey, response: token, remoteip: req.ip ?? '' }),
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    outcome = (await res.json()) as typeof outcome;
  } catch (err) {
    req.log.error({ err }, 'Turnstile siteverify request failed');
    outcome = { success: false };
  }

  if (outcome.success !== true) {
    req.log.warn({ errorCodes: outcome['error-codes'] }, 'Turnstile verification refused');
    throw new AppError(400, ERROR_CODES.CAPTCHA_FAILED, 'Verification failed. Please try again');
  }
  next();
}
