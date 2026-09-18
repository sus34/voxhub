import { useEffect, useState } from 'react';

/**
 * Desktop-only source picker: lets you share one window instead of the whole
 * screen. In the browser this never renders — there the browser's own share
 * dialog does the job.
 */
export default function SourcePicker({ onPick, onCancel, withAudio, onToggleAudio }) {
  const [sources, setSources] = useState(null);
  const [tab, setTab] = useState('screen');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    window.voxhub
      .listSources()
      .then((list) => {
        if (alive) setSources(list);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  const shown = sources ? sources.filter((s) => (tab === 'screen' ? s.isScreen : !s.isScreen)) : [];

  return (
    <div className="picker-overlay" onClick={onCancel}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <h3>Что показать</h3>
          <div className="picker-tabs">
            <button
              className={tab === 'screen' ? 'ptab active' : 'ptab'}
              onClick={() => setTab('screen')}
              type="button"
            >
              Экран
            </button>
            <button
              className={tab === 'window' ? 'ptab active' : 'ptab'}
              onClick={() => setTab('window')}
              type="button"
            >
              Окно
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        {sources === null ? (
          <p className="muted picker-empty">Смотрю, что открыто…</p>
        ) : shown.length === 0 ? (
          <p className="muted picker-empty">Ничего не нашлось</p>
        ) : (
          <div className="picker-grid">
            {shown.map((s) => (
              <button key={s.id} className="src" onClick={() => onPick(s.id)} type="button">
                <span className="src-thumb">
                  {s.thumbnail ? <img src={s.thumbnail} alt="" /> : <span className="src-blank" />}
                </span>
                <span className="src-name">
                  {s.appIcon && <img className="src-icon" src={s.appIcon} alt="" />}
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        )}

        <label className="picker-audio">
          <input type="checkbox" checked={withAudio} onChange={onToggleAudio} />
          <span>
            Со звуком
            <small>
              Берётся звук всей системы — в него попадают и голоса из voxhub. Если пойдёт эхо,
              выведи voxhub на другое устройство в настройках звука Windows.
            </small>
          </span>
        </label>
      </div>
    </div>
  );
}
