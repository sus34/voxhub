import { useCallback, useEffect, useState } from 'react';
import Room from './Room.jsx';
import { ErrorScreen, InviteSignUp, Lobby, Setup, SignIn } from './Auth.jsx';
import UpdateToast, { updateItems } from './UpdateToast.jsx';
import { takeRejoin, useUpdates } from './updates.js';
import { api, inviteCodeFromPath } from './api.js';

export default function App() {
  // What the server says about itself and about us: /api/state.
  const [state, setState] = useState(null);
  const [bootError, setBootError] = useState('');
  const [path, setPath] = useState(() => location.pathname);
  const [session, setSession] = useState(null); // { token, url, channel, userId, name }
  const [switching, setSwitching] = useState(false);
  const [notice, setNotice] = useState('');

  const updates = useUpdates();
  // Closing the card hides what it showed, not whatever comes later.
  const [dismissed, setDismissed] = useState([]);

  const navigate = useCallback((to) => {
    history.replaceState(null, '', to);
    setPath(to);
  }, []);

  const refresh = useCallback(async () => {
    const s = await api('/api/state');
    setState(s);
    setBootError('');
    return s;
  }, []);

  const join = useCallback(
    async (channelId) => {
      try {
        const data = await api('/api/join', { method: 'POST', body: { channelId } });
        try {
          localStorage.setItem('voxhub.channel', channelId);
        } catch {
          /* just not remembered */
        }
        setNotice('');
        setSession(data);
      } catch (e) {
        // Session gone (logged out elsewhere, or banned): back to sign-in.
        if (e.status === 401) {
          setSession(null);
          await refresh();
        }
        throw e;
      }
    },
    [refresh],
  );

  useEffect(() => {
    // The pre-accounts "remember me" ticket is dead weight now.
    try {
      localStorage.removeItem('voxhub.remember');
    } catch {
      /* fine */
    }

    const rejoin = takeRejoin();
    refresh()
      .then((s) => {
        // Back from "Обновить" in the update card: straight into the same channel.
        if (rejoin && s.me && s.channels.some((c) => c.id === rejoin)) {
          join(rejoin).catch((e) => setNotice(e.message));
        }
      })
      .catch((e) => setBootError(e.message));
    // Once, on start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inviteCode = inviteCodeFromPath(path);

  // Opened an invite while already on the server: nothing to do there.
  useEffect(() => {
    if (state?.me && inviteCode) navigate('/');
  }, [state, inviteCode, navigate]);

  const switchRoom = useCallback(
    async (channelId) => {
      if (switching) return;
      setSwitching(true);
      try {
        await join(channelId);
      } catch (e) {
        setNotice(e.message);
      } finally {
        setSwitching(false);
      }
    },
    [join, switching],
  );

  const authed = useCallback(async () => {
    navigate('/');
    await refresh();
  }, [navigate, refresh]);

  const logout = useCallback(async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {
      /* the cookie is gone either way once the server forgets it */
    }
    setSession(null);
    await refresh();
  }, [refresh]);

  const kicked = useCallback(async () => {
    setSession(null);
    setNotice('Тебя выгнали из звонка');
    // A ban also closed our session — refresh shows the sign-in screen then.
    await refresh().catch(() => {});
  }, [refresh]);

  const items = updateItems(updates, session ? session.channel : null);
  // Card first; once it's closed, the reminder moves to the sidebar.
  const fresh = items.filter((it) => !dismissed.includes(it.key));
  const later = items.filter((it) => dismissed.includes(it.key));

  let screen = null;
  if (bootError) {
    screen = <ErrorScreen message={bootError} onRetry={() => refresh().catch((e) => setBootError(e.message))} />;
  } else if (!state) {
    screen = null; // a blink; nothing worth a spinner
  } else if (state.needsSetup) {
    screen = <Setup onDone={authed} />;
  } else if (!state.me) {
    screen = inviteCode ? (
      <InviteSignUp code={inviteCode} onDone={authed} onSignIn={() => navigate('/')} />
    ) : (
      <SignIn spaceName={state.space?.name} onDone={authed} notice={notice} />
    );
  } else if (!session) {
    screen = (
      <Lobby
        me={state.me}
        spaceName={state.space.name}
        channels={state.channels}
        onJoin={join}
        onLogout={logout}
        notice={notice}
      />
    );
  } else {
    screen = (
      <Room
        session={session}
        channels={state.channels}
        me={state.me}
        switching={switching}
        onSwitchRoom={switchRoom}
        onLeave={() => setSession(null)}
        onKicked={kicked}
        onLogout={logout}
        updates={later}
      />
    );
  }

  return (
    <>
      {screen}
      <UpdateToast
        items={fresh}
        onDismiss={() => setDismissed((d) => [...d, ...fresh.map((it) => it.key)])}
      />
    </>
  );
}
