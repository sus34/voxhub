import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Track } from 'livekit-client';

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

  function readVolume(p, source) {
    if (!p || isLocal || !p.getVolume) return 1;
    const v = p.getVolume(source);
    return v === undefined ? 1 : v;
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
    participant.setVolume(value, source);
    if (source === Track.Source.Microphone) setVoice(value);
    else setScreen(value);
  }

  const muted = voice === 0;

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
                max="2"
                step="0.05"
                value={voice}
                onChange={(e) => setVolume(Track.Source.Microphone, Number(e.target.value))}
              />
            </label>

            <label className="pmenu-vol">
              <span className="pmenu-vol-label">
                Звук экрана<b>{Math.round(screen * 100)}%</b>
              </span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={screen}
                onChange={(e) => setVolume(Track.Source.ScreenShareAudio, Number(e.target.value))}
              />
            </label>

            <button
              className="pmenu-item"
              onClick={() => setVolume(Track.Source.Microphone, muted ? 1 : 0)}
              type="button"
            >
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
