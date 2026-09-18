import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Room as LKRoom, RoomEvent, Track } from 'livekit-client';
import { VideoTile, AudioSink } from './VideoTile.jsx';
import StreamStats from './StreamStats.jsx';
import Controls from './Controls.jsx';
import Chat from './Chat.jsx';
import Settings from './Settings.jsx';
import ParticipantGrid from './ParticipantGrid.jsx';
import ParticipantMenu from './ParticipantMenu.jsx';
import SourcePicker from './SourcePicker.jsx';
import { CloseIcon, ExpandIcon, LiveDot, LogoMark } from './Icons.jsx';
import {
  STREAM_PRESETS,
  DEFAULT_PRESET,
  MIC_MODES,
  DEFAULT_MIC_MODE,
  SCREEN_AUDIO_PUBLISH,
  SCREEN_AUDIO_CAPTURE,
  CAMERA_CAPTURE,
  CAMERA_PUBLISH,
} from './quality.js';

const isDesktop = typeof window !== 'undefined' && !!window.voxhub;

export default function Room({ session, rooms, onSwitchRoom, onLeave, switching }) {
  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [speakers, setSpeakers] = useState(() => new Set());
  const [presetKey, setPresetKey] = useState(
    () => localStorage.getItem('voxhub.preset') ?? DEFAULT_PRESET,
  );
  const [micMode, setMicMode] = useState(
    () => localStorage.getItem('voxhub.micMode') ?? DEFAULT_MIC_MODE,
  );
  const [deafened, setDeafened] = useState(false);
  const [shareAudio, setShareAudio] = useState(true);

  const [watching, setWatching] = useState(null);
  const [pendingRoom, setPendingRoom] = useState(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [unread, setUnread] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [update, setUpdate] = useState(null);

  const [, bump] = useReducer((n) => n + 1, 0);
  const roomRef = useRef(null);
  const stageRef = useRef(null);

  const chatOpenRef = useRef(chatOpen);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  // Desktop update check — so a new build does not have to be hand-delivered.
  useEffect(() => {
    if (!isDesktop || !window.voxhub.checkUpdate) return;
    window.voxhub
      .checkUpdate()
      .then((info) => {
        if (info && info.ok && info.outdated) setUpdate(info);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const r = new LKRoom({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: MIC_MODES[micMode]?.capture ?? MIC_MODES.clear.capture,
      videoCaptureDefaults: CAMERA_CAPTURE,
    });
    roomRef.current = r;
    setStatus('connecting');

    if (typeof window !== 'undefined') window.__voxroom = r;

    r.on(RoomEvent.ParticipantConnected, bump)
      .on(RoomEvent.ParticipantDisconnected, bump)
      .on(RoomEvent.TrackSubscribed, bump)
      .on(RoomEvent.TrackUnsubscribed, bump)
      .on(RoomEvent.TrackMuted, bump)
      .on(RoomEvent.TrackUnmuted, bump)
      .on(RoomEvent.LocalTrackPublished, bump)
      .on(RoomEvent.LocalTrackUnpublished, bump)
      .on(RoomEvent.ConnectionQualityChanged, bump)
      .on(RoomEvent.ActiveSpeakersChanged, (list) => {
        setSpeakers(new Set(list.map((p) => p.identity)));
      })
      .on(RoomEvent.Reconnecting, () => setStatus('reconnecting'))
      .on(RoomEvent.Reconnected, () => setStatus('connected'))
      .on(RoomEvent.Disconnected, () => setStatus('disconnected'))
      .on(RoomEvent.MediaDevicesError, (e) => setError('Устройство: ' + e.message))
      .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (topic !== 'chat') return;
        let parsed;
        try {
          parsed = JSON.parse(new TextDecoder().decode(payload));
        } catch {
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + '-' + Math.random(),
            from: participant ? participant.identity : '???',
            text: String(parsed.text ?? '').slice(0, 2000),
            mine: false,
          },
        ]);
        if (!chatOpenRef.current) setUnread((u) => u + 1);
      });

    setMessages([]);

    let cancelled = false;
    r.connect(session.url, session.token)
      .then(() => {
        if (cancelled) return;
        setStatus('connected');
        setRoom(r);
        setPendingRoom(null);
        setWatching(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
      roomRef.current = null;
      r.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const participants = room ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
  const localParticipant = room ? room.localParticipant : null;

  const sharers = useMemo(
    () =>
      participants
        .map((p) => {
          const pub = p.getTrackPublication(Track.Source.ScreenShare);
          return pub && pub.track ? { participant: p, track: pub.track } : null;
        })
        .filter(Boolean),
    [participants],
  );

  const stage = watching ? sharers.find((s) => s.participant.identity === watching) : null;

  useEffect(() => {
    if (watching && !sharers.some((s) => s.participant.identity === watching)) {
      setWatching(null);
    }
  }, [watching, sharers]);

  const micOn = !!(localParticipant && localParticipant.isMicrophoneEnabled);
  const camOn = !!(localParticipant && localParticipant.isCameraEnabled);
  const screenOn = !!(localParticipant && localParticipant.isScreenShareEnabled);

  const toggleMic = useCallback(async () => {
    if (!localParticipant) return;
    const mode = MIC_MODES[micMode] ?? MIC_MODES.clear;
    await localParticipant.setMicrophoneEnabled(!micOn, mode.capture, mode.publish);
    bump();
  }, [localParticipant, micOn, micMode]);

  const changeMicMode = useCallback(
    async (key) => {
      setMicMode(key);
      localStorage.setItem('voxhub.micMode', key);
      if (micOn && localParticipant) {
        const mode = MIC_MODES[key];
        await localParticipant.setMicrophoneEnabled(false);
        await localParticipant.setMicrophoneEnabled(true, mode.capture, mode.publish);
        bump();
      }
    },
    [micOn, localParticipant],
  );

  const toggleCam = useCallback(async () => {
    if (!localParticipant) return;
    await localParticipant.setCameraEnabled(!camOn, CAMERA_CAPTURE, CAMERA_PUBLISH);
    bump();
  }, [localParticipant, camOn]);

  /** Actually publishes the screen. On desktop the source id is already chosen. */
  const startShare = useCallback(
    async (key) => {
      if (!localParticipant) return;
      const preset = STREAM_PRESETS[key] || STREAM_PRESETS[DEFAULT_PRESET];
      try {
        await localParticipant.setScreenShareEnabled(
          true,
          {
            ...preset.capture,
            audio: shareAudio ? SCREEN_AUDIO_CAPTURE : false,
            selfBrowserSurface: 'exclude',
            surfaceSwitching: 'include',
            systemAudio: shareAudio ? 'include' : 'exclude',
          },
          { ...preset.publish, ...SCREEN_AUDIO_PUBLISH },
        );
      } catch (e) {
        if (e && e.name !== 'NotAllowedError') setError(e.message);
      }
      bump();
    },
    [localParticipant, shareAudio],
  );

  const toggleScreen = useCallback(async () => {
    if (!localParticipant) return;
    if (screenOn) {
      await localParticipant.setScreenShareEnabled(false);
      bump();
      return;
    }
    // Desktop picks the window itself; the browser has its own share dialog.
    if (isDesktop) {
      setPickerOpen(true);
      return;
    }
    await startShare(presetKey);
  }, [localParticipant, screenOn, presetKey, startShare]);

  const pickSource = useCallback(
    async (sourceId) => {
      setPickerOpen(false);
      try {
        await window.voxhub.chooseSource(sourceId, shareAudio);
      } catch {
        /* fall through — the handler falls back to the primary screen */
      }
      await startShare(presetKey);
    },
    [shareAudio, presetKey, startShare],
  );

  const changePreset = useCallback(
    async (key) => {
      setPresetKey(key);
      localStorage.setItem('voxhub.preset', key);
      if (screenOn && localParticipant) {
        await localParticipant.setScreenShareEnabled(false);
        await startShare(key);
      }
    },
    [screenOn, localParticipant, startShare],
  );

  const toggleDeafen = useCallback(async () => {
    if (!room) return;
    const next = !deafened;
    setDeafened(next);
    room.remoteParticipants.forEach((p) => {
      p.getTrackPublications().forEach((pub) => {
        if (pub.kind === Track.Kind.Audio) pub.setEnabled(!next);
      });
    });
    if (next && room.localParticipant.isMicrophoneEnabled) {
      await room.localParticipant.setMicrophoneEnabled(false);
      bump();
    }
  }, [room, deafened]);

  const sendMessage = useCallback(
    async (text) => {
      if (!room) return;
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + '-me', from: session.name, text, mine: true },
      ]);
      try {
        await room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ text })),
          { reliable: true, topic: 'chat' },
        );
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + '-err', text: 'Не отправилось: ' + e.message, system: true },
        ]);
      }
    },
    [room, session.name],
  );

  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen().catch((e) => setError('Полный экран: ' + e.message));
  }, []);

  // Double-click the video is the gesture people already expect.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'f' && stage && !/input|textarea/i.test(e.target.tagName)) toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, toggleFullscreen]);

  const openMenu = useCallback((e, participant) => {
    e.preventDefault();
    setMenu({ participant, x: e.clientX, y: e.clientY });
  }, []);

  const leave = useCallback(() => {
    if (roomRef.current) roomRef.current.disconnect();
    onLeave();
  }, [onLeave]);

  if (error) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h2>Не подключиться</h2>
          <p className="error">{error}</p>
          <button onClick={onLeave}>Назад</button>
        </div>
      </div>
    );
  }

  const wantsSwitch = pendingRoom && pendingRoom !== session.room;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <LogoMark />
          voxhub
        </div>

        {update && (
          <button
            className="update-banner"
            onClick={() => window.voxhub.openDownload(update.url)}
            type="button"
          >
            <b>Есть обновление {update.latest}</b>
            <span>у тебя {update.current} — нажми, чтобы скачать</span>
          </button>
        )}

        <div className="channels">
          {rooms.map((r) => {
            const isCurrent = r === session.room;
            const isPending = r === pendingRoom && !isCurrent;
            return (
              <button
                key={r}
                className={'channel' + (isCurrent ? ' active' : '') + (isPending ? ' pending' : '')}
                onClick={() => setPendingRoom(isCurrent ? null : r)}
              >
                <span className="hash">#</span>
                {r}
                {isCurrent && <span className="here">ты тут</span>}
              </button>
            );
          })}
        </div>

        {wantsSwitch && (
          <div className="switch-bar">
            <span className="switch-text">
              Перейти в <b>#{pendingRoom}</b>?
            </span>
            <span className="switch-note">Из #{session.room} тебя отключит.</span>
            <div className="switch-actions">
              <button
                className="switch-go"
                onClick={() => onSwitchRoom(pendingRoom)}
                disabled={switching}
              >
                {switching ? 'Перехожу…' : 'Подключиться'}
              </button>
              <button className="switch-cancel" onClick={() => setPendingRoom(null)}>
                Отмена
              </button>
            </div>
          </div>
        )}

        <div className="members">
          <div className="members-title">В канале — {participants.length}</div>
          {participants.map((p) => {
            const screen = p.getTrackPublication(Track.Source.ScreenShare);
            const isLive = !!(screen && screen.track);
            return (
              <div
                key={p.identity}
                className={'member' + (speakers.has(p.identity) ? ' speaking' : '')}
                onClick={() => isLive && setWatching(p.identity)}
                onContextMenu={(e) => openMenu(e, p)}
              >
                <span className="avatar">{p.identity.slice(0, 1).toUpperCase()}</span>
                <span className="member-name">{p.identity}</span>
                {isLive ? <span className="badge">live</span> : null}
              </div>
            );
          })}
        </div>

        <div className={'status ' + status}>
          {status === 'connected' ? 'соединение в норме' : null}
          {status === 'connecting' ? 'подключаюсь…' : null}
          {status === 'reconnecting' ? 'переподключаюсь…' : null}
          {status === 'disconnected' ? 'отключено' : null}
        </div>
      </aside>

      <main className={chatOpen ? 'stage-area with-chat' : 'stage-area'}>
        <div className="top-view">
          {stage ? (
            <div className="stage" ref={stageRef}>
              <VideoTile
                track={stage.track}
                className="stage-video"
                fit="contain"
                onDoubleClick={toggleFullscreen}
              />
              <div className="stage-bar">
                <span className="stage-name">
                  <span className="live-tag">
                    <LiveDot /> LIVE
                  </span>
                  {stage.participant.identity}
                </span>
                <StreamStats
                  track={stage.track}
                  kind={stage.participant === localParticipant ? 'out' : 'in'}
                />
                <button
                  className="stage-btn"
                  onClick={toggleFullscreen}
                  title="Во весь экран (F, или двойной клик)"
                  type="button"
                >
                  <ExpandIcon />
                </button>
                <button
                  className="stage-btn"
                  onClick={() => setWatching(null)}
                  title="Свернуть к участникам"
                  type="button"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
          ) : (
            <ParticipantGrid
              participants={participants}
              speakers={speakers}
              localParticipant={localParticipant}
              onWatch={setWatching}
              onContextMenu={openMenu}
            />
          )}
        </div>

        {chatOpen && (
          <div className="chat-dock">
            <Chat messages={messages} onSend={sendMessage} />
          </div>
        )}
      </main>

      <div className="audio-sinks">
        {room
          ? [...room.remoteParticipants.values()].flatMap((p) =>
              p
                .getTrackPublications()
                .filter((pub) => pub.kind === Track.Kind.Audio && pub.track)
                .map((pub) => <AudioSink key={pub.trackSid} track={pub.track} />),
            )
          : null}
      </div>

      {pickerOpen && (
        <SourcePicker
          onPick={pickSource}
          onCancel={() => setPickerOpen(false)}
          withAudio={shareAudio}
          onToggleAudio={() => setShareAudio((v) => !v)}
        />
      )}

      {menu && (
        <ParticipantMenu
          participant={menu.participant}
          x={menu.x}
          y={menu.y}
          isLocal={menu.participant === localParticipant}
          isLive={sharers.some((s) => s.participant === menu.participant)}
          onWatch={setWatching}
          onClose={() => setMenu(null)}
        />
      )}

      {settingsOpen && (
        <Settings
          room={room}
          participants={participants}
          micMode={micMode}
          onMicMode={changeMicMode}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <Controls
        micOn={micOn}
        camOn={camOn}
        screenOn={screenOn}
        deafened={deafened}
        presetKey={presetKey}
        shareAudio={shareAudio}
        chatOpen={chatOpen}
        unread={unread}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleScreen={toggleScreen}
        onToggleDeafen={toggleDeafen}
        onToggleShareAudio={() => setShareAudio((v) => !v)}
        onChangePreset={changePreset}
        onToggleChat={() => {
          setChatOpen((v) => !v);
          setUnread(0);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onLeave={leave}
      />
    </div>
  );
}
