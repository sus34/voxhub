import { useState } from 'react';

const STEP = 24;

/**
 * Drag handle between the call and the chat.
 *
 * `side` is where the chat is: 'bottom' resizes its height, 'right' its width.
 * The size is measured from the chat's outer edge, so the chat keeps its size
 * when the window grows and the call takes the rest — the way Discord behaves.
 */
export default function Splitter({ side, size, min, maxFor, onResize, onReset, containerRef }) {
  const [dragging, setDragging] = useState(false);
  const vertical = side === 'right';

  function clamp(v, box) {
    return Math.round(Math.min(maxFor(box), Math.max(min, v)));
  }

  function onPointerDown(e) {
    if (e.button !== 0 || !containerRef.current) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const box = containerRef.current.getBoundingClientRect();
    // The stage area has 16px padding on the right and none at the bottom.
    const edge = vertical ? box.right - 16 : box.bottom;
    const half = vertical ? handle.offsetWidth / 2 : handle.offsetHeight / 2;

    handle.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.classList.add(vertical ? 'resizing-x' : 'resizing-y');

    const move = (ev) => {
      const pos = vertical ? ev.clientX : ev.clientY;
      onResize(clamp(edge - pos - half, box));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-x', 'resizing-y');
      setDragging(false);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  function onKeyDown(e) {
    const grow = vertical ? 'ArrowLeft' : 'ArrowUp';
    const shrink = vertical ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== grow && e.key !== shrink && e.key !== 'Home') return;
    e.preventDefault();
    if (e.key === 'Home') return onReset();
    const box = containerRef.current.getBoundingClientRect();
    onResize(clamp(size + (e.key === grow ? STEP : -STEP), box));
  }

  return (
    <div
      className={'splitter ' + (vertical ? 'v' : 'h') + (dragging ? ' dragging' : '')}
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuenow={size}
      aria-label="Размер чата"
      tabIndex={0}
      title="Потяни, чтобы изменить размер. Двойной клик — как было"
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
