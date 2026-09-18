import { useEffect, useRef, useState } from 'react';

const EMOJI = [
  '😀', '😂', '🙃', '😎', '🤔', '😱', '😭', '🥲',
  '👍', '👎', '🔥', '💀', '🤝', '👀', '🎉', '❤️',
  '🤡', '💩', '🗿', '😈', '🥱', '🤯', '🫡', '🙏',
];

/**
 * Presentation only. Messages live in Room so they keep arriving while the
 * chat is closed — otherwise unread counting is impossible and history is
 * lost every time you collapse the panel.
 */
export default function Chat({ messages, onSend }) {
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onSend(text);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function addEmoji(em) {
    setDraft((d) => d + em);
    setEmojiOpen(false);
    if (inputRef.current) inputRef.current.focus();
  }

  return (
    <div className="chat">
      <div className="chat-head">Чат</div>

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

      {emojiOpen && (
        <div className="emoji-grid">
          {EMOJI.map((em) => (
            <button key={em} className="emoji" onClick={() => addEmoji(em)} type="button">
              {em}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input">
        <button
          className="emoji-toggle"
          onClick={() => setEmojiOpen((v) => !v)}
          type="button"
          title="Смайлики"
        >
          🙂
        </button>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Написать…  (Enter — отправить)"
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
