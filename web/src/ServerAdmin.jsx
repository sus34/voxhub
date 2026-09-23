import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const TTL = [
  { label: 'на сутки', hours: 24 },
  { label: 'на неделю', hours: 168 },
  { label: 'на месяц', hours: 720 },
  { label: 'бессрочно', hours: null },
];

const USES = [
  { label: 'для одного', n: 1 },
  { label: 'для пятерых', n: 5 },
  { label: 'без лимита', n: null },
];

const date = (t) =>
  new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

function inviteStatus(i) {
  if (!i.active) {
    return i.maxUses !== null && i.uses >= i.maxUses ? 'использовано' : 'истекло';
  }
  const left = i.maxUses === null ? 'без лимита' : `ещё ${i.maxUses - i.uses} из ${i.maxUses}`;
  const until = i.expiresAt === null ? 'бессрочно' : `до ${date(i.expiresAt)}`;
  return `${left} · ${until}`;
}

/** Owner-only part of the settings: invite links and who is on the server. */
export default function ServerAdmin({ meId }) {
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);
  const [ttl, setTtl] = useState(1); // index into TTL — a week
  const [uses, setUses] = useState(2); // index into USES — no limit
  const [fresh, setFresh] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [i, u] = await Promise.all([api('/api/admin/invites'), api('/api/admin/users')]);
      setInvites(i);
      setUsers(u);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn) {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  const create = () =>
    run(async () => {
      const { code } = await api('/api/admin/invites', {
        method: 'POST',
        body: { ttlHours: TTL[ttl].hours, maxUses: USES[uses].n },
      });
      const url = `${location.origin}/invite/${code}`;
      setFresh(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    });

  const revoke = (code) =>
    run(() => api(`/api/admin/invites/${code}`, { method: 'DELETE' }));

  const setBanned = (u, ban) => {
    if (ban && !window.confirm(`Забанить ${u.name}? Его выкинет из звонка, войти он не сможет.`)) return;
    run(() => api(`/api/admin/users/${u.id}/${ban ? 'ban' : 'unban'}`, { method: 'POST' }));
  };

  const active = invites.filter((i) => i.active);
  const spent = invites.filter((i) => !i.active).slice(0, 5);

  return (
    <>
      {error && <p className="error">{error}</p>}

      <section>
        <h4>Приглашения</h4>

        <div className="invite-make">
          <select value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
            {TTL.map((o, i) => (
              <option key={o.label} value={i}>
                {o.label}
              </option>
            ))}
          </select>
          <select value={uses} onChange={(e) => setUses(Number(e.target.value))}>
            {USES.map((o, i) => (
              <option key={o.label} value={i}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="invite-go" onClick={create} type="button">
            Создать ссылку
          </button>
        </div>

        {fresh && (
          <div className="invite-fresh">
            <input value={fresh} readOnly onFocus={(e) => e.target.select()} />
            <span>{copied ? 'Скопировано — отправь другу' : 'Скопируй и отправь другу'}</span>
          </div>
        )}

        {active.length + spent.length > 0 && (
          <div className="admin-list">
            {[...active, ...spent].map((i) => (
              <div key={i.code} className={'admin-row' + (i.active ? '' : ' faded')}>
                <code className="invite-code">{i.code}</code>
                <span className="admin-meta">{inviteStatus(i)}</span>
                {i.active && (
                  <button className="admin-btn" onClick={() => revoke(i.code)} type="button">
                    Отозвать
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h4>Кто на сервере — {users.length}</h4>
        <div className="admin-list">
          {users.map((u) => (
            <div key={u.id} className={'admin-row' + (u.banned ? ' faded' : '')}>
              <span className="avatar">{u.name.slice(0, 1).toUpperCase()}</span>
              <span className="admin-name">
                {u.name}
                {u.id === meId ? ' (ты)' : ''}
              </span>
              <span className="admin-meta">
                {u.role === 'owner' ? 'владелец' : u.banned ? 'забанен' : `с ${date(u.createdAt)}`}
              </span>
              {u.role !== 'owner' && (
                <button
                  className={'admin-btn' + (u.banned ? '' : ' danger')}
                  onClick={() => setBanned(u, !u.banned)}
                  type="button"
                >
                  {u.banned ? 'Разбанить' : 'Забанить'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
