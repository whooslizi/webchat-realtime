import React, { useEffect, useRef } from 'react';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once per page. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile script failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface TurnstileWidgetProps {
  siteKey: string;
  /** The current token, or null when it expired, failed or was used. */
  onToken: (token: string | null) => void;
  /** Bump to get a fresh token: Cloudflare accepts each token only once. */
  resetKey: number;
}

/** Cloudflare Turnstile; only shows itself when Cloudflare wants the user to interact. */
export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({ siteKey, onToken, resetKey }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey === 0 || !widgetIdRef.current) return;
    onTokenRef.current(null);
    window.turnstile?.reset(widgetIdRef.current);
  }, [resetKey]);

  return <div ref={containerRef} className="mt-3 flex justify-center" />;
};
