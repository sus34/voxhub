import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Track } from 'livekit-client';
import { MAX_VOLUME, savedVolume, setVolume as applyVolume } from './volumes.js';

/**
 * Right-click menu on a participant, the way Discord does it: volume lives
 * where the person is, not buried in a settings dialog.
 */
export default function ParticipantMenu({ participant, x, y, isLocal, isLive, onWatch, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });

  const [voice, setVoice] = useState(() => readVolume(participant, Track.Source.Microphone));
  const [screen, setScreen] = useState(() =>
    readVolume(participant, Track.Source.ScreenShareAudio),
  );

  // What "Включить обратно" returns to — not always 100%.
  const beforeMute = useRef(1);

  // Not participant.getVolume(): with webAudioMix LiveKit reads it off the
  // hidden <audio> element, which it deliberately keeps at 0 — so the menu
  // opened at "0%" for anyone never adjusted. Every change goes through
  // volumes.js, so the saved value is the real one.
  function readVolume(p, source) {
    if (!p || isLocal) return 1;
    return savedVolume(p.identity, source);
  }

  // Keep the menu inside the window instead of letting it run off the edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.min(x, window.innerWidth - r.width - 8);
    const ny = Math.min(y, window.innerHeight - r.height - 8);
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function setVolume(source, value) {
    if (isLocal || !participant.setVolume) return;
    const v = applyVolume(participant, source, value);
    if (source === Track.Source.Microphone) setVoice(v);
    else setScreen(v);
  }

  const muted = voice === 0;

  function toggleMute() {
    if (muted) {
      setVolume(Track.Source.Microphone, beforeMute.current || 1);
    } else {
      beforeMute.current = voice;
      setVolume(Track.Source.Microphone, 0);
    }
  }

  return (
    <div className="menu-backdrop" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        className="pmenu"
        ref={ref}
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pmenu-head">{participant.identity}</div>

        {isLocal ? (
          <p className="pmenu-note">Это ты. Свою громкость крутить смысла нет.</p>
        ) : (
          <>
            <label className="pmenu-vol">
              <span className="pmenu-vol-label">
                Голос<b>{Math.round(voice * 100)}%</b>
              </span>
              <input
                type="range"
                min="0"
                max={MAX_VOLUME}
                step="0.05"
                value={voice}
                onChange={(e) => setVolume(Track.Source.Microphone, Number(e.target.value))}
                onDoubleClick={() => setVolume(Track.Source.Microphone, 1)}
                title="Двойной клик — вернуть 100%"
              />
            </label>

            <label className="pmenu-vol">
              <span className="pmenu-vol-label">
                Звук экрана<b>{Math.round(screen * 100)}%</b>
              </span>
              <input
                type="range"
                min="0"
                max={MAX_VOLUME}
                step="0.05"
                value={screen}
                onChange={(e) => setVolume(Track.Source.ScreenShareAudio, Number(e.target.value))}
                onDoubleClick={() => setVolume(Track.Source.ScreenShareAudio, 1)}
                title="Двойной клик — вернуть 100%"
              />
            </label>

            <button className="pmenu-item" onClick={toggleMute} type="button">
              {muted ? 'Включить обратно' : 'Заглушить'}
            </button>
          </>
        )}

        {isLive && (
          <button
            className="pmenu-item accent"
            onClick={() => {
              onWatch(participant.identity);
              onClose();
            }}
            type="button"
          >
            Смотреть стрим
          </button>
        )}
      </div>
    </div>
  );
}
