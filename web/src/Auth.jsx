import { useEffect, useState } from 'react';
import { api } from './api.js';

/** The four screens before a call: setup, sign in, invite sign-up, lobby. */

function Shell({ subtitle, onSubmit, children }) {
  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>voxhub</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </form>
    </div>
  );
}

function Field({ label, hint, ...input }) {
  return (
    <label>
      {label}
      <input {...input} />
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

/** busy / error around an async submit, the same way on every screen. */
function useSubmit(action) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return { busy, error, submit, setError };
}

function mismatch(password, repeat) {
  return repeat && password !== repeat ? 'Пароли не совпадают' : '';
}

export function Setup({ onDone }) {
  const [code, setCode] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');

  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/setup', { method: 'POST', body: { code, spaceName, name, password } });
    await onDone();
  });

  const bad = mismatch(password, repeat);
  const ready = code && spaceName.trim() && name.trim() && password.length >= 6 && password === repeat;

  return (
    <Shell subtitle="Настройка сервера — один раз" onSubmit={submit}>
      <Field
        label="Код настройки"
        hint="Сервер напечатал его в лог при запуске"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="ABCD-EFGH"
        autoComplete="off"
        autoFocus
        required
      />
      <Field
        label="Название сервера"
        value={spaceName}
        onChange={(e) => setSpaceName(e.target.value)}
        placeholder="например, Вечерний рейд"
        maxLength={40}
        required
      />
      <Field
        label="Твой ник"
        hint="Ты станешь владельцем: приглашения, кик, бан"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={24}
        autoComplete="username"
        required
      />
      <Field
        label="Пароль"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        minLength={6}
        required
      />
      <Field
        label="Ещё раз пароль"
        type="password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        autoComplete="new-password"
        required
      />

      {(bad || error) && <p className="error">{bad || error}</p>}

      <button type="submit" disabled={busy || !ready}>
        {busy ? 'Создаю…' : 'Создать сервер'}
      </button>
    </Shell>
  );
}

export function SignIn({ spaceName, onDone, notice }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('voxhub.name') ?? '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');

  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/login', { method: 'POST', body: { name, password } });
    try {
      localStorage.setItem('voxhub.name', name.trim());
    } catch {
      /* just not prefilled next time */
    }
    await onDone();
  });

  return (
    <Shell subtitle={spaceName ? `Вход на сервер «${spaceName}»` : 'Вход'} onSubmit={submit}>
      <Field
        label="Ник"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={24}
        autoComplete="username"
        autoFocus={!name}
        required
      />
      <Field
        label="Пароль"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        autoFocus={!!name}
        required
      />

      {(error || notice) && <p className="error">{error || notice}</p>}

      <button type="submit" disabled={busy || !name.trim() || !password}>
        {busy ? 'Вхожу…' : 'Войти'}
      </button>

      <p className="login-foot">Нет аккаунта — попроси у владельца ссылку-приглашение.</p>
    </Shell>
  );
}

export function InviteSignUp({ code, onDone, onSignIn }) {
  const [info, setInfo] = useState(null); // { spaceName } | { error }
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');

  useEffect(() => {
    api(`/api/invites/${code}`)
      .then(setInfo)
      .catch((e) => setInfo({ error: e.message }));
  }, [code]);

  const { busy, error, submit } = useSubmit(async () => {
    await api('/api/register', { method: 'POST', body: { code, name, password } });
    try {
      localStorage.setItem('voxhub.name', name.trim());
    } catch {
      /* fine */
    }
    await onDone();
  });

  if (!info) return <Shell subtitle="Проверяю приглашение…" onSubmit={(e) => e.preventDefault()} />;

  if (info.error) {
    return (
      <Shell subtitle="Приглашение не работает" onSubmit={(e) => (e.preventDefault(), onSignIn())}>
        <p className="error">{info.error}</p>
        <p className="login-foot">Попроси у владельца новую ссылку. Если аккаунт уже есть — просто войди.</p>
        <button type="submit">Ко входу</button>
      </Shell>
    );
  }

  const bad = mismatch(password, repeat);
  const ready = name.trim() && password.length >= 6 && password === repeat;

  return (
    <Shell subtitle={`Тебя пригласили на сервер «${info.spaceName}»`} onSubmit={submit}>
      <Field
        label="Ник"
        hint="Так тебя увидят остальные"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={24}
        autoComplete="username"
        autoFocus
        required
      />
      <Field
        label="Пароль"
        hint="Минимум 6 символов"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        minLength={6}
        required
      />
      <Field
        label="Ещё раз пароль"
        type="password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        autoComplete="new-password"
        required
      />

      {(bad || error) && <p className="error">{bad || error}</p>}

      <button type="submit" disabled={busy || !ready}>
        {busy ? 'Захожу…' : 'Присоединиться'}
      </button>

      <p className="login-foot">
        Уже есть аккаунт?{' '}
        <button className="link-btn" onClick={onSignIn} type="button">
          Войти
        </button>
      </p>
    </Shell>
  );
}

function lastChannel(channels) {
  let saved = null;
  try {
    saved = localStorage.getItem('voxhub.channel');
  } catch {
    /* storage blocked */
  }
  return channels.some((c) => c.id === saved) ? saved : channels[0]?.id ?? '';
}

/** Logged in, not in a call yet: who you are, which channel, one Enter. */
export function Lobby({ me, spaceName, channels, onJoin, onLogout, notice }) {
  const [channelId, setChannelId] = useState(() => lastChannel(channels));

  const { busy, error, submit } = useSubmit(async () => {
    await onJoin(channelId);
  });

  return (
    <Shell subtitle={`Сервер «${spaceName}»`} onSubmit={submit}>
      <div className="login-who">
        <span className="avatar">{me.name.slice(0, 1).toUpperCase()}</span>
        <span className="login-who-name">
          {me.name}
          <small>{me.role === 'owner' ? 'владелец сервера' : 'вход запомнен на этом устройстве'}</small>
        </span>
        <button className="login-forget" onClick={onLogout} type="button">
          Выйти
        </button>
      </div>

      <label>
        Канал
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
      </label>

      {(error || notice) && <p className="error">{error || notice}</p>}

      <button type="submit" autoFocus disabled={busy || !channelId}>
        {busy ? 'Подключаюсь…' : 'Войти'}
      </button>
    </Shell>
  );
}

export function ErrorScreen({ message, onRetry }) {
  return (
    <Shell subtitle="Сервер не отвечает" onSubmit={(e) => (e.preventDefault(), onRetry())}>
      <p className="error">{message}</p>
      <button type="submit">Ещё раз</button>
    </Shell>
  );
}
