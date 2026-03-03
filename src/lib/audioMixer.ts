/**
 * Web Audio API mixer for multi-camera playback.
 * Routes each video element's audio through a GainNode graph,
 * allowing per-track mute/unmute with smooth exponential transitions
 * (no clicks/pops).
 */

export interface AudioMixer {
  setTrackMuted: (index: number, muted: boolean) => void;
  destroy: () => void;
}

/** Exponential decay time constant for gain transitions (~45ms to 95%) */
const FADE_TIME_CONSTANT = 0.015;

/**
 * Creates an audio mixer that routes video element audio through
 * a Web Audio API gain graph.
 *
 * IMPORTANT: createMediaElementSource() can only be called ONCE per
 * video element. Store the returned mixer in a ref and guard with
 * a null check. Create inside a user gesture handler (play button)
 * to satisfy AudioContext autoplay policy.
 */
export function createAudioMixer(videoElements: HTMLVideoElement[]): AudioMixer {
  const audioCtx = new AudioContext();
  const gainNodes: GainNode[] = [];

  for (const video of videoElements) {
    const source = audioCtx.createMediaElementSource(video);
    const gain = audioCtx.createGain();
    gain.gain.value = 1.0;
    source.connect(gain);
    gain.connect(audioCtx.destination);
    gainNodes.push(gain);
  }

  return {
    setTrackMuted(index: number, muted: boolean): void {
      if (index < 0 || index >= gainNodes.length) return;

      // Resume if suspended (tab backgrounded or autoplay policy)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      gainNodes[index].gain.setTargetAtTime(muted ? 0 : 1.0, now, FADE_TIME_CONSTANT);
    },

    destroy(): void {
      for (const gain of gainNodes) {
        gain.disconnect();
      }
      if (audioCtx.state !== 'closed') {
        audioCtx.close();
      }
    },
  };
}
