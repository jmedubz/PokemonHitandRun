import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find #root element');

let fatalOverlayShown = false;

/**
 * Never leave the player staring at a blank white page again. If React, the
 * render loop, or an unhandled promise crashes, show the useful error directly
 * in the browser so it can be screenshotted and fixed in the next pass.
 */
function showFatalError(reason: unknown, source: string) {
  if (fatalOverlayShown) return;
  fatalOverlayShown = true;

  const error = reason instanceof Error
    ? reason
    : new Error(typeof reason === 'string' ? reason : 'Unknown runtime error');

  console.error(`[Pokémon Hit & Run] ${source}:`, error);

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:999999',
    'background:#020617',
    'color:#f8fafc',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:24px',
    'font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'width:min(760px,100%)',
    'border:2px solid #ef4444',
    'border-radius:18px',
    'background:#0f172a',
    'padding:22px',
    'box-shadow:0 0 50px rgba(239,68,68,.25)',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'GAME ERROR — NO MORE MYSTERY WHITE SCREEN';
  title.style.cssText = 'color:#fca5a5;font-weight:900;font-size:22px;margin-bottom:6px';

  const intro = document.createElement('div');
  intro.textContent = `${source}. Screenshot the error below and send it to me.`;
  intro.style.cssText = 'color:#cbd5e1;font-size:13px;margin-bottom:14px';

  const pre = document.createElement('pre');
  pre.textContent = `${error.name}: ${error.message}\n\n${error.stack ?? ''}`;
  pre.style.cssText = [
    'white-space:pre-wrap',
    'overflow-wrap:anywhere',
    'max-height:45vh',
    'overflow:auto',
    'background:#020617',
    'border:1px solid #334155',
    'border-radius:12px',
    'padding:14px',
    'color:#fecaca',
    'font-size:12px',
    'line-height:1.45',
  ].join(';');

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:14px';

  const reload = document.createElement('button');
  reload.textContent = 'Reload Game';
  reload.style.cssText = 'border:0;border-radius:10px;padding:10px 14px;background:#f59e0b;color:#111827;font-weight:900;cursor:pointer';
  reload.onclick = () => window.location.reload();

  const reset = document.createElement('button');
  reset.textContent = 'Reset Save + Reload';
  reset.style.cssText = 'border:1px solid #475569;border-radius:10px;padding:10px 14px;background:#1e293b;color:#e2e8f0;font-weight:800;cursor:pointer';
  reset.onclick = () => {
    try {
      localStorage.removeItem('pokemon_hit_run_save_v3');
    } catch {
      // Reload is still useful even if storage access is blocked.
    }
    window.location.reload();
  };

  buttons.append(reload, reset);
  card.append(title, intro, pre, buttons);
  overlay.append(card);
  document.body.append(overlay);
}

function isIgnoredRuntimeError(reason: unknown, sourceUrl?: string) {
  const error = reason instanceof Error ? reason : null;
  const message = String(error?.message ?? reason ?? '');
  const stack = String(error?.stack ?? '');
  const source = String(sourceUrl ?? '');

  const extensionOrigin =
    source.includes('chrome-extension://') ||
    source.includes('moz-extension://') ||
    source.includes('safari-web-extension://') ||
    stack.includes('chrome-extension://') ||
    stack.includes('moz-extension://') ||
    stack.includes('safari-web-extension://');

  // MetaMask can inject an in-page provider and reject a promise even though the
  // game never requested a wallet connection. Do not treat an extension failure
  // as a fatal Pokémon Hit & Run crash.
  const injectedWalletNoise =
    /metamask/i.test(message) ||
    /metamask/i.test(stack) ||
    /failed to connect to metamask/i.test(message);

  // Vite HMR dev server WebSocket errors are expected when HMR is disabled in the
  // sandboxed preview environment (DISABLE_HMR=true). These are benign and must
  // never interrupt gameplay.
  const viteHmrNoise =
    /websocket/i.test(message) ||
    /websocket/i.test(stack) ||
    /vite/i.test(message) ||
    /vite/i.test(stack) ||
    source.includes('@vite/client') ||
    stack.includes('@vite/client');

  return extensionOrigin || injectedWalletNoise || viteHmrNoise;
}

window.addEventListener('error', (event) => {
  if (isIgnoredRuntimeError(event.error ?? event.message, event.filename)) {
    console.warn('[Pokémon Hit & Run] Ignored runtime error:', event.error ?? event.message);
    return;
  }

  if (event.error) {
    showFatalError(event.error, 'Runtime error');
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (isIgnoredRuntimeError(event.reason)) {
    // Prevent benign Vite HMR or extension rejections from triggering the fatal error overlay
    event.preventDefault();
    console.warn('[Pokémon Hit & Run] Ignored promise rejection:', event.reason);
    return;
  }

  showFatalError(event.reason, 'Unhandled promise rejection');
});

const root = createRoot(rootElement, {
  onUncaughtError: (error) => showFatalError(error, 'React render error'),
  onRecoverableError: (error) => console.warn('[Pokémon Hit & Run] React recovered from:', error),
});

root.render(<App />);
