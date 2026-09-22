/**
 * Per-person volume, remembered across sessions and channel switches.
 *
 * Values above 1.0 only work because the room runs with `webAudioMix` — a
 * plain <audio> element throws on volume > 1, which is what used to snap the
 * slider back to 100%.
 */

const KEY = 'voxhub.volumes';
export const MAX_VOLUME = 2;

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function savedVolume(identity, source) {
  const v = readAll()[identity]?.[source];
  return typeof v === 'number' ? v : 1;
}

export function setVolume(participant, source, value) {
  const v = Math.min(MAX_VOLUME, Math.max(0, value));
  participant.setVolume(v, source);

  const all = readAll();
  all[participant.identity] = { ...all[participant.identity], [source]: v };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* not remembered, still applied */
  }
  return v;
}

/** Re-applies what was set last time. The participant keeps it for tracks published later. */
export function applySavedVolumes(participant) {
  const saved = readAll()[participant.identity];
  if (!saved) return;
  for (const [source, v] of Object.entries(saved)) {
    if (typeof v === 'number') participant.setVolume(v, source);
  }
}
