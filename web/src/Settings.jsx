import { useEffect, useState } from 'react';
import { Track } from 'livekit-client';
import { MIC_MODES } from './quality.js';
import MicLevel from './MicLevel.jsx';
import ServerAdmin from './ServerAdmin.jsx';
import { KINDS, deviceError, listDevices } from './devices.js';

const LABELS = {
  audioinput: { title: 'Микрофон', unnamed: 'Микрофон', none: 'Микрофон не найден' },
  audiooutput: { title: 'Наушники / колонки', unnamed: 'Вывод звука', none: 'Нет устройств вывода' },
  videoinput: { title: 'Камера', unnamed: 'Камера', none: 'Камера не найдена' },
};

/**
 * App settings: voice mode and devices; for the owner also invites and who is
 * on the server. Per-person volume is not here — it lives on right-click,
 * next to the person.
 */
export default function Settings({ room, me, micMode, onMicMode, onLogout, onClose }) {
  const micPub = room && room.localParticipant
    ? room.localParticipant.getTrackPublication(Track.Source.Microphone)
    : null;
  const micTrack = micPub ? micPub.track : null;

  const [devices, setDevices] = useState({ audioinput: [], audiooutput: [], videoinput: [] });
  const [active, setActive] = useState(() => {
    const out = {};
    for (const kind of KINDS) {
      const id = room ? room.getActiveDevice(kind) : '';
      out[kind] = id && id !== 'default' ? id : '';
    }
    return out;
  });
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const list = await listDevices();
        if (alive) setDevices(list);
      } catch (e) {
        if (alive) setError(deviceError('Устройства', e));
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
    setError('');
    try {
      if (deviceId) {
        await room.switchActiveDevice(kind, deviceId);
      } else if (kind === 'videoinput') {
        // Cameras have no 'default' entry — "по умолчанию" means the first one.
        await room.switchActiveDevice(kind, devices.videoinput[0].deviceId);
      } else {
        // Not exact: a system without a 'default' entry just gets any device.
        await room.switchActiveDevice(kind, 'default', false);
      }
      setActive((a) => ({ ...a, [kind]: deviceId }));
    } catch (e) {
      setError(deviceError(LABELS[kind].title, e));
    }
  }

  function deviceSelect(kind) {
    const list = devices[kind];
    const { title, unnamed, none } = LABELS[kind];
    // A remembered id for a device that has since been unplugged.
    const value = list.some((d) => d.deviceId === active[kind]) ? active[kind] : '';

    return (
      <label key={kind}>
        {title}
        {list.length === 0 ? (
          <select disabled value="">
            <option value="">{none}</option>
          </select>
        ) : (
          <select value={value} onChange={(e) => pickDevice(kind, e.target.value)}>
            <option value="">По умолчанию</option>
            {list.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `${unnamed} ${i + 1}`}
              </option>
            ))}
          </select>
        )}
      </label>
    );
  }

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
          {KINDS.map(deviceSelect)}
        </section>

        <p className="settings-note">
          Громкость отдельного человека — правой кнопкой по нему, до 200%.
        </p>

        {me.role === 'owner' && <ServerAdmin meId={me.id} />}

        <section>
          <h4>Аккаунт</h4>
          <div className="account-row">
            <span>
              {me.name}
              <small>{me.role === 'owner' ? 'владелец сервера' : 'участник'}</small>
            </span>
            <button className="admin-btn" onClick={onLogout} type="button">
              Выйти из аккаунта
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
