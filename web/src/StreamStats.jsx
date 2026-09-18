import { useEffect, useRef, useState } from 'react';

const LIMITATION_LABEL = {
  cpu: 'упирается в CPU',
  bandwidth: 'упирается в канал',
  other: 'ограничено',
  none: '',
};

/**
 * Live stats for one video track. The useful bit is `qualityLimitationReason`:
 * it tells you whether a soft picture is the encoder running out of CPU or the
 * network refusing the bitrate — the two have completely different fixes.
 */
export default function StreamStats({ track, kind }) {
  const [stats, setStats] = useState(null);
  const prev = useRef(null);

  useEffect(() => {
    if (!track) {
      setStats(null);
      prev.current = null;
      return;
    }

    let alive = true;
    const timer = setInterval(async () => {
      let report;
      try {
        report = await track.getRTCStatsReport();
      } catch {
        return;
      }
      if (!report || !alive) return;

      let rtp = null;
      let remoteInbound = null;
      report.forEach((s) => {
        if (kind === 'out' && s.type === 'outbound-rtp' && s.kind === 'video') rtp = s;
        if (kind === 'in' && s.type === 'inbound-rtp' && s.kind === 'video') rtp = s;
        if (s.type === 'remote-inbound-rtp' && s.kind === 'video') remoteInbound = s;
      });
      if (!rtp) return;

      const bytes = kind === 'out' ? rtp.bytesSent : rtp.bytesReceived;
      const now = rtp.timestamp;
      const last = prev.current;
      let kbps = null;
      if (last && now > last.now) {
        kbps = Math.round(((bytes - last.bytes) * 8) / (now - last.now));
      }
      prev.current = { bytes, now };

      setStats({
        kbps,
        fps: rtp.framesPerSecond ? Math.round(rtp.framesPerSecond) : null,
        width: rtp.frameWidth,
        height: rtp.frameHeight,
        limitation: kind === 'out' ? rtp.qualityLimitationReason : null,
        packetsLost: kind === 'in' ? rtp.packetsLost : remoteInbound?.packetsLost,
        rtt: remoteInbound?.roundTripTime,
        freezes: kind === 'in' ? rtp.freezeCount : null,
        codec: rtp.codecId,
      });
    }, 1000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [track, kind]);

  if (!stats) return null;

  const limitation = stats.limitation && stats.limitation !== 'none'
    ? LIMITATION_LABEL[stats.limitation] ?? stats.limitation
    : null;

  return (
    <div className="stats">
      {stats.width ? <span>{stats.width}×{stats.height}</span> : null}
      {stats.fps != null ? <span>{stats.fps} fps</span> : null}
      {stats.kbps != null ? <span>{(stats.kbps / 1000).toFixed(1)} Mbps</span> : null}
      {stats.rtt != null ? <span>{Math.round(stats.rtt * 1000)} ms</span> : null}
      {stats.freezes ? <span className="warn">фризы: {stats.freezes}</span> : null}
      {limitation ? <span className="warn">{limitation}</span> : null}
    </div>
  );
}
