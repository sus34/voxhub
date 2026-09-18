import { useEffect, useState } from 'react';
import { Room as LKRoom, Track } from 'livekit-client';
import { MIC_MODES } from './quality.js';
import MicLevel from './MicLevel.jsx';

export default function Settings({ room, participants, micMode, onMicMode, onClose }) {
  const micPub = room && room.localParticipant
    ? room.localParticipant.getTrackPublication(Track.Source.Microphone)
    : null;
  const micTrack = micPub ? micPub.track : null;

  const [devices, setDevices] = useState({ audioinput: [], audiooutput: [], videoinput: [] });
  const [active, setActive] = useState({ audioinput: '', audiooutput: '', videoinput: '' });
  const [volumes, setVolumes] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [mics, speakers, cams] = await Promise.all([
          LKRoom.getLocalDevices('audioinput'),
          LKRoom.getLocalDevices('audiooutput'),
          LKRoom.getLocalDevices('videoinput'),
        ]);
        if (!alive) return;
        setDevices({ audioinput: mics, audiooutput: speakers, videoinput: cams });
      } catch (e) {
        if (alive) setError('Не вижу устройства: ' + e.message);
      }
    }
    load();
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener('devicechange', load);
    };
  }, []);

  async function pickDevice(kind, deviceId) {
    if (!room) return;
    try {
      await room.switchActiveDevice(kind, deviceId);
      setActive((a) => ({ ...a, [kind]: deviceId }));
    } catch (e) {
      setError('Не переключилось: ' + e.message);
    }
  }

  // Volume is per remote participant, and microphone / screen audio are
  // separate sources — handy when someone's game is louder than their voice.
  function setVolume(participant, source, value) {
    participant.setVolume(value, source);
    setVolumes((v) => ({ ...v, [`${participant.identity}:${source}`]: value }));
  }

  function volumeOf(participant, source) {
    const key = `${participant.identity}:${source}`;
    if (key in volumes) return volumes[key];
    const current = participant.getVolume ? participant.getVolume(source) : undefined;
    return current === undefined ? 1 : current;
  }

  const remotes = participants.filter((p) => p !== room?.localParticipant);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h3>Настройки</h3>
          <button className="close" onClick={onClose} type="button">✕</button>
        </div>

        {error && <p className="error">{error}</p>}

        <section>
          <h4>Голос</h4>

          <MicLevel track={micTrack} />

          <div className="mic-modes">
            {Object.entries(MIC_MODES).map(([key, mode]) => (
              <button
                key={key}
                className={key === micMode ? 'preset active' : 'preset'}
                onClick={() => onMicMode(key)}
                type="button"
              >
                <span className="preset-label">{mode.label}</span>
                <span className="preset-hint">{mode.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>Устройства</h4>

          <label>
            Микрофон
            <select
              value={active.audioinput}
              onChange={(e) => pickDevice('audioinput', e.target.value)}
            >
              <option value="">По умолчанию</option>
              {devices.audioinput.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Микрофон'}
                </option>
              ))}
            </select>
          </label>

          <label>
            Наушники / колонки
            <select
              value={active.audiooutput}
              onChange={(e) => pickDevice('audiooutput', e.target.value)}
            >
              <option value="">По умолчанию</option>
              {devices.audiooutput.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Вывод звука'}
                </option>
              ))}
            </select>
          </label>

          <label>
            Камера
            <select
              value={active.videoinput}
              onChange={(e) => pickDevice('videoinput', e.target.value)}
            >
              <option value="">По умолчанию</option>
              {devices.videoinput.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Камера'}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section>
          <h4>Громкость участников</h4>
          {remotes.length === 0 ? (
            <p className="muted">Кроме тебя никого нет.</p>
          ) : (
            remotes.map((p) => (
              <div key={p.identity} className="vol-row">
                <span className="vol-name">{p.identity}</span>

                <label className="vol">
                  <span>голос</span>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={volumeOf(p, Track.Source.Microphone)}
                    onChange={(e) =>
                      setVolume(p, Track.Source.Microphone, Number(e.target.value))
                    }
                  />
                </label>

                <label className="vol">
                  <span>экран</span>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={volumeOf(p, Track.Source.ScreenShareAudio)}
                    onChange={(e) =>
                      setVolume(p, Track.Source.ScreenShareAudio, Number(e.target.value))
                    }
                  />
                </label>
              </div>
            ))
          )}
          <p className="settings-note">
            До 200% — если кого-то еле слышно, можно вытянуть выше нормы.
          </p>
        </section>
      </div>
    </div>
  );
}
