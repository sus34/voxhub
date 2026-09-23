import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import {
  hashPassword,
  hashToken,
  newId,
  newInviteCode,
  newSessionToken,
  verifyPassword,
} from './auth.js';

const NAME_RE = /^[\p{L}\p{N} _.-]{1,24}$/u;
const COOKIE = 'vx_session';
const DAY = 86_400_000;

// Brute-force protection: failed attempts per IP in a window; success resets.
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const nameKey = (name) => name.normalize('NFC').trim().toLowerCase();

function checkName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name.trim())) {
    throw new HttpError(400, 'Ник: 1–24 символа — буквы, цифры, пробел, точка, _ и -');
  }
  return name.normalize('NFC').trim();
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
    throw new HttpError(400, 'Пароль: от 6 символов');
  }
  return password;
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** "abcd efgh", "ABCD-EFGH" and "abcdefgh" are the same code. */
function codesMatch(given, expected) {
  const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const a = Buffer.from(norm(given));
  const b = Buffer.from(norm(expected));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * The HTTP API. Everything it needs comes in as arguments, so tests run it
 * against an in-memory database and a fake LiveKit.
 */
export function createApp({
  db,
  config,
  roomService,
  getSetupCode,
  webDist,
  downloadDir,
  now = () => Date.now(),
}) {
  const app = express();
  // Behind nginx on the same box: trust its X-Forwarded-* for IP and https.
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '4kb' }));

  const q = {
    space: db.prepare('SELECT id, name FROM spaces LIMIT 1'),
    userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
    userByKey: db.prepare('SELECT * FROM users WHERE space_id = ? AND name_key = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    insertSpace: db.prepare('INSERT INTO spaces (id, name, created_at) VALUES (?, ?, ?)'),
    insertUser: db.prepare(
      `INSERT INTO users (id, space_id, name, name_key, password_hash, role, created_at)
       VALUES (@id, @spaceId, @name, @nameKey, @hash, @role, @at)`,
    ),
    users: db.prepare(
      `SELECT id, name, role, banned_at, created_at FROM users
       WHERE space_id = ? ORDER BY role = 'owner' DESC, name_key`,
    ),
    setBanned: db.prepare('UPDATE users SET banned_at = ? WHERE id = ?'),

    insertSession: db.prepare(
      'INSERT INTO sessions (token_hash, user_id, space_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    ),
    session: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
    extendSession: db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),

    channels: db.prepare('SELECT id, name FROM channels WHERE space_id = ? ORDER BY position'),
    channel: db.prepare('SELECT id, name FROM channels WHERE id = ? AND space_id = ?'),
    insertChannel: db.prepare(
      'INSERT INTO channels (id, space_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
    ),

    invite: db.prepare('SELECT * FROM invites WHERE code = ?'),
    invites: db.prepare(
      `SELECT i.*, u.name AS creator FROM invites i JOIN users u ON u.id = i.created_by
       WHERE i.space_id = ? AND i.revoked_at IS NULL ORDER BY i.created_at DESC LIMIT 50`,
    ),
    insertInvite: db.prepare(
      `INSERT INTO invites (code, space_id, created_by, max_uses, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    useInvite: db.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?'),
    revokeInvite: db.prepare('UPDATE invites SET revoked_at = ? WHERE code = ? AND space_id = ?'),
  };

  // ---------- rate limiting ----------

  const attempts = new Map();

  function guard(req) {
    const t = now();
    const entry = attempts.get(req.ip);
    if (entry && t - entry.first <= WINDOW_MS && entry.count >= MAX_ATTEMPTS) {
      throw new HttpError(429, 'Слишком много попыток, подожди 10 минут');
    }
  }

  function failed(req) {
    const t = now();
    const entry = attempts.get(req.ip);
    if (!entry || t - entry.first > WINDOW_MS) attempts.set(req.ip, { first: t, count: 1 });
    else entry.count += 1;
  }

  // ---------- sessions ----------

  function startSession(req, res, user) {
    const token = newSessionToken();
    const t = now();
    q.insertSession.run(hashToken(token), user.id, user.space_id, t, t + config.sessionDays * DAY);
    setCookie(req, res, token);
    attempts.delete(req.ip);
  }

  function setCookie(req, res, token) {
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      path: '/',
      maxAge: config.sessionDays * DAY,
    });
  }

  // Who is calling: a valid, unexpired session of a user who isn't banned.
  app.use((req, res, next) => {
    const token = readCookie(req, COOKIE);
    if (!token) return next();

    const s = q.session.get(hashToken(token));
    const t = now();
    if (!s || s.expires_at <= t) return next();

    const user = q.userById.get(s.user_id);
    if (!user || user.banned_at) return next();

    // Sliding expiry, written at most once a day.
    const fresh = t + config.sessionDays * DAY;
    if (fresh - s.expires_at > DAY) {
      q.extendSession.run(fresh, s.token_hash);
      setCookie(req, res, token);
    }

    req.user = user;
    req.sessionHash = s.token_hash;
    next();
  });

  function needUser(req) {
    if (!req.user) throw new HttpError(401, 'Нужно войти');
    return req.user;
  }

  function needOwner(req) {
    const user = needUser(req);
    if (user.role !== 'owner') throw new HttpError(403, 'Только для владельца сервера');
    return user;
  }

  const me = (u) => ({ id: u.id, name: u.name, role: u.role });

  // ---------- invites ----------

  function liveInvite(code) {
    if (typeof code !== 'string') return null;
    const inv = q.invite.get(code.trim().toUpperCase());
    if (!inv || inv.revoked_at) return null;
    if (inv.expires_at !== null && inv.expires_at <= now()) return null;
    if (inv.max_uses !== null && inv.uses >= inv.max_uses) return null;
    return inv;
  }

  // ---------- routes ----------

  app.get('/api/state', (req, res) => {
    const space = q.space.get();
    res.json({
      needsSetup: q.userCount.get().n === 0,
      space: space ? { name: space.name } : null,
      me: req.user ? me(req.user) : null,
      channels: req.user ? q.channels.all(req.user.space_id) : [],
    });
  });

  app.post('/api/setup', async (req, res) => {
    guard(req);
    if (q.userCount.get().n > 0) throw new HttpError(409, 'Сервер уже настроен');

    const { code, spaceName, name, password } = req.body ?? {};
    if (!codesMatch(code, getSetupCode())) {
      failed(req);
      throw new HttpError(403, 'Неверный код настройки — он в логе сервера');
    }
    const title = typeof spaceName === 'string' ? spaceName.trim() : '';
    if (title.length < 1 || title.length > 40) {
      throw new HttpError(400, 'Название сервера: 1–40 символов');
    }
    const cleanName = checkName(name);
    const hash = await hashPassword(checkPassword(password));

    const t = now();
    const spaceId = newId();
    const owner = {
      id: newId(),
      spaceId,
      name: cleanName,
      nameKey: nameKey(cleanName),
      hash,
      role: 'owner',
      at: t,
    };

    db.transaction(() => {
      // Checked again inside the transaction: two setups racing each other.
      if (q.userCount.get().n > 0) throw new HttpError(409, 'Сервер уже настроен');
      q.insertSpace.run(spaceId, title, t);
      q.insertUser.run(owner);
      config.seedChannels.forEach((ch, i) => q.insertChannel.run(newId(), spaceId, ch, i, t));
    })();

    const user = q.userById.get(owner.id);
    startSession(req, res, user);
    res.status(201).json({ me: me(user) });
  });

  // A dummy hash so a wrong nickname costs as much time as a wrong password.
  let dummyHash = null;

  app.post('/api/login', async (req, res) => {
    guard(req);
    const { name, password } = req.body ?? {};
    const space = q.space.get();
    const user =
      space && typeof name === 'string' ? q.userByKey.get(space.id, nameKey(name)) : null;

    dummyHash ??= await hashPassword('timing-equaliser');
    const ok = await verifyPassword(String(password ?? ''), user ? user.password_hash : dummyHash);
    if (!user || !ok) {
      failed(req);
      throw new HttpError(401, 'Неверный ник или пароль');
    }
    if (user.banned_at) throw new HttpError(403, 'Тебя забанили на этом сервере');

    startSession(req, res, user);
    res.json({ me: me(user) });
  });

  app.post('/api/logout', (req, res) => {
    if (req.sessionHash) q.deleteSession.run(req.sessionHash);
    res.clearCookie(COOKIE, { path: '/' });
    res.status(204).end();
  });

  app.get('/api/invites/:code', (req, res) => {
    const inv = liveInvite(req.params.code);
    if (!inv) throw new HttpError(404, 'Приглашение не найдено, истекло или уже использовано');
    res.json({ spaceName: q.space.get().name });
  });

  app.post('/api/register', async (req, res) => {
    guard(req);
    const { code, name, password } = req.body ?? {};
    if (!liveInvite(code)) {
      failed(req);
      throw new HttpError(404, 'Приглашение не найдено, истекло или уже использовано');
    }
    const cleanName = checkName(name);
    const hash = await hashPassword(checkPassword(password));

    const id = newId();
    db.transaction(() => {
      // Again inside the transaction: the last use of a one-time invite, or
      // the same nickname, can be claimed twice at once.
      const inv = liveInvite(code);
      if (!inv) throw new HttpError(404, 'Приглашение не найдено, истекло или уже использовано');
      if (q.userByKey.get(inv.space_id, nameKey(cleanName))) {
        throw new HttpError(409, 'Этот ник уже занят');
      }
      q.insertUser.run({
        id,
        spaceId: inv.space_id,
        name: cleanName,
        nameKey: nameKey(cleanName),
        hash,
        role: 'member',
        at: now(),
      });
      q.useInvite.run(inv.code);
    })();

    const user = q.userById.get(id);
    startSession(req, res, user);
    res.status(201).json({ me: me(user) });
  });

  app.post('/api/join', async (req, res) => {
    const user = needUser(req);
    const channel = q.channel.get(String(req.body?.channelId ?? ''), user.space_id);
    if (!channel) throw new HttpError(404, 'Нет такого канала');

    // identity is the user id: stable across renames, unique per server.
    const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
      identity: user.id,
      name: user.name,
      ttl: config.tokenTtl,
      metadata: JSON.stringify({ role: user.role }),
    });
    at.addGrant({
      room: channel.id,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    res.json({
      token: await at.toJwt(),
      url: config.livekitUrl,
      channel,
      userId: user.id,
      name: user.name,
    });
  });

  // ---------- owner ----------

  app.get('/api/admin/invites', (req, res) => {
    const owner = needOwner(req);
    const t = now();
    res.json(
      q.invites.all(owner.space_id).map((i) => ({
        code: i.code,
        uses: i.uses,
        maxUses: i.max_uses,
        expiresAt: i.expires_at,
        createdAt: i.created_at,
        createdBy: i.creator,
        active:
          (i.expires_at === null || i.expires_at > t) &&
          (i.max_uses === null || i.uses < i.max_uses),
      })),
    );
  });

  app.post('/api/admin/invites', (req, res) => {
    const owner = needOwner(req);
    const { ttlHours = null, maxUses = null } = req.body ?? {};
    const okTtl = ttlHours === null || (Number.isFinite(ttlHours) && ttlHours > 0 && ttlHours <= 24 * 365);
    const okUses = maxUses === null || (Number.isInteger(maxUses) && maxUses > 0 && maxUses <= 1000);
    if (!okTtl || !okUses) throw new HttpError(400, 'Срок или число использований вне допустимого');

    const code = newInviteCode();
    const t = now();
    q.insertInvite.run(code, owner.space_id, owner.id, maxUses, ttlHours === null ? null : t + ttlHours * 3_600_000, t);
    res.status(201).json({ code });
  });

  app.delete('/api/admin/invites/:code', (req, res) => {
    const owner = needOwner(req);
    q.revokeInvite.run(now(), String(req.params.code).toUpperCase(), owner.space_id);
    res.status(204).end();
  });

  app.get('/api/admin/users', (req, res) => {
    const owner = needOwner(req);
    res.json(
      q.users.all(owner.space_id).map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        banned: !!u.banned_at,
        createdAt: u.created_at,
      })),
    );
  });

  function target(req, owner) {
    const user = q.userById.get(req.params.id);
    if (!user || user.space_id !== owner.space_id) throw new HttpError(404, 'Нет такого пользователя');
    if (user.role === 'owner') throw new HttpError(400, 'Владельца выгнать нельзя');
    return user;
  }

  // Out of every channel's call. Not being in one is fine; so is LiveKit
  // being briefly unreachable — for a ban the closed sessions are what count.
  async function kick(user) {
    const channels = q.channels.all(user.space_id);
    await Promise.all(
      channels.map((c) => roomService.removeParticipant(c.id, user.id).catch(() => {})),
    );
  }

  app.post('/api/admin/users/:id/kick', async (req, res) => {
    const user = target(req, needOwner(req));
    await kick(user);
    res.status(204).end();
  });

  app.post('/api/admin/users/:id/ban', async (req, res) => {
    const user = target(req, needOwner(req));
    db.transaction(() => {
      q.setBanned.run(now(), user.id);
      q.deleteUserSessions.run(user.id);
    })();
    await kick(user);
    res.status(204).end();
  });

  app.post('/api/admin/users/:id/unban', (req, res) => {
    const user = target(req, needOwner(req));
    q.setBanned.run(null, user.id);
    res.status(204).end();
  });

  // ---------- desktop app ----------

  // The desktop app polls this to notice it is out of date.
  app.get('/api/version', (_req, res) => {
    res.json({ desktop: config.desktopVersion, downloadPath: '/download/voxhub.exe' });
  });

  app.use('/api', (_req, _res) => {
    throw new HttpError(404, 'Нет такого запроса');
  });

  if (downloadDir) {
    app.use(
      '/download',
      express.static(downloadDir, {
        maxAge: 0,
        setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
      }),
    );
  }

  // The built client; in dev Vite serves it instead. /invite/<code> is a
  // client route too, so everything that isn't /api gets index.html.
  if (webDist) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'), (err) => {
        if (err) res.status(404).send('Client not built yet — run: npm run build in web/');
      });
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Кривой JSON' });
    console.error('[voxhub]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  });

  return app;
}
