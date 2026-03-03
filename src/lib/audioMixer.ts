/**
 * Web Audio API mixer for multi-camera playback.
 * Routes each video element's audio through a GainNode graph,
 * allowing all-mix (equal gain) or solo (single camera) modes
 * with smooth exponential transitions (no clicks/pops).
 */

export type { AudioMode } from '../types/index.ts';

import type { AudioMode } from '../types/index.ts';

export interface AudioMixer {
  setMode: (mode: AudioMode) => void;
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

  // Initial gain: equal mix across all cameras
  const mixLevel = 1 / videoElements.length;

  for (const video of videoElements) {
    const source = audioCtx.createMediaElementSource(video);
    const gain = audioCtx.createGain();
    gain.gain.value = mixLevel;
    source.connect(gain);
    gain.connect(audioCtx.destination);
    gainNodes.push(gain);
  }

  return {
    setMode(mode: AudioMode): void {
      // Resume if suspended (tab backgrounded or autoplay policy)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;

      if (mode === 'all') {
        // All-mix: equal gain for each camera
        const level = 1 / gainNodes.length;
        for (const gain of gainNodes) {
          gain.gain.setTargetAtTime(level, now, FADE_TIME_CONSTANT);
        }
      } else {
        // Solo: full gain on selected index, silence others
        for (let i = 0; i < gainNodes.length; i++) {
          const target = i === mode ? 1.0 : 0;
          gainNodes[i].gain.setTargetAtTime(target, now, FADE_TIME_CONSTANT);
        }
      }
    },

    destroy(): void {
      // Disconnect all gain nodes
      for (const gain of gainNodes) {
        gain.disconnect();
      }
      // Close the AudioContext (guard against already-closed state)
      if (audioCtx.state !== 'closed') {
        audioCtx.close();
      }
    },
  };
}
