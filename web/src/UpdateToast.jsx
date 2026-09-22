import { CloseIcon, DownloadIcon } from './Icons.jsx';
import { reloadInto } from './updates.js';

/** What each update is and the one button that applies it. */
export function updateItems({ desktop, web }, room) {
  const items = [];
  if (web) {
    items.push({
      key: 'web',
      title: 'Интерфейс обновился',
      short: 'Интерфейс обновился',
      hint: room
        ? `Обновится за пару секунд и вернёт тебя в #${room}`
        : 'Обновится за секунду',
      action: 'Обновить',
      run: () => reloadInto(room),
    });
  }
  if (desktop) {
    items.push({
      key: 'desktop:' + desktop.latest,
      title: `Новая версия приложения — ${desktop.latest}`,
      short: `Приложение ${desktop.latest}`,
      hint: `У тебя ${desktop.current}. Скачай новый voxhub.exe и запускай его вместо старого`,
      action: 'Скачать',
      run: () => window.voxhub.openDownload(desktop.url),
    });
  }
  return items;
}

/** Top-right card, shown once per session; the sidebar keeps a reminder. */
export default function UpdateToast({ items, onDismiss }) {
  if (items.length === 0) return null;

  return (
    <div className="update-toast" role="status">
      <span className="update-toast-icon">
        <DownloadIcon />
      </span>

      <div className="update-toast-body">
        {items.map((it) => (
          <div key={it.key} className="update-toast-item">
            <b>{it.title}</b>
            <span>{it.hint}</span>
            <button className="update-toast-go" onClick={it.run} type="button">
              {it.action}
            </button>
          </div>
        ))}
      </div>

      <button className="update-toast-close" onClick={onDismiss} type="button" title="Позже">
        <CloseIcon />
      </button>
    </div>
  );
}
