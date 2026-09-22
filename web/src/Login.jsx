import { useState } from 'react';

function lastRoom(rooms) {
  let saved = null;
  try {
    saved = localStorage.getItem('voxhub.room');
  } catch {
    /* storage blocked */
  }
  return saved && rooms.includes(saved) ? saved : '';
}

export default function Login({ rooms, onJoin, remembered, onForget, externalError }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('voxhub.name') ?? '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(true);
  const [room, setRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const activeRoom = room || lastRoom(rooms) || rooms[0] || 'general';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (remembered) {
        await onJoin({ ticket: remembered.ticket, room: activeRoom });
      } else {
        await onJoin({ name: name.trim(), password, keep, room: activeRoom });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const roomSelect = (
    <label>
      Канал
      <select value={activeRoom} onChange={(e) => setRoom(e.target.value)}>
        {rooms.map((r) => (
          <option key={r} value={r}>
            #{r}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <h1>voxhub</h1>
        <p className="muted">свой сервер, свой битрейт</p>

        {remembered ? (
          <>
            <div className="login-who">
              <span className="avatar">{remembered.name.slice(0, 1).toUpperCase()}</span>
              <span className="login-who-name">
                {remembered.name}
                <small>вход запомнен на этом устройстве</small>
              </span>
              <button className="login-forget" onClick={onForget} type="button">
                Не ты?
              </button>
            </div>

            {roomSelect}
          </>
        ) : (
          <>
            <label>
              Имя
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="как тебя видят"
                maxLength={24}
                required
                autoFocus={!name}
              />
            </label>

            <label>
              Пароль сервера
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus={!!name}
              />
            </label>

            {roomSelect}

            <label className="login-keep">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              <span>
                Запомнить меня
                <small>
                  Пароль на устройстве не хранится — сервер выдаёт пропуск, который
                  продлевается при каждом входе.
                </small>
              </span>
            </label>
          </>
        )}

        {(error || externalError) && <p className="error">{error || externalError}</p>}

        <button
          type="submit"
          autoFocus={!!remembered}
          disabled={busy || (!remembered && (!name.trim() || !password))}
        >
          {busy ? 'Подключаюсь…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
