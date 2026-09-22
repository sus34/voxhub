import { useCallback, useEffect, useState } from 'react';
import Login from './Login.jsx';
import Room from './Room.jsx';
import UpdateToast, { updateItems } from './UpdateToast.jsx';
import { takeRejoin, useUpdates } from './updates.js';

const REMEMBER_KEY = 'voxhub.remember';

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private window or blocked storage — just don't remember */
  }
}

export default function App() {
  const [rooms, setRooms] = useState([]);
  // How to get back in when switching channels: a remember ticket, or the
  // password kept in memory only for this run.
  const [creds, setCreds] = useState(null);
  const [session, setSession] = useState(null); // { token, url, room, name }
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const [remembered, setRemembered] = useState(() => {
    const ticket = readStored(REMEMBER_KEY);
    const name = readStored('voxhub.name');
    return ticket && name ? { ticket, name } : null;
  });
  const updates = useUpdates();
  // Closing the card hides what it showed, not whatever comes later.
  const [dismissed, setDismissed] = useState([]);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => setRooms(c.rooms))
      .catch(() => setRooms(['general']));
  }, []);

  const forget = useCallback(() => {
    writeStored(REMEMBER_KEY, null);
    setRemembered(null);
  }, []);

  /**
   * Either { name, password, keep } for a first login, or { ticket } for a
   * remembered device. Both come back with a fresh ticket.
   */
  const join = useCallback(
    async ({ name, password, keep, ticket, room }) => {
      const body = ticket ? { remember: ticket, room } : { name, password, room };
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.expired) forget();
        throw new Error(data.error ?? 'Не удалось подключиться');
      }

      const shouldKeep = ticket ? true : keep;
      if (shouldKeep && data.remember) {
        writeStored(REMEMBER_KEY, data.remember);
        setRemembered({ ticket: data.remember, name: data.name });
        setCreds({ ticket: data.remember });
      } else {
        if (!ticket) forget();
        setCreds({ name, password });
      }

      writeStored('voxhub.name', data.name);
      writeStored('voxhub.room', data.room);
      setSession(data);
    },
    [forget],
  );

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

  // Back from "Обновить" in the update card: straight into the same channel.
  useEffect(() => {
    const room = takeRejoin();
    if (room && remembered) {
      join({ ticket: remembered.ticket, room }).catch((e) => setError(e.message));
    }
    // Once, on start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = updateItems(updates, session ? session.room : null);
  // Card first; once it's closed, the reminder moves to the sidebar.
  const fresh = items.filter((it) => !dismissed.includes(it.key));
  const later = items.filter((it) => dismissed.includes(it.key));

  return (
    <>
      {session ? (
        <Room
          session={session}
          rooms={rooms}
          switching={switching}
          onSwitchRoom={switchRoom}
          onLeave={leave}
          updates={later}
        />
      ) : (
        <Login
          rooms={rooms}
          onJoin={join}
          remembered={remembered}
          onForget={forget}
          externalError={error}
        />
      )}

      <UpdateToast
        items={fresh}
        onDismiss={() => setDismissed((d) => [...d, ...fresh.map((it) => it.key)])}
      />
    </>
  );
}
