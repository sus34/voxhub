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
import Splitter from './Splitter.jsx';
import {
  CloseIcon,
  DownloadIcon,
  ExpandIcon,
  GearIcon,
  LiveDot,
  LogoMark,
  PanelLeftIcon,
} from './Icons.jsx';
import { applySavedVolumes } from './volumes.js';
import { deviceError } from './devices.js';
import { LAYOUT_DEFAULTS, useLayout, useMediaQuery } from './layout.js';
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

const DEVICE_NAMES = { audioinput: 'Микрофон', videoinput: 'Камера', audiooutput: 'Вывод звука' };

const CHAT_MIN = { bottom: 140, right: 260 };
// Leave the call at least this much room, whatever the chat wants.
const STAGE_MIN = { bottom: 200, right: 320 };

export default function Room({ session, rooms, onSwitchRoom, onLeave, switching, updates = [] }) {
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
  // Non-fatal problems (no camera, mic busy…) — a toast, not the error screen.
  const [notice, setNotice] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);

  const [layout, updateLayout] = useLayout();
  const narrow = useMediaQuery('(max-width: 760px)');
  const chatSide = narrow ? 'bottom' : layout.chatSide;

  const [, bump] = useReducer((n) => n + 1, 0);
  const roomRef = useRef(null);
  const stageRef = useRef(null);
  const areaRef = useRef(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const chatOpenRef = useRef(chatOpen);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    const r = new LKRoom({
      adaptiveStream: true,
      dynacast: true,
      // Remote audio goes through WebAudio with a GainNode per track. Without
      // it volume is set on the <audio> element, which throws above 1.0 — so
      // nobody could be turned up past 100%.
      webAudioMix: true,
      audioCaptureDefaults: MIC_MODES[micMode]?.capture ?? MIC_MODES.clear.capture,
      videoCaptureDefaults: CAMERA_CAPTURE,
    });
    roomRef.current = r;
    setStatus('connecting');

    if (typeof window !== 'undefined') window.__voxroom = r;

    r.on(RoomEvent.ParticipantConnected, (p) => {
      applySavedVolumes(p);
      bump();
    })
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
      // Used to go to setError, i.e. the full "Не подключиться" screen — so
      // pressing the camera button without a camera threw you out of the call.
      .on(RoomEvent.MediaDevicesError, (e, kind) =>
        setNotice(deviceError(DEVICE_NAMES[kind] ?? 'Устройство', e)),
      )
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!r.canPlaybackAudio))
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
        r.remoteParticipants.forEach(applySavedVolumes);
        setAudioBlocked(!r.canPlaybackAudio);
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
    try {
      await localParticipant.setMicrophoneEnabled(!micOn, mode.capture, mode.publish);
    } catch (e) {
      setNotice(deviceError('Микрофон', e));
    }
    bump();
  }, [localParticipant, micOn, micMode]);

  const changeMicMode = useCallback(
    async (key) => {
      setMicMode(key);
      localStorage.setItem('voxhub.micMode', key);
      if (micOn && localParticipant) {
        const mode = MIC_MODES[key];
        try {
          await localParticipant.setMicrophoneEnabled(false);
          await localParticipant.setMicrophoneEnabled(true, mode.capture, mode.publish);
        } catch (e) {
          setNotice(deviceError('Микрофон', e));
        }
        bump();
      }
    },
    [micOn, localParticipant],
  );

  const toggleCam = useCallback(async () => {
    if (!localParticipant) return;
    try {
      await localParticipant.setCameraEnabled(!camOn, CAMERA_CAPTURE, CAMERA_PUBLISH);
    } catch (e) {
      setNotice(deviceError('Камера', e));
    }
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
        // NotAllowedError is just "cancel" in the browser's share dialog.
        if (e && e.name !== 'NotAllowedError') setNotice(deviceError('Показ экрана', e));
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
    else el.requestFullscreen().catch((e) => setNotice('Полный экран: ' + e.message));
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

  const statusText = {
    connected: 'на связи',
    connecting: 'подключаюсь…',
    reconnecting: 'связь рвётся…',
    disconnected: 'отключено',
  }[status];

  const chatSize = chatSide === 'right' ? layout.chatWidth : layout.chatHeight;
  const setChatSize = (v) =>
    updateLayout(chatSide === 'right' ? { chatWidth: v } : { chatHeight: v });
  const resetChatSize = () =>
    setChatSize(chatSide === 'right' ? LAYOUT_DEFAULTS.chatWidth : LAYOUT_DEFAULTS.chatHeight);
  // Box of the stage area: 16px padding each side / top, 14px for the handle.
  const chatMaxFor = (box) =>
    chatSide === 'right'
      ? box.width - 32 - 14 - STAGE_MIN.right
      : box.height - 16 - 14 - STAGE_MIN.bottom;

  return (
    <div className={'app' + (layout.sidebarHidden ? ' sidebar-hidden' : '')}>
      {layout.sidebarHidden ? (
        <aside className="rail">
          <button
            className="rail-btn"
            onClick={() => updateLayout({ sidebarHidden: false })}
            type="button"
            title="Показать панель"
          >
            <PanelLeftIcon />
          </button>

          <div className="rail-members">
            {participants.map((p) => {
              const screen = p.getTrackPublication(Track.Source.ScreenShare);
              const isLive = !!(screen && screen.track);
              return (
                <span
                  key={p.identity}
                  className={
                    'rail-member' +
                    (speakers.has(p.identity) ? ' speaking' : '') +
                    (isLive ? ' live' : '')
                  }
                  title={isLive ? `${p.identity} — в эфире` : p.identity}
                  onClick={() => isLive && setWatching(p.identity)}
                  onContextMenu={(e) => openMenu(e, p)}
                >
                  <span className="avatar">{p.identity.slice(0, 1).toUpperCase()}</span>
                </span>
              );
            })}
          </div>

          <span className={'rail-status ' + status} title={statusText} />

          {updates.length > 0 && (
            <button
              className="rail-btn has-update"
              onClick={updates[0].run}
              type="button"
              title={updates.map((u) => `${u.title} — ${u.action.toLowerCase()}`).join('\n')}
            >
              <DownloadIcon />
            </button>
          )}

          <button
            className="rail-btn"
            onClick={() => setSettingsOpen(true)}
            type="button"
            title="Настройки"
          >
            <GearIcon />
          </button>
        </aside>
      ) : (
        <aside className="sidebar">
          <div className="brand">
            <LogoMark />
            voxhub
            <button
              className="brand-btn"
              onClick={() => updateLayout({ sidebarHidden: true })}
              type="button"
              title="Скрыть панель"
            >
              <PanelLeftIcon />
            </button>
          </div>

          {/* After the top-right card is closed, so the update isn't forgotten. */}
          {updates.map((u) => (
            <button
              key={u.key}
              className="update-banner"
              onClick={u.run}
              type="button"
              title={`${u.title}. ${u.hint}`}
            >
              <b>{u.short}</b>
              <span className="update-banner-go">{u.action}</span>
            </button>
          ))}

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

          {/* Discord-style user panel: who you are, the connection, app settings. */}
          <div className="me-bar">
            <span className="avatar">{session.name.slice(0, 1).toUpperCase()}</span>
            <span className="me-info">
              <span className="me-name">{session.name}</span>
              <span className={'status ' + status}>{statusText}</span>
            </span>
            <button
              className="me-btn"
              onClick={() => setSettingsOpen(true)}
              type="button"
              title="Настройки"
            >
              <GearIcon />
            </button>
          </div>
        </aside>
      )}

      <main
        ref={areaRef}
        className={'stage-area' + (chatOpen ? ' chat-' + chatSide : '')}
        style={{ '--chat-h': layout.chatHeight + 'px', '--chat-w': layout.chatWidth + 'px' }}
      >
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
          <>
            <Splitter
              side={chatSide}
              size={chatSize}
              min={CHAT_MIN[chatSide]}
              maxFor={chatMaxFor}
              onResize={setChatSize}
              onReset={resetChatSize}
              containerRef={areaRef}
            />
            <div className="chat-dock">
              <Chat
                messages={messages}
                onSend={sendMessage}
                side={chatSide}
                onToggleSide={
                  narrow
                    ? null
                    : () => updateLayout({ chatSide: chatSide === 'right' ? 'bottom' : 'right' })
                }
              />
            </div>
          </>
        )}
      </main>

      {(notice || audioBlocked) && (
        <div className="toasts">
          {audioBlocked && room && (
            <button
              className="toast action"
              type="button"
              onClick={() =>
                room
                  .startAudio()
                  .then(() => setAudioBlocked(!room.canPlaybackAudio))
                  .catch(() => {})
              }
            >
              Браузер придержал звук — нажми, чтобы слышать остальных
            </button>
          )}
          {notice && (
            <button className="toast" type="button" onClick={() => setNotice('')}>
              {notice}
            </button>
          )}
        </div>
      )}

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
