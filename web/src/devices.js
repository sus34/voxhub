/**
 * Device helpers.
 *
 * LiveKit's Room.getLocalDevices(kind) asks for permission by calling
 * getUserMedia for that kind whenever labels are missing — including
 * 'videoinput'. With no webcam plugged in that call fails with
 * "Requested device not found", and since all three lists were loaded
 * together, the microphone list went down with it.
 */

export const KINDS = ['audioinput', 'audiooutput', 'videoinput'];

export async function listDevices() {
  let all = await navigator.mediaDevices.enumerateDevices();

  // Labels stay hidden until the page has microphone access. If the mic has
  // never been on, ask for audio only — never video.
  if (all.some((d) => d.kind === 'audioinput' && !d.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      all = await navigator.mediaDevices.enumerateDevices();
    } catch {
      /* keep the unnamed entries, still selectable */
    }
  }

  const out = { audioinput: [], audiooutput: [], videoinput: [] };
  for (const d of all) {
    // 'default' duplicates our own "По умолчанию" option.
    if (out[d.kind] && d.deviceId && d.deviceId !== 'default') out[d.kind].push(d);
  }
  return out;
}

/** Human message for getUserMedia / switch failures. */
export function deviceError(what, e) {
  switch (e && e.name) {
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `${what}: устройство не найдено`;
    case 'NotAllowedError':
    case 'SecurityError':
      return `${what}: нет разрешения`;
    case 'NotReadableError':
    case 'AbortError':
      return `${what}: занято другой программой`;
    default:
      return `${what}: ${(e && e.message) || 'ошибка'}`;
  }
}
