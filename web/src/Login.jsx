import { useState } from 'react';

export default function Login({ rooms, onJoin, externalError }) {
  const [name, setName] = useState(() => localStorage.getItem('voxhub.name') ?? '');
  const [password, setPassword] = useState('');
  const [room, setRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const activeRoom = room || rooms[0] || 'general';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onJoin({ name: name.trim(), password, room: activeRoom });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <h1>voxhub</h1>
        <p className="muted">свой сервер, свой битрейт</p>

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

        {(error || externalError) && <p className="error">{error || externalError}</p>}

        <button type="submit" disabled={busy || !name.trim() || !password}>
          {busy ? 'Подключаюсь…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
