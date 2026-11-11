import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiFetch';
import { TurnstileWidget } from './TurnstileWidget';
import { Lock, Mail, User, AlertCircle, Info, Loader2, ArrowRight } from 'lucide-react';
import { loginSchema, registerSchema, parseWithSchema, FieldError, TurnstileConfigDto } from '@webchat/shared';

type FieldErrors = Record<string, string>;

function toFieldErrors(fields: FieldError[]): FieldErrors {
  return Object.fromEntries(fields.map((f) => [f.field, f.message]));
}

interface FieldLabelProps {
  htmlFor: string;
  label: string;
  error?: string;
  className: string;
}

/**
 * A field's label row. Its validation message shares the row with the label, so showing or
 * clearing a message never moves anything inside the fixed form (Zero-Shift Auth Architecture).
 */
const FieldLabel: React.FC<FieldLabelProps> = ({ htmlFor, label, error, className }) => (
  <div className={`flex items-baseline justify-between gap-2 ml-1 h-4 ${className}`}>
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-google-grey700 shrink-0">
      {label}
    </label>
    {error && (
      <span id={`${htmlFor}-error`} title={error} className="text-[10px] leading-4 font-medium text-google-red truncate">
        {error}
      </span>
    )}
  </div>
);

const invalidProps = (id: string, error?: string) =>
  error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {};

