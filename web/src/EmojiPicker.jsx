import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_CATEGORIES, recentEmoji, rememberEmoji } from './emoji.js';

/**
 * Emoji picker above the chat input: category tabs on top, one scrolling
 * list below. Like Discord, a click inserts and closes; Shift+click keeps it
 * open for several in a row.
 */
export default function EmojiPicker({ onPick, onClose, ignoreRef }) {
  const [recent, setRecent] = useState(recentEmoji);
  const [active, setActive] = useState(null);
  const ref = useRef(null);
  const scrollRef = useRef(null);

  const cats = useMemo(
    () =>
      recent.length
        ? [{ key: 'recent', title: 'Недавние', icon: '🕘', list: recent }, ...EMOJI_CATEGORIES]
        : EMOJI_CATEGORIES,
    // Recents stay put while the picker is open, so the grid doesn't jump
    // under the mouse; they refresh next time it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    const onDown = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (ignoreRef && ignoreRef.current && ignoreRef.current.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose, ignoreRef]);

  // Highlight the tab of the section currently at the top of the list.
  function onScroll() {
    const box = scrollRef.current;
    if (!box) return;
    let current = cats[0].key;
    // .emoji-scroll is position: relative, so offsetTop is measured from it.
    for (const section of box.querySelectorAll('[data-cat]')) {
      if (section.offsetTop <= box.scrollTop + 8) current = section.dataset.cat;
    }
    setActive(current);
  }

  function jump(key) {
    const box = scrollRef.current;
    const section = box && box.querySelector(`[data-cat="${key}"]`);
    if (section) box.scrollTop = section.offsetTop;
  }

  function pick(e, em) {
    onPick(em);
    setRecent(rememberEmoji(em));
    if (!e.shiftKey) onClose();
  }

  const current = active || cats[0].key;

  return (
    <div className="emoji-pop" ref={ref} role="dialog" aria-label="Смайлики">
      <div className="emoji-tabs">
        {cats.map((c) => (
          <button
            key={c.key}
            className={c.key === current ? 'emoji-tab active' : 'emoji-tab'}
            onClick={() => jump(c.key)}
            type="button"
            title={c.title}
          >
            {c.icon}
          </button>
        ))}
      </div>

      <div className="emoji-scroll" ref={scrollRef} onScroll={onScroll}>
        {cats.map((c) => (
          <section key={c.key} data-cat={c.key}>
            <div className="emoji-cat">{c.title}</div>
            <div className="emoji-grid">
              {c.list.map((em) => (
                <button
                  key={em}
                  className="emoji"
                  onClick={(e) => pick(e, em)}
                  type="button"
                >
                  {em}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
