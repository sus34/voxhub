import { useEffect, useRef } from 'react';

/** Attaches a LiveKit track to a media element and detaches on cleanup. */
export function VideoTile({ track, mirror, muted, className, fit = 'contain', onDoubleClick }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      playsInline
      muted={muted}
      onDoubleClick={onDoubleClick}
      style={{ objectFit: fit, transform: mirror ? 'scaleX(-1)' : undefined }}
    />
  );
}

/** Remote audio needs to be in the DOM to play, but is never visible. */
export function AudioSink({ track }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return <audio ref={ref} autoPlay />;
}
