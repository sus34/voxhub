import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DockBottomIcon, DockRightIcon } from './Icons.jsx';
import EmojiPicker from './EmojiPicker.jsx';

// The box grows with the text up to this many lines, then scrolls.
const MAX_LINES = 4;

/**
 * Presentation only. Messages live in Room so they keep arriving while the
 * chat is closed — otherwise unread counting is impossible and history is
 * lost every time you collapse the panel.
 */
export default function Chat({ messages, onSend, side, onToggleSide }) {
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const toggleRef = useRef(null);
  // Where the caret goes after an emoji is inserted (set, then applied after render).
  const caretRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Grow to fit, up to MAX_LINES. Measured from scrollHeight, so it follows
  // soft wrapping as well as Shift+Enter; the width can change too (the chat
  // is resizable), hence the ResizeObserver.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    function fit() {
      const cs = getComputedStyle(el);
      const line = parseFloat(cs.lineHeight);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const max = Math.round(line * MAX_LINES + pad);
      el.style.height = 'auto';
      const full = el.scrollHeight;
      el.style.height = Math.min(full, max) + 'px';
      el.style.overflowY = full > max ? 'auto' : 'hidden';
    }

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [draft]);

  // After an emoji: caret right after it, scrolled into view.
  useLayoutEffect(() => {
    const el = inputRef.current;
    const pos = caretRef.current;
    if (!el || pos == null) return;
    caretRef.current = null;
    el.focus();
    el.setSelectionRange(pos, pos);
    if (pos >= el.value.length) el.scrollTop = el.scrollHeight;
  }, [draft]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setEmojiOpen(false);
    onSend(text);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  /** Insert at the caret (or over the selection), not always at the end. */
  function insertEmoji(em) {
    const el = inputRef.current;
    const start = el ? el.selectionStart : draft.length;
    const end = el ? el.selectionEnd : draft.length;
    caretRef.current = start + em.length;
    setDraft((d) => d.slice(0, start) + em + d.slice(end));
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <span>Чат</span>
        {onToggleSide && (
          <button
            className="chat-head-btn"
            onClick={onToggleSide}
            type="button"
            title={side === 'right' ? 'Чат вниз' : 'Чат направо'}
          >
            {side === 'right' ? <DockBottomIcon /> : <DockRightIcon />}
          </button>
        )}
      </div>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 ? (
          <p className="chat-empty">Пока пусто. История живёт, пока ты в канале.</p>
        ) : null}

        {messages.map((m) => (
          <div key={m.id} className={m.system ? 'msg system' : m.mine ? 'msg mine' : 'msg'}>
            {!m.system && <span className="msg-from">{m.from}</span>}
            <span className="msg-text">{m.text}</span>
          </div>
        ))}
      </div>

      <div className="chat-input">
        {emojiOpen && (
          <EmojiPicker
            onPick={insertEmoji}
            onClose={() => setEmojiOpen(false)}
            ignoreRef={toggleRef}
          />
        )}

        <button
          ref={toggleRef}
          className={emojiOpen ? 'emoji-toggle open' : 'emoji-toggle'}
          onClick={() => setEmojiOpen((v) => !v)}
          type="button"
          title="Смайлики"
        >
          🙂
        </button>
        {/* Short placeholder on purpose: one that wraps makes the empty box grow. */}
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Написать…"
          title="Enter — отправить, Shift+Enter — новая строка"
          rows={1}
          maxLength={2000}
        />
        <button className="chat-send" onClick={send} disabled={!draft.trim()} type="button">
          →
        </button>
      </div>
    </div>
  );
}
