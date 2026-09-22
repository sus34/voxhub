import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');

const app = express();
app.use(express.json({ limit: '4kb' }));

// The server is on the public internet with one shared password, so brute force
// protection matters even for five people.
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

function rateLimited(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(ip, { first: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function passwordMatches(given) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(config.serverPassword);
  // timingSafeEqual throws on length mismatch, so compare lengths separately.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const NAME_RE = /^[\p{L}\p{N} _.-]{1,24}$/u;

// "Remember me" without a user database: after one password login the client
// gets a signed ticket with its name and an expiry, and trades it for access
// next time. The password itself never gets stored on the device.
//
// The signing key is derived from the server password, so changing
// SERVER_PASSWORD signs every remembered device out at once — the right
// reaction if the password ever leaks.
const rememberKey = createHmac('sha256', config.livekitApiSecret)
  .update('voxhub-remember:' + config.serverPassword)
  .digest();

function signRemember(name) {
  const payload = Buffer.from(
    JSON.stringify({ n: name, exp: Date.now() + config.rememberDays * 86_400_000 }),
  ).toString('base64url');
  const sig = createHmac('sha256', rememberKey).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Returns the name the ticket was issued to, or null if it is forged or expired. */
function verifyRemember(ticket) {
  if (typeof ticket !== 'string' || ticket.length > 512) return null;
  const [payload, sig] = ticket.split('.');
  if (!payload || !sig) return null;

  const expected = createHmac('sha256', rememberKey).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof data.n !== 'string' || !NAME_RE.test(data.n)) return null;
  if (!(data.exp > Date.now())) return null;
  return data.n;
}

app.get('/api/config', (_req, res) => {
  res.json({ rooms: config.rooms });
});

// The desktop app polls this to notice it is out of date, so a new build does
// not have to be passed around by hand in Telegram.
app.get('/api/version', (_req, res) => {
  res.json({
    desktop: config.desktopVersion,
    downloadPath: '/download/voxhub.exe',
  });
});

// Serve the built desktop app. Long download, no caching games.
app.use(
  '/download',
  express.static(path.resolve(__dirname, '../../download'), {
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);

app.post('/api/join', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Слишком много попыток, подожди 10 минут' });
  }

  const { name, password, room, remember } = req.body ?? {};

  let who;
  if (remember !== undefined) {
    // A remembered device: the name comes from the ticket, not from the body,
    // so a ticket cannot be reused to join under someone else's name.
    who = verifyRemember(remember);
    if (!who) {
      return res.status(401).json({ error: 'Вход устарел — введи пароль ещё раз', expired: true });
    }
  } else {
    if (!passwordMatches(password)) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      return res.status(400).json({ error: 'Имя: 1-24 символа, буквы/цифры/пробел/._-' });
    }
    who = name;
  }

  if (!config.rooms.includes(room)) {
    return res.status(400).json({ error: 'Нет такого канала' });
  }

  attempts.delete(ip);

  const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity: who,
    name: who,
    ttl: config.tokenTtl,
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  // A fresh ticket on every join keeps the expiry sliding: people who use it
  // regularly never see the password prompt again.
  res.json({
    token: await at.toJwt(),
    url: config.livekitUrl,
    room,
    name: who,
    remember: signRemember(who),
  });
});

// Serve the built client if it exists; in dev the Vite server handles this.
app.use(express.static(webDist));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Client not built yet — run: npm run build in web/');
  });
});

app.listen(config.port, () => {
  console.log(`[voxhub] token server on :${config.port}`);
  console.log(`[voxhub] SFU: ${config.livekitUrl}`);
  console.log(`[voxhub] channels: ${config.rooms.join(', ')}`);
});
