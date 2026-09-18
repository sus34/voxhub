import { AudioPresets } from 'livekit-client';

/**
 * Screen share quality presets.
 *
 * Three things here matter more than everything else in this project:
 *
 * 1. `screenShareEncoding` — screen share bitrate is NOT `videoEncoding`.
 *    Without it WebRTC settles around 2.5 Mbps and 1080p60 turns to mush.
 *
 * 2. `degradationPreference` — LiveKit defaults screen share to
 *    'maintain-resolution', which drops frames to keep pixels sharp. Right for
 *    reading code, wrong for games, where 60fps is the point.
 *
 * 3. `scalabilityMode: 'L1T3'` — one spatial layer, three temporal layers.
 *    The default L3T3_KEY splits the bitrate across three resolutions; when
 *    everyone watches fullscreen that is wasted. L1T3 spends it all on one
 *    good layer while still letting a weak viewer drop to a lower framerate.
 */
export const STREAM_PRESETS = {
  gaming1080p60: {
    label: 'Игры — 1080p60',
    hint: '8 Mbps · плавность важнее резкости',
    capture: {
      resolution: { width: 1920, height: 1080, frameRate: 60 },
      contentHint: 'motion',
    },
    publish: {
      screenShareEncoding: { maxBitrate: 8_000_000, maxFramerate: 60, priority: 'high' },
      videoCodec: 'vp9',
      degradationPreference: 'maintain-framerate',
      scalabilityMode: 'L1T3',
      simulcast: false,
    },
  },

  gaming1440p60: {
    label: 'Игры — 1440p60',
    hint: '12 Mbps · нужен толстый канал у всех',
    capture: {
      resolution: { width: 2560, height: 1440, frameRate: 60 },
      contentHint: 'motion',
    },
    publish: {
      screenShareEncoding: { maxBitrate: 12_000_000, maxFramerate: 60, priority: 'high' },
      videoCodec: 'vp9',
      degradationPreference: 'maintain-framerate',
      scalabilityMode: 'L1T3',
      simulcast: false,
    },
  },

  detail1440p30: {
    label: 'Код и текст — 1440p30',
    hint: '6 Mbps · максимум резкости, буквы не мылятся',
    capture: {
      resolution: { width: 2560, height: 1440, frameRate: 30 },
      contentHint: 'text',
    },
    publish: {
      screenShareEncoding: { maxBitrate: 6_000_000, maxFramerate: 30, priority: 'high' },
      videoCodec: 'vp9',
      degradationPreference: 'maintain-resolution',
      scalabilityMode: 'L1T3',
      simulcast: false,
    },
  },

  light720p60: {
    label: 'Экономный — 720p60',
    hint: '3 Mbps · для слабого интернета',
    capture: {
      resolution: { width: 1280, height: 720, frameRate: 60 },
      contentHint: 'motion',
    },
    publish: {
      screenShareEncoding: { maxBitrate: 3_000_000, maxFramerate: 60, priority: 'high' },
      videoCodec: 'vp9',
      degradationPreference: 'maintain-framerate',
      scalabilityMode: 'L1T3',
      simulcast: false,
    },
  },
};

export const DEFAULT_PRESET = 'gaming1080p60';

/** Screen audio: full-quality stereo, this is game/music sound, not speech. */
export const SCREEN_AUDIO_PUBLISH = {
  audioPreset: AudioPresets.musicHighQualityStereo,
  dtx: false, // never gate game audio on a speech detector
  red: false,
  forceStereo: true,
};

/**
 * Capture options for the screen's audio.
 *
 * `restrictOwnAudio` is the fix for the echo loop. System audio capture takes
 * the whole soundcard output — which includes the voices voxhub itself is
 * playing. So while you share, your capture re-sends everyone's voices back to
 * them, and they hear themselves delayed. Headphones do NOT help: this is
 * digital capture of the output stream, not a microphone picking up speakers.
 *
 * This constraint tells Chromium to exclude audio this page is playing from
 * the captured stream, so the game is shared and the conversation is not.
 *
 * The speech processing is deliberately off: noise suppression and AGC are
 * tuned for voices and would mangle music and game audio.
 */
export const SCREEN_AUDIO_CAPTURE = {
  restrictOwnAudio: true,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/**
 * Microphone modes.
 *
 * The default used to be AudioPresets.speech — 24 kbps. That is the codec
 * budget of a phone call and it makes voices sound thin and metallic. Even the
 * "clear" mode now runs at 96 kbps, which costs 5 x 96 kbps for a full room:
 * nothing on a 100 Mbps link.
 *
 * `dtx` (discontinuous transmission) stops sending during silence. It saves
 * bandwidth we do not need to save and it clips the first syllable when you
 * start talking, so it is off in both modes.
 */
export const MIC_MODES = {
  clear: {
    label: 'Чистый',
    hint: '96 kbps · шумодав, эхоподавление — обычный режим',
    capture: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    publish: {
      audioPreset: AudioPresets.musicHighQuality,
      dtx: false,
      red: true,
    },
  },

  /**
   * `voiceIsolation` is a much stronger, ML-based noise filter than plain
   * `noiseSuppression` — it keeps the voice and drops keyboard, fans and
   * background TV. Chromium-only; browsers without it just ignore the hint
   * and fall back to the ordinary suppressor.
   */
  quiet: {
    label: 'Тихий',
    hint: '96 kbps · сильный шумодав: клавиатура, кулеры, фон',
    capture: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      voiceIsolation: true,
    },
    publish: {
      audioPreset: AudioPresets.musicHighQuality,
      dtx: false,
      red: true,
    },
  },

  hifi: {
    label: 'Живой',
    hint: '128 kbps стерео · без обработки, только в наушниках',
    capture: {
      // All processing off: the browser's noise suppression and auto gain are
      // what make a voice sound "processed". Without echo cancellation this
      // mode feeds speakers straight back into the room, hence headphones.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    publish: {
      audioPreset: AudioPresets.musicHighQualityStereo,
      dtx: false,
      red: true,
      forceStereo: true,
    },
  },
};

// Default to the strong filter: a gaming room has keyboards and fans in it.
export const DEFAULT_MIC_MODE = 'quiet';

// Kept for call sites that just want the current default.
export const MIC_CAPTURE = MIC_MODES.clear.capture;
export const MIC_PUBLISH = MIC_MODES.clear.publish;

/** Webcam — secondary here, screen share is the point. */
export const CAMERA_CAPTURE = {
  resolution: { width: 1280, height: 720, frameRate: 30 },
};

export const CAMERA_PUBLISH = {
  videoEncoding: { maxBitrate: 1_500_000, maxFramerate: 30 },
  videoCodec: 'vp9',
  degradationPreference: 'maintain-framerate',
  simulcast: true, // camera is small on screen for most viewers, simulcast helps
};
