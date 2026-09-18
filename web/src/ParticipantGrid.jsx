import { Track } from 'livekit-client';
import { VideoTile } from './VideoTile.jsx';
import { MicOffIcon, LiveDot } from './Icons.jsx';

/**
 * The default view of a channel: everyone as a tile, like Discord's voice view.
 * A tile shows the webcam when there is one, otherwise a big letter avatar.
 */
export default function ParticipantGrid({
  participants,
  speakers,
  localParticipant,
  onWatch,
  onContextMenu,
}) {
  return (
    <div className="grid-wrap">
      <div className={'pgrid count-' + Math.min(participants.length, 5)}>
        {participants.map((p) => {
          const cam = p.getTrackPublication(Track.Source.Camera);
          const screen = p.getTrackPublication(Track.Source.ScreenShare);
          const isLive = !!(screen && screen.track);
          const talking = speakers.has(p.identity);
          const isLocal = p === localParticipant;

          return (
            <div
              key={p.identity}
              className={'ptile' + (talking ? ' talking' : '') + (isLive ? ' live' : '')}
              onContextMenu={(e) => onContextMenu(e, p)}
            >
              {cam && cam.track ? (
                <VideoTile
                  track={cam.track}
                  muted
                  mirror={isLocal}
                  className="ptile-video"
                  fit="cover"
                />
              ) : (
                <div className="ptile-avatar">
                  <span>{p.identity.slice(0, 1).toUpperCase()}</span>
                </div>
              )}

              <div className="ptile-bar">
                <span className="ptile-name">
                  {p.identity}
                  {isLocal ? ' (ты)' : ''}
                </span>
                {!p.isMicrophoneEnabled && (
                  <span className="ptile-muted" title="микрофон выключен">
                    <MicOffIcon />
                  </span>
                )}
              </div>

              {isLive && (
                <button className="watch-btn" onClick={() => onWatch(p.identity)} type="button">
                  <span className="live-tag">
                    <LiveDot /> LIVE
                  </span>
                  <span className="watch-label">Смотреть</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
