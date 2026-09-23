import { useEffect, useState } from 'react';

/**
 * Two kinds of update, checked on start, every 15 minutes and on coming back
 * to the window:
 *
 * - desktop: a new voxhub.exe. Only the shell needs it (permissions, screen
 *   picker); it asks the server's /api/version through the preload bridge.
 * - web: a new interface. The exe loads the UI from the server, so most
 *   updates land here — but an open window keeps running the old bundle until
 *   it reloads. Detected by comparing our bundle name with the one the
 *   server's index.html points at now.
 */

const EVERY_MS = 15 * 60 * 1000;
const FOCUS_MIN_GAP_MS = 30 * 1000;
const BUNDLE_RE = /assets\/index-[\w-]+\.js/;

/** "0.10.0" > "0.9.1" — plain string compare gets that wrong. */
export function isNewer(latest, current) {
  const a = String(latest).split('.').map(Number);
  const b = String(current).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

function loadedBundle() {
  const s = [...document.scripts].map((x) => x.src).find((src) => BUNDLE_RE.test(src));
  return s ? s.match(BUNDLE_RE)[0] : null;
}

export function useUpdates() {
  const [desktop, setDesktop] = useState(null); // { current, latest, url }
  const [web, setWeb] = useState(false);

  useEffect(() => {
    let alive = true;
    const mine = loadedBundle(); // null in `vite dev` — nothing to compare

    async function check() {
      if (window.voxhub && window.voxhub.checkUpdate) {
        try {
          const info = await window.voxhub.checkUpdate();
          if (alive && info && info.ok && info.latest && isNewer(info.latest, info.current)) {
            setDesktop(info);
          }
        } catch {
          /* offline — try again next round */
        }
      }

      if (mine) {
        try {
          const html = await fetch('/', { cache: 'no-store' }).then((r) => r.text());
          const live = html.match(BUNDLE_RE);
          if (alive && live && live[0] !== mine) setWeb(true);
        } catch {
          /* offline */
        }
      }
    }

    // Also when you come back to the window — that's when you'd notice anyway.
    let last = 0;
    function maybeCheck() {
      if (Date.now() - last < FOCUS_MIN_GAP_MS) return;
      last = Date.now();
      check();
    }

    maybeCheck();
    const t = setInterval(maybeCheck, EVERY_MS);
    window.addEventListener('focus', maybeCheck);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('focus', maybeCheck);
    };
  }, []);

  return { desktop, web };
}

const REJOIN_KEY = 'voxhub.rejoin';

/** Reload into the new interface and come straight back to this channel. */
export function reloadInto(channelId) {
  try {
    if (channelId) sessionStorage.setItem(REJOIN_KEY, channelId);
  } catch {
    /* then it just lands on the login screen */
  }
  location.reload();
}

/** The channel to rejoin after such a reload — read once. */
export function takeRejoin() {
  try {
    const room = sessionStorage.getItem(REJOIN_KEY);
    sessionStorage.removeItem(REJOIN_KEY);
    return room;
  } catch {
    return null;
  }
}