export const AuthScreen: React.FC = () => {
  // `sessionNotice`: why the user was signed out (Session revoked or expired, or signed out everywhere).
  const { login, register, sessionNotice } = useAuth();
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [emailOrUsername, setEmailOrUsername] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  // Turnstile: on only when the server has keys. A token is single-use, so every attempt resets it.
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/auth/turnstile')
      .then((res) => (res.ok ? res.json() : { siteKey: null }))
      .then(({ siteKey }: TurnstileConfigDto) => {
        if (!cancelled) setTurnstileSiteKey(siteKey);
      })
      .catch((err) => console.error('Turnstile config failed:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Null when the attempt may go ahead; otherwise the reason it may not. */
  const turnstileBlocker = (): string | null =>
    turnstileSiteKey && !turnstileToken ? 'Verifying you are human. Try again in a moment' : null;

  const clearFieldError = (field: string) =>
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const rest = { ...current };
      delete rest[field];
      return rest;
    });

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const credentials = { emailOrUsername: emailOrUsername.trim(), password };
    const parsed = parseWithSchema(loginSchema, credentials);
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.fields));
      return;
    }
    setFieldErrors({});
    const blocker = turnstileBlocker();
    if (blocker) {
      setError(blocker);
      return;
    }
    setIsSubmitting(true);

    try {
      await login({ ...credentials, turnstileToken: turnstileToken ?? undefined });
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      if (turnstileSiteKey) setTurnstileResetKey((key) => key + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // The same shared rules the server enforces; the server stays the authority.
    const account = { username: username.trim(), email: email.trim(), password };
    const parsed = parseWithSchema(registerSchema, account);
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.fields));
      return;
    }
    setFieldErrors({});
    const blocker = turnstileBlocker();
    if (blocker) {
      setError(blocker);
      return;
    }
    setIsSubmitting(true);

    try {
      await register({ ...account, turnstileToken: turnstileToken ?? undefined });
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      if (turnstileSiteKey) setTurnstileResetKey((key) => key + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="screen-auth"
      className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-50/60 via-white to-amber-50/40 overflow-y-auto"
    >
      {/* Top-Anchored Card with Strict Fixed Height = 100% ZERO SHIFT */}
      <div
        className="auth-card-lock w-full max-w-[420px] bg-white rounded-3xl shadow-xl border border-google-grey200 overflow-hidden shrink-0 flex flex-col relative"
        style={{ height: '540px', maxHeight: '90vh' }}
      >
        {/* Solid Google Blue Header Block (Fixed Height: 160px) */}
        <div
          className="bg-google-blue px-6 py-5 text-center text-white shrink-0 relative flex flex-col items-center justify-center"
          style={{ height: '160px' }}
        >
          {/* White Rounded Badge with Large, Sharp GDG Brackets Logo */}
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white p-2 shadow-md mb-2">
            <img
              src="/assets/brand/logo-gdg-clean.webp"
              alt="GDG Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-none">
            GDG-HUST
          </h1>
          <p className="text-[11px] sm:text-xs text-blue-100 font-medium tracking-tight mt-1 max-w-[280px] leading-tight">
            Google Developer Groups on Campus • Hanoi University of Science and Technology
          </p>
        </div>

        {/* Form Body with EXACT SAME HEIGHT & FIXED BUTTON ANCHOR (Zero Pixel Movement) */}
        <div
          className="p-6 sm:p-7 flex-1 flex flex-col justify-between"
          style={{ height: '380px' }}
        >
          {/* Tabs: Sign In / Create Account (Height: 40px) */}
          <div
            className="flex p-1 bg-google-grey100 rounded-full mb-4 border border-google-grey200 shrink-0 h-10"
            role="tablist"
            aria-label="Authentication modes"
          >
            <button
              id="tab-auth-signin"
              type="button"
              role="tab"
              aria-selected={!isRegister}
              aria-controls="panel-signin"
              onClick={() => {
                setIsRegister(false);
                setError(null);
                setFieldErrors({});
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                !isRegister
                  ? 'bg-white text-google-blue shadow-xs'
                  : 'text-google-grey700 hover:text-google-grey900'
              }`}
            >
              Sign In
            </button>
            <button
              id="tab-auth-register"
              type="button"
              role="tab"
              aria-selected={isRegister}
              aria-controls="panel-register"
              onClick={() => {
                setIsRegister(true);
                setError(null);
                setFieldErrors({});
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                isRegister
                  ? 'bg-white text-google-blue shadow-xs'
                  : 'text-google-grey700 hover:text-google-grey900'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* RIGID FORM CONTAINER: Holds panels at exact same coordinates */}
          <div
            className="relative flex-1"
            style={{ height: '275px' }}
            data-testid="auth-form-container"
          >
            {/* TAB 1: SIGN IN FORM (Pinned to exact coordinates) */}
            <div
              id="panel-signin"
              role="tabpanel"
              aria-labelledby="tab-auth-signin"
              hidden={isRegister}
              className={`absolute inset-0 flex flex-col justify-between ${
                isRegister ? 'hidden' : ''
              }`}
            >
              <form onSubmit={handleLoginSubmit} noValidate className="h-full flex flex-col justify-between">
                <div className="space-y-4 pt-1">
                  {error && !isRegister && (
                    <div
                      role="alert"
                      className="p-2 rounded-xl bg-google-red-subtle border border-google-red/20 flex items-center gap-1.5 text-google-red text-xs shrink-0"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{error}</span>
                    </div>
                  )}
                  {!error && sessionNotice && !isRegister && (
                    <div
                      role="status"
                      title={sessionNotice}
                      className="p-2 rounded-xl bg-google-blue-subtle border border-google-blue/20 flex items-center gap-1.5 text-google-blue text-xs shrink-0"
                    >
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{sessionNotice}</span>
                    </div>
                  )}

                  <div>
                    <FieldLabel
                      htmlFor="login-username"
                      label="Email or Username"
                      error={fieldErrors.emailOrUsername}
                      className="mb-1"
                    />
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-3 text-google-grey700" />
                      <input
                        id="login-username"
                        {...invalidProps('login-username', fieldErrors.emailOrUsername)}
                        type="text"
                        value={emailOrUsername}
                        onChange={(e) => {
                          setEmailOrUsername(e.target.value);
                          clearFieldError('emailOrUsername');
                        }}
                        placeholder="alex or alex@gdghust.dev"
                        className="w-full pl-10 pr-4 py-2.5 rounded-full border border-google-grey300 bg-google-grey50 focus:bg-white focus:outline-none focus:border-google-blue focus:ring-2 focus:ring-google-blue/20 text-xs sm:text-sm transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel
                      htmlFor="login-password"
                      label="Password"
                      error={fieldErrors.password}
                      className="mb-1"
                    />
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-3 text-google-grey700" />
                      <input
                        id="login-password"
                        {...invalidProps('login-password', fieldErrors.password)}
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          clearFieldError('password');
                        }}
                        placeholder="••••••••••••"
                        className="w-full pl-10 pr-4 py-2.5 rounded-full border border-google-grey300 bg-google-grey50 focus:bg-white focus:outline-none focus:border-google-blue focus:ring-2 focus:ring-google-blue/20 text-xs sm:text-sm transition-all"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* SUBMIT BUTTON PINNED AT THE EXACT SAME PIXEL POSITION */}
                <div className="pb-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 rounded-full bg-google-blue hover:bg-google-blue-hover text-white font-semibold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Signing In...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In to GDG-HUST</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* TAB 2: CREATE ACCOUNT FORM (Pinned to exact coordinates, Button 100% visible) */}
            <div
              id="panel-register"
              role="tabpanel"
              aria-labelledby="tab-auth-register"
              hidden={!isRegister}
              className={`absolute inset-0 flex flex-col justify-between ${
                !isRegister ? 'hidden' : ''
              }`}
            >
              <form onSubmit={handleRegisterSubmit} noValidate className="h-full flex flex-col justify-between">
                <div className="space-y-2.5">
                  {error && isRegister && (
                    <div
                      role="alert"
                      className="p-1.5 rounded-xl bg-google-red-subtle border border-google-red/20 flex items-center gap-1.5 text-google-red text-xs shrink-0"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{error}</span>
                    </div>
                  )}

                  <div>
                    <FieldLabel
                      htmlFor="reg-username"
                      label="Username"
                      error={fieldErrors.username}
                      className="mb-0.5"
                    />
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3.5 top-2.5 text-google-grey700" />
                      <input
                        id="reg-username"
                        {...invalidProps('reg-username', fieldErrors.username)}
                        type="text"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          clearFieldError('username');
                        }}
                        placeholder="e.g. duynat_dev"
                        className="w-full pl-10 pr-4 py-2 rounded-full border border-google-grey300 bg-google-grey50 focus:bg-white focus:outline-none focus:border-google-blue focus:ring-2 focus:ring-google-blue/20 text-xs sm:text-sm transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel
                      htmlFor="reg-email"
                      label="Email Address"
                      error={fieldErrors.email}
                      className="mb-0.5"
                    />
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-2.5 text-google-grey700" />
                      <input
                        id="reg-email"
                        {...invalidProps('reg-email', fieldErrors.email)}
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          clearFieldError('email');
                        }}
                        placeholder="alex@gdghust.dev"
                        className="w-full pl-10 pr-4 py-2 rounded-full border border-google-grey300 bg-google-grey50 focus:bg-white focus:outline-none focus:border-google-blue focus:ring-2 focus:ring-google-blue/20 text-xs sm:text-sm transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel
                      htmlFor="reg-password"
                      label="Password"
                      error={fieldErrors.password}
                      className="mb-0.5"
                    />
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-2.5 text-google-grey700" />
                      <input
                        id="reg-password"
                        {...invalidProps('reg-password', fieldErrors.password)}
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          clearFieldError('password');
                        }}
                        placeholder="••••••••••••"
                        className="w-full pl-10 pr-4 py-2 rounded-full border border-google-grey300 bg-google-grey50 focus:bg-white focus:outline-none focus:border-google-blue focus:ring-2 focus:ring-google-blue/20 text-xs sm:text-sm transition-all"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* SUBMIT BUTTON PINNED AT THE EXACT SAME PIXEL POSITION */}
                <div className="pb-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 rounded-full bg-google-blue hover:bg-google-blue-hover text-white font-semibold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating Account...</span>
                      </>
                    ) : (
                      <>
                        <span>Create GDG-HUST Account</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      {/* Outside the fixed-height card, so the widget appearing never shifts the form. */}
      {turnstileSiteKey && (
        <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} resetKey={turnstileResetKey} />
      )}
    </div>
  );
};
