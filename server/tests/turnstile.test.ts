import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestServer, TestServer, TEST_APP_ORIGIN } from './helpers/server.js';
import { loadConfig, ConfigError } from '../src/config.js';

const SITE_KEY = 'test-site-key';
const SECRET_KEY = 'test-secret-key';
const realFetch = globalThis.fetch;

/** Stubs Cloudflare's siteverify; supertest does not use fetch, so only the server's call is caught. */
function stubSiteverify(answer: () => Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
    String(input).includes('challenges.cloudflare.com') ? answer() : realFetch(input, init)
  );
}

const ok = (success: boolean) => () => Promise.resolve(Response.json({ success, 'error-codes': success ? [] : ['invalid-input-response'] }));

const account = { username: 'turnstile_user', email: 'turnstile@example.com', password: 'CorrectHorse9!battery' };

describe('Turnstile on login and register', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({ config: { turnstile: { siteKey: SITE_KEY, secretKey: SECRET_KEY } } });
  });

  afterAll(async () => {
    await server.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const post = (path: string, body: object) =>
    request(server.app).post(path).set('Origin', TEST_APP_ORIGIN).send(body);

  it('hands out the public site key, and allows Cloudflare in the CSP', async () => {
    const res = await request(server.app).get('/api/auth/turnstile');
    expect(res.body).toEqual({ siteKey: SITE_KEY });
    expect(res.headers['content-security-policy']).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(res.headers['content-security-policy']).toContain('https://challenges.cloudflare.com');
  });

  it('refuses a request without a token, without calling Cloudflare', async () => {
    const siteverify = stubSiteverify(ok(true));
    const res = await post('/api/auth/register', account);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CAPTCHA_FAILED');
    expect(siteverify).not.toHaveBeenCalled();
  });

  it('refuses a token Cloudflare rejects, and fails closed when Cloudflare is unreachable', async () => {
    stubSiteverify(ok(false));
    expect((await post('/api/auth/login', { emailOrUsername: 'x', password: 'y', turnstileToken: 'bad' })).body.code).toBe('CAPTCHA_FAILED');

    vi.restoreAllMocks();
    stubSiteverify(() => Promise.reject(new Error('network down')));
    expect((await post('/api/auth/login', { emailOrUsername: 'x', password: 'y', turnstileToken: 't' })).body.code).toBe('CAPTCHA_FAILED');
  });

  it('lets a verified register and login through, sending the secret and token', async () => {
    const siteverify = stubSiteverify(ok(true));
    expect((await post('/api/auth/register', { ...account, turnstileToken: 'good' })).status).toBe(201);
    expect((await post('/api/auth/login', { emailOrUsername: account.username, password: account.password, turnstileToken: 'good' })).status).toBe(200);

    const body = siteverify.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('secret')).toBe(SECRET_KEY);
    expect(body.get('response')).toBe('good');
  });
});

describe('Turnstile off', () => {
  it('reports no site key and needs no token', async () => {
    const server = await createTestServer();
    try {
      expect((await request(server.app).get('/api/auth/turnstile')).body).toEqual({ siteKey: null });
      const res = await request(server.app).post('/api/auth/register').set('Origin', TEST_APP_ORIGIN).send({ ...account, username: 'no_turnstile', email: 'none@example.com' });
      expect(res.status).toBe(201);
    } finally {
      await server.close();
    }
  });

  it('refuses only one of the two keys', () => {
    const env = { NODE_ENV: 'test', DATABASE_URL: 'memory:', APP_ORIGIN: TEST_APP_ORIGIN };
    expect(() => loadConfig({ ...env, TURNSTILE_SITE_KEY: SITE_KEY })).toThrow(ConfigError);
    expect(() => loadConfig({ ...env, TURNSTILE_SECRET_KEY: SECRET_KEY })).toThrow(ConfigError);
    expect(loadConfig({ ...env, TURNSTILE_SITE_KEY: SITE_KEY, TURNSTILE_SECRET_KEY: SECRET_KEY }).turnstile).toEqual({ siteKey: SITE_KEY, secretKey: SECRET_KEY });
  });
});
