import { useEffect, useRef, useState } from 'react';

/**
 * Live input meter for the local microphone.
 *
 * It reuses the already-published MediaStreamTrack instead of calling
 * getUserMedia again — a second capture of the same device can fail or fight
 * with the first one on Windows.
 */
export default function MicLevel({ track }) {
  const [level, setLevel] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const mst = track && track.mediaStreamTrack;
    if (!mst) {
      setLevel(0);
      return;
    }

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(new MediaStream([mst]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    // Note: deliberately NOT connected to ctx.destination — routing the mic to
    // the speakers is exactly the feedback loop we are trying to avoid.

    const buf = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      setLevel((prev) => Math.max(peak, prev * 0.85));
      raf.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf.current);
      source.disconnect();
      analyser.disconnect();
      ctx.close().catch(() => {});
    };
  }, [track]);

  const pct = Math.min(100, Math.round(level * 140));

  return (
    <div className="miclevel">
      <div className="miclevel-bar">
        <div className="miclevel-fill" style={{ width: pct + '%' }} />
      </div>
      <span className="miclevel-hint">
        {track ? (pct > 4 ? 'слышно' : 'тишина — скажи что-нибудь') : 'микрофон выключен'}
      </span>
    </div>
  );
}
