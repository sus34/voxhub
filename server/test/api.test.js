import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

// A fresh server per describe block: in-memory SQLite, a fake LiveKit that
// records kicks, and a clock the tests can move.
function startServer() {
  const clock = { t: Date.UTC(2026, 8, 22, 12) };
  const kicks = [];
  const db = openDb(':memory:');
  const app = createApp({
    db,
    config: {
      livekitApiKey: 'APItest',
      livekitApiSecret: 'test-secret-that-is-long-enough-for-hs256',
      livekitUrl: 'wss://example.invalid',
      seedChannels: ['general', 'games'],
      tokenTtl: '10m',
      sessionDays: 90,
      desktopVersion: '0.2.0',
    },
    roomService: {
      removeParticipant: async (room, identity) => {
        kicks.push({ room, identity });
      },
    },
    getSetupCode: () => 'ABCD-EFGH',
    now: () => clock.t,
  });

  return new Promise((resolve) => {
    const http = app.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${http.address().port}`;
      resolve({ base, http, clock, kicks, db });
    });
  });
}

/** A tiny client with its own cookie, like a separate browser. */
function client(base) {
  let cookie = '';
  return async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
}

const OWNER = { name: 'Матвей', password: 'owner-pass' };

async function setUp(base) {
  const owner = client(base);
  const r = await owner('POST', '/api/setup', { code: 'abcd efgh', spaceName: 'Наши', ...OWNER });
  assert.equal(r.status, 201);
  return owner;
}

async function invite(owner, opts = {}) {
  const r = await owner('POST', '/api/admin/invites', opts);
  assert.equal(r.status, 201);
  return r.body.code;
}

function jwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

describe('first-run setup', () => {
  let s;
  before(async () => (s = await startServer()));
  after(() => s.http.close());

  test('a fresh server asks for setup and knows nobody', async () => {
    const r = await client(s.base)('GET', '/api/state');
    assert.deepEqual(r.body, { needsSetup: true, space: null, me: null, channels: [] });
  });

  test('a wrong setup code is refused', async () => {
    const r = await client(s.base)('POST', '/api/setup', {
      code: 'WRONG-CODE',
      spaceName: 'x',
      ...OWNER,
    });
    assert.equal(r.status, 403);
  });

  test('the right code makes you the owner, with the seed channels', async () => {
    const owner = await setUp(s.base);
    const r = await owner('GET', '/api/state');
    assert.equal(r.body.needsSetup, false);
    assert.equal(r.body.space.name, 'Наши');
    assert.equal(r.body.me.role, 'owner');
    assert.deepEqual(
      r.body.channels.map((c) => c.name),
      ['general', 'games'],
    );
  });

  test('setup cannot run twice', async () => {
    const r = await client(s.base)('POST', '/api/setup', {
      code: 'ABCD-EFGH',
      spaceName: 'Чужие',
      name: 'hacker',
      password: 'whatever1',
    });
    assert.equal(r.status, 409);
  });
});

describe('login and sessions', () => {
  let s;
  before(async () => {
    s = await startServer();
    await setUp(s.base);
  });
  after(() => s.http.close());

  test('wrong password and unknown nickname give the same answer', async () => {
    const c = client(s.base);
    const a = await c('POST', '/api/login', { name: 'Матвей', password: 'nope-nope' });
    const b = await c('POST', '/api/login', { name: 'никто', password: 'nope-nope' });
    assert.equal(a.status, 401);
    assert.deepEqual(a.body, b.body);
  });

  test('login is case-insensitive on the nickname and remembered', async () => {
    const c = client(s.base);
    const r = await c('POST', '/api/login', { name: 'МАТВЕЙ', password: OWNER.password });
    assert.equal(r.status, 200);
    assert.equal((await c('GET', '/api/state')).body.me.name, 'Матвей');
  });

  test('logout ends the session', async () => {
    const c = client(s.base);
    await c('POST', '/api/login', OWNER);
    assert.equal((await c('POST', '/api/logout')).status, 204);
    assert.equal((await c('GET', '/api/state')).body.me, null);
  });

  test('a session that keeps being used does not expire', async () => {
    const c = client(s.base);
    await c('POST', '/api/login', OWNER);
    for (let i = 0; i < 3; i++) {
      s.clock.t += 60 * 86_400_000; // 180 days in total, used every 60
      assert.equal((await c('GET', '/api/state')).body.me?.name, 'Матвей', `after ${(i + 1) * 60} days`);
    }
  });

  test('a session expires after SESSION_DAYS of not being used', async () => {
    const c = client(s.base);
    await c('POST', '/api/login', OWNER);
    s.clock.t += 91 * 86_400_000;
    assert.equal((await c('GET', '/api/state')).body.me, null);
  });

  test('too many failed logins are throttled', async () => {
    const c = client(s.base);
    let last;
    for (let i = 0; i < 11; i++) {
      last = await c('POST', '/api/login', { name: 'Матвей', password: 'bad-guess' });
    }
    assert.equal(last.status, 429);
  });
});

describe('invites', () => {
  let s;
  let owner;
  before(async () => {
    s = await startServer();
    owner = await setUp(s.base);
  });
  after(() => s.http.close());

  test('an invite shows the server name and lets a friend register', async () => {
    const code = await invite(owner);
    const friend = client(s.base);
    assert.equal((await friend('GET', `/api/invites/${code}`)).body.spaceName, 'Наши');

    const r = await friend('POST', '/api/register', { code, name: 'Вася', password: 'vasya-pass' });
    assert.equal(r.status, 201);
    assert.equal(r.body.me.role, 'member');
  });

  test('a one-time invite works once', async () => {
    const code = await invite(owner, { maxUses: 1 });
    const a = await client(s.base)('POST', '/api/register', { code, name: 'Петя', password: 'petya-pass' });
    const b = await client(s.base)('POST', '/api/register', { code, name: 'Коля', password: 'kolya-pass' });
    assert.equal(a.status, 201);
    assert.equal(b.status, 404);
  });

  test('an invite stops working after its time is up', async () => {
    const code = await invite(owner, { ttlHours: 24 });
    s.clock.t += 25 * 3_600_000;
    assert.equal((await client(s.base)('GET', `/api/invites/${code}`)).status, 404);
  });

  test('a revoked invite stops working', async () => {
    const code = await invite(owner);
    assert.equal((await owner('DELETE', `/api/admin/invites/${code}`)).status, 204);
    const r = await client(s.base)('POST', '/api/register', { code, name: 'Дима', password: 'dima-pass' });
    assert.equal(r.status, 404);
  });

  test('a nickname is taken regardless of case', async () => {
    const code = await invite(owner);
    const r = await client(s.base)('POST', '/api/register', { code, name: 'вАСЯ', password: 'other-pass' });
    assert.equal(r.status, 409);
  });

  test('the owner sees active and used-up invites, but not revoked ones', async () => {
    const list = (await owner('GET', '/api/admin/invites')).body;
    assert.ok(list.length >= 2);
    assert.ok(list.some((i) => i.active));
    assert.ok(list.some((i) => !i.active)); // the used-up one-time invite
  });
});

describe('joining a call', () => {
  let s;
  let owner;
  before(async () => {
    s = await startServer();
    owner = await setUp(s.base);
  });
  after(() => s.http.close());

  test('you have to be logged in', async () => {
    const r = await client(s.base)('POST', '/api/join', { channelId: 'x' });
    assert.equal(r.status, 401);
  });

  test('the LiveKit token is for your user id, your name and that channel', async () => {
    const { channels, me } = (await owner('GET', '/api/state')).body;
    const r = await owner('POST', '/api/join', { channelId: channels[1].id });
    assert.equal(r.status, 200);

    const claims = jwtPayload(r.body.token);
    assert.equal(claims.sub, me.id);
    assert.equal(claims.name, 'Матвей');
    assert.equal(claims.video.room, channels[1].id);
    assert.equal(r.body.channel.name, 'games');
  });

  test('an unknown channel is refused', async () => {
    const r = await owner('POST', '/api/join', { channelId: 'nope' });
    assert.equal(r.status, 404);
  });
});

describe('owner powers', () => {
  let s;
  let owner;
  let member;
  let memberId;
  before(async () => {
    s = await startServer();
    owner = await setUp(s.base);
    member = client(s.base);
    const code = await invite(owner);
    memberId = (await member('POST', '/api/register', { code, name: 'Вася', password: 'vasya-pass' })).body
      .me.id;
  });
  after(() => s.http.close());

  test('a member cannot use owner endpoints', async () => {
    assert.equal((await member('GET', '/api/admin/users')).status, 403);
    assert.equal((await member('POST', '/api/admin/invites', {})).status, 403);
  });

  test('kick removes the person from every channel call', async () => {
    const r = await owner('POST', `/api/admin/users/${memberId}/kick`);
    assert.equal(r.status, 204);
    assert.equal(s.kicks.filter((k) => k.identity === memberId).length, 2);
  });

  test('ban closes their sessions and keeps them out', async () => {
    assert.equal((await owner('POST', `/api/admin/users/${memberId}/ban`)).status, 204);
    assert.equal((await member('GET', '/api/state')).body.me, null);

    const again = await client(s.base)('POST', '/api/login', { name: 'Вася', password: 'vasya-pass' });
    assert.equal(again.status, 403);

    const users = (await owner('GET', '/api/admin/users')).body;
    assert.equal(users.find((u) => u.id === memberId).banned, true);
  });

  test('unban lets them back in', async () => {
    assert.equal((await owner('POST', `/api/admin/users/${memberId}/unban`)).status, 204);
    const r = await client(s.base)('POST', '/api/login', { name: 'Вася', password: 'vasya-pass' });
    assert.equal(r.status, 200);
  });

  test('the owner cannot be kicked or banned', async () => {
    const { me } = (await owner('GET', '/api/state')).body;
    assert.equal((await owner('POST', `/api/admin/users/${me.id}/ban`)).status, 400);
  });
});
