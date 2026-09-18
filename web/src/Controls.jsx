import { useState } from 'react';
import { STREAM_PRESETS } from './quality.js';
import {
  MicIcon,
  MicOffIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  ScreenIcon,
  ScreenOffIcon,
  CamIcon,
  CamOffIcon,
  ChatIcon,
  GearIcon,
  LeaveIcon,
  SlidersIcon,
} from './Icons.jsx';

export default function Controls({
  micOn,
  camOn,
  screenOn,
  deafened,
  presetKey,
  shareAudio,
  chatOpen,
  unread,
  onToggleMic,
  onToggleCam,
  onToggleScreen,
  onToggleDeafen,
  onToggleShareAudio,
  onChangePreset,
  onToggleChat,
  onOpenSettings,
  onLeave,
}) {
  const [qualityOpen, setQualityOpen] = useState(false);
  const preset = STREAM_PRESETS[presetKey];

  return (
    <footer className="controls">
      {qualityOpen && (
        <div className="settings-pop">
          <div className="settings-title">Качество стрима</div>
          {Object.entries(STREAM_PRESETS).map(([key, p]) => (
            <button
              key={key}
              className={key === presetKey ? 'preset active' : 'preset'}
              onClick={() => {
                onChangePreset(key);
                setQualityOpen(false);
              }}
              type="button"
            >
              <span className="preset-label">{p.label}</span>
              <span className="preset-hint">{p.hint}</span>
            </button>
          ))}

          <label className="share-audio">
            <input type="checkbox" checked={shareAudio} onChange={onToggleShareAudio} />
            <span>
              Со звуком
              <small>
                Берётся звук всей системы. Если пойдёт эхо — сними галочку или выведи voxhub
                на другое устройство в настройках звука Windows.
              </small>
            </span>
          </label>
        </div>
      )}

      {/* Voice actions: the three you press constantly. */}
      <div className="ctl-group primary">
        <button
          className={micOn ? 'ctl on' : 'ctl off'}
          onClick={onToggleMic}
          type="button"
          title={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
        >
          {micOn ? <MicIcon /> : <MicOffIcon />}
        </button>

        <button
          className={screenOn ? 'ctl live' : 'ctl primary'}
          onClick={onToggleScreen}
          type="button"
          title={screenOn ? 'Остановить показ экрана' : 'Показать экран'}
        >
          {screenOn ? <ScreenOffIcon /> : <ScreenIcon />}
        </button>

        <button
          className={deafened ? 'ctl off' : 'ctl on'}
          onClick={onToggleDeafen}
          type="button"
          title={deafened ? 'Включить звук' : 'Заглушить всех'}
        >
          {deafened ? <SpeakerOffIcon /> : <SpeakerIcon />}
        </button>
      </div>

      <div className="ctl-divider" />

      {/* Everything else: pressed occasionally. */}
      <div className="ctl-group">
        <button
          className={camOn ? 'ctl on' : 'ctl'}
          onClick={onToggleCam}
          type="button"
          title={camOn ? 'Выключить камеру' : 'Включить камеру'}
        >
          {camOn ? <CamIcon /> : <CamOffIcon />}
        </button>

        <button
          className="ctl"
          onClick={() => setQualityOpen((v) => !v)}
          type="button"
          title={preset ? `Качество: ${preset.label} — ${preset.hint}` : 'Качество стрима'}
        >
          <SlidersIcon />
        </button>

        <button
          className={chatOpen ? 'ctl on' : 'ctl'}
          onClick={onToggleChat}
          type="button"
          title="Чат"
        >
          <ChatIcon />
          {!chatOpen && unread > 0 ? <span className="unread">{unread}</span> : null}
        </button>

        <button className="ctl" onClick={onOpenSettings} type="button" title="Настройки">
          <GearIcon />
        </button>

        <button className="ctl danger" onClick={onLeave} type="button" title="Выйти из канала">
          <LeaveIcon />
        </button>
      </div>
    </footer>
  );
}
