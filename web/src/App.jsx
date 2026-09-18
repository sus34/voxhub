import { useCallback, useEffect, useState } from 'react';
import Login from './Login.jsx';
import Room from './Room.jsx';

export default function App() {
  const [rooms, setRooms] = useState([]);
  const [creds, setCreds] = useState(null); // { name, password }
  const [session, setSession] = useState(null); // { token, url, room, name }
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => setRooms(c.rooms))
      .catch(() => setRooms(['general']));
  }, []);

  const join = useCallback(async ({ name, password, room }) => {
    const res = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password, room }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Не удалось подключиться');
    setCreds({ name, password });
    setSession(data);
    localStorage.setItem('voxhub.name', name);
  }, []);

  // Swap the session straight to the new room instead of clearing it first:
  // clearing unmounted the whole UI and flashed the login screen mid-switch.
  const switchRoom = useCallback(
    async (room) => {
      if (!creds || switching) return;
      setSwitching(true);
      setError('');
      try {
        await join({ ...creds, room });
      } catch (e) {
        setError(e.message);
      } finally {
        setSwitching(false);
      }
    },
    [creds, join, switching],
  );

  const leave = useCallback(() => {
    setSession(null);
    setCreds(null);
  }, []);

  if (!session) {
    return <Login rooms={rooms} onJoin={join} externalError={error} />;
  }

  return (
    <Room
      session={session}
      rooms={rooms}
      switching={switching}
      onSwitchRoom={switchRoom}
      onLeave={leave}
    />
  );
}
