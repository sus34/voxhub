import { timingSafeEqual } from 'node:crypto';
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

  const { name, password, room } = req.body ?? {};

  if (!passwordMatches(password)) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Имя: 1-24 символа, буквы/цифры/пробел/._-' });
  }
  if (!config.rooms.includes(room)) {
    return res.status(400).json({ error: 'Нет такого канала' });
  }

  attempts.delete(ip);

  const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity: name,
    name,
    ttl: config.tokenTtl,
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  res.json({ token: await at.toJwt(), url: config.livekitUrl, room, name });
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
