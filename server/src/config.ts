import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ==========================================
// SERVER CONFIGURATION
// ==========================================
// The only place that interprets environment variables. Every other module receives
// the validated `AppConfig` (via the server factory) instead of reading `process.env`.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_CLIENT_DIST_PATH = path.resolve(__dirname, '../../client/dist');

const NODE_ENVS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const DEFAULT_PORT = 4000;
const MEMORY_DATABASE_URL = 'memory:';

export type NodeEnv = (typeof NODE_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

export type StorageConfig =
  | { provider: 'local' }
  | { provider: 'supabase'; url: string; secretKey: string; bucket: string };

export interface RateLimitRule {
  max: number;
  windowMs: number;
}

export interface RateLimitsConfig {
  loginFailures: RateLimitRule;
  register: RateLimitRule;
  upload: RateLimitRule;
  userSearch: RateLimitRule;
  gifs: RateLimitRule;
  roomCreate: RateLimitRule;
  messageSend: RateLimitRule;
  typing: RateLimitRule;
}

export interface TimingConfig {
  presenceGracePeriodMs: number;
  connectionStateRecoveryMs: number;
  signedUrlTtlSeconds: number;
  sessionIdleTtlMs: number;
  sessionAbsoluteTtlMs: number;
  /** Minimum gap between two writes of a Session's `lastActiveAt`. */
  sessionTouchIntervalMs: number;
  /** How often the Sessions of connected sockets are re-checked, to catch revocations by another process (the CLI). */
  sessionRecheckIntervalMs: number;
}

export interface UploadsConfig {
  /**
   * Largest image (width x height) an upload may declare. Decoding takes about 4 bytes per pixel,
   * so a small file declaring a huge image could exhaust memory (a decompression bomb).
   */
  maxImagePixels: number;
}

/** Cloudflare Turnstile keys; the site key is public, the secret key stays on the server. */
export interface TurnstileConfig {
  siteKey: string;
  secretKey: string;
}

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  /** Origin the browser sees, e.g. `https://webchat-realtime.onrender.com`. */
  appOrigin: string;
  /** Postgres connection string, or `memory:` (PGlite) under `NODE_ENV=test`. */
  databaseUrl: string;
  logLevel: LogLevel;
  giphyApiKey: string | null;
  /** Bot check on login and register, or null when it is off (no keys set). */
  turnstile: TurnstileConfig | null;
  /** Built SPA directory to serve, or null when there is no build (dev/test only). */
  clientDistPath: string | null;
  storage: StorageConfig;
  rateLimits: RateLimitsConfig;
  timing: TimingConfig;
  uploads: UploadsConfig;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEFAULT_RATE_LIMITS: RateLimitsConfig = {
  loginFailures: { max: 10, windowMs: 15 * MINUTE },
  register: { max: 5, windowMs: HOUR },
  upload: { max: 20, windowMs: 10 * MINUTE },
  userSearch: { max: 30, windowMs: MINUTE },
  gifs: { max: 30, windowMs: MINUTE },
  roomCreate: { max: 10, windowMs: HOUR },
  messageSend: { max: 10, windowMs: 10 * 1000 },
  typing: { max: 1, windowMs: 1000 },
};

export const DEFAULT_TIMING: TimingConfig = {
  presenceGracePeriodMs: 5000,
  connectionStateRecoveryMs: 2 * MINUTE,
  signedUrlTtlSeconds: 3600,
  sessionIdleTtlMs: 7 * DAY,
  sessionAbsoluteTtlMs: 30 * DAY,
  sessionTouchIntervalMs: 5 * MINUTE,
  sessionRecheckIntervalMs: MINUTE,
};

export const DEFAULT_UPLOADS: UploadsConfig = {
  // 40 MP (e.g. 8000x5000, above any phone camera) decodes to about 160 MB: safe on a 512 MB
  // instance, unlike sharp's own default of about 268 MP (over 1 GB).
  maxImagePixels: 40_000_000,
};

export interface ConfigIssue {
  variable: string;
  problem: string;
}

export class ConfigError extends Error {
  readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[]) {
    super(`Invalid server configuration:\n${issues.map((issue) => `  - ${issue.variable}: ${issue.problem}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

export interface LoadConfigOptions {
  /** Where the client build is expected; overridable so tests need no real build. */
  clientDistPath?: string;
}

type Env = Record<string, string | undefined>;

function read(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function hasClientBuild(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'index.html'));
}

/**
 * Builds the typed server configuration from an environment object.
 * Throws a `ConfigError` listing every invalid variable. Never falls back to a default secret,
 * and error messages never echo secret values.
 */
export function loadConfig(env: Env, options: LoadConfigOptions = {}): AppConfig {
  const issues: ConfigIssue[] = [];
  const fail = (variable: string, problem: string) => issues.push({ variable, problem });

  // NODE_ENV
  const rawNodeEnv = read(env, 'NODE_ENV') ?? 'development';
  let nodeEnv: NodeEnv = 'development';
  if ((NODE_ENVS as readonly string[]).includes(rawNodeEnv)) {
    nodeEnv = rawNodeEnv as NodeEnv;
  } else {
    fail('NODE_ENV', `must be one of ${NODE_ENVS.join(', ')}`);
  }
  const isProduction = nodeEnv === 'production';

  // PORT
  let port = DEFAULT_PORT;
  const rawPort = read(env, 'PORT');
  if (rawPort !== undefined) {
    const parsed = Number(rawPort);
    if (/^\d+$/.test(rawPort) && parsed <= 65535) {
      port = parsed;
    } else {
      fail('PORT', 'must be an integer between 0 and 65535');
    }
  }

  // APP_ORIGIN
  let appOrigin = '';
  const rawOrigin = read(env, 'APP_ORIGIN');
  if (!rawOrigin) {
    fail('APP_ORIGIN', 'is required (the origin the browser sees, e.g. http://localhost:5173)');
  } else {
    let url: URL | null = null;
    try {
      url = new URL(rawOrigin);
    } catch {
      url = null;
    }
    const isBareOrigin = url !== null && ['http:', 'https:'].includes(url.protocol) && rawOrigin.replace(/\/$/, '') === url.origin;
    if (url && isBareOrigin) {
      appOrigin = url.origin;
    } else {
      fail('APP_ORIGIN', 'must be a bare http(s) origin without a path, e.g. https://example.com');
    }
  }

  // DATABASE_URL
  let databaseUrl = '';
  const rawDatabaseUrl = read(env, 'DATABASE_URL');
  if (!rawDatabaseUrl) {
    fail('DATABASE_URL', 'is required');
  } else if (rawDatabaseUrl === MEMORY_DATABASE_URL) {
    if (nodeEnv === 'test') {
      databaseUrl = rawDatabaseUrl;
    } else {
      fail('DATABASE_URL', `"${MEMORY_DATABASE_URL}" is only allowed when NODE_ENV=test`);
    }
  } else if (/^postgres(ql)?:\/\//.test(rawDatabaseUrl)) {
    databaseUrl = rawDatabaseUrl;
  } else {
    fail('DATABASE_URL', 'must be a postgres:// or postgresql:// connection string');
  }

  // LOG_LEVEL
  let logLevel: LogLevel = 'info';
  const rawLogLevel = read(env, 'LOG_LEVEL');
  if (rawLogLevel !== undefined) {
    if ((LOG_LEVELS as readonly string[]).includes(rawLogLevel)) {
      logLevel = rawLogLevel as LogLevel;
    } else {
      fail('LOG_LEVEL', `must be one of ${LOG_LEVELS.join(', ')}`);
    }
  }

  // Storage
  let storage: StorageConfig = { provider: 'local' };
  const provider = (read(env, 'STORAGE_PROVIDER') ?? '').toLowerCase();
  if (isProduction && provider !== 'supabase') {
    fail('STORAGE_PROVIDER', 'must be "supabase" in production (local disk storage is not allowed)');
  } else if (provider === 'supabase') {
    const url = read(env, 'SUPABASE_URL');
    const secretKey = read(env, 'SUPABASE_SECRET_KEY');
    const bucket = read(env, 'SUPABASE_STORAGE_BUCKET');
    if (!url) fail('SUPABASE_URL', 'is required when STORAGE_PROVIDER=supabase');
    if (!secretKey) fail('SUPABASE_SECRET_KEY', 'is required when STORAGE_PROVIDER=supabase');
    if (!bucket) fail('SUPABASE_STORAGE_BUCKET', 'is required when STORAGE_PROVIDER=supabase');
    if (url && secretKey && bucket) storage = { provider: 'supabase', url, secretKey, bucket };
  } else if (provider !== '' && provider !== 'local') {
    fail('STORAGE_PROVIDER', 'must be one of local, supabase');
  }

  // Turnstile: both keys or neither
  let turnstile: TurnstileConfig | null = null;
  const turnstileSiteKey = read(env, 'TURNSTILE_SITE_KEY');
  const turnstileSecretKey = read(env, 'TURNSTILE_SECRET_KEY');
  if (turnstileSiteKey && turnstileSecretKey) {
    turnstile = { siteKey: turnstileSiteKey, secretKey: turnstileSecretKey };
  } else if (turnstileSiteKey) {
    fail('TURNSTILE_SECRET_KEY', 'is required when TURNSTILE_SITE_KEY is set');
  } else if (turnstileSecretKey) {
    fail('TURNSTILE_SITE_KEY', 'is required when TURNSTILE_SECRET_KEY is set');
  }

  // Client build
  const clientDistPath = options.clientDistPath ?? DEFAULT_CLIENT_DIST_PATH;
  const clientBuildExists = hasClientBuild(clientDistPath);
  if (isProduction && !clientBuildExists) {
    fail('client build', `no index.html found in ${clientDistPath}; run the client build before starting in production`);
  }

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  return {
    nodeEnv,
    port,
    appOrigin,
    databaseUrl,
    logLevel,
    giphyApiKey: read(env, 'GIPHY_API_KEY') ?? null,
    turnstile,
    clientDistPath: clientBuildExists ? clientDistPath : null,
    storage,
    rateLimits: structuredClone(DEFAULT_RATE_LIMITS),
    timing: { ...DEFAULT_TIMING },
    uploads: { ...DEFAULT_UPLOADS },
  };
}
