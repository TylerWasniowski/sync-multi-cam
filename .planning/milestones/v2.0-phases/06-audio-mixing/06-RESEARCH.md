# Phase 6: Audio Mixing - Research

**Researched:** 2026-03-02
**Domain:** Web Audio API, HTMLMediaElement audio routing, GainNode mixing, React state management
**Confidence:** HIGH

## Summary

Phase 6 adds audio mixing to the existing synchronized multi-camera playback. The current codebase has video elements (`<video>` tags in `VideoTile.tsx`) that are NOT muted and have no Web Audio API integration. When the user presses play, all videos play their native audio tracks simultaneously through the browser's default audio output, resulting in a cacophony of overlapping audio from every camera. The goal is to route all audio through a Web Audio API graph that allows controlled mixing: all tracks audible by default, with the ability to solo a single camera's audio.

The standard approach uses `AudioContext.createMediaElementSource()` to capture each video element's audio output and route it through individual `GainNode` instances. A single `AudioContext` manages the entire graph. For "all mix" mode, all gain nodes are set to `1/N` (where N is the number of cameras) to prevent clipping. For "solo" mode, the selected camera's gain is set to 1.0 and all others are set to 0. Gain transitions use `setTargetAtTime()` with a short time constant (~0.015s) to prevent audible clicks. The `AudioContext` must be created or resumed inside a user gesture (the play button click) to satisfy browser autoplay policies.

**Primary recommendation:** Create a single `AudioContext` on first play, call `createMediaElementSource()` once per video element, route each through a dedicated `GainNode`, connect all gains to `audioCtx.destination`. Store the audio mode ("all" or a specific camera index) in React state. On mode change, fade gains smoothly using `setTargetAtTime()`. Add an audio source dropdown to the `TransportBar`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUD-01 | All camera audio tracks play mixed together by default during preview | Web Audio API graph: `createMediaElementSource()` per video element, each through a `GainNode` set to `1/N`, all connected to `audioCtx.destination`. AudioContext created/resumed on first play click. |
| AUD-02 | User can select a single camera's audio via dropdown next to the download button | Dropdown in TransportBar showing "All Cameras" + per-camera filenames. On selection, set solo camera's gain to 1.0 and all others to 0 using `setTargetAtTime()` for click-free transitions. |
| AUD-03 | Audio selection persists during playback session (survives seek/pause/play) | Audio mode stored in React `useState` in PlaybackSection. GainNode connections are persistent (never disconnected). Mode is re-applied from state after seek/pause/play -- no special handling needed because the Web Audio graph persists independently of HTMLMediaElement playback state. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API (`AudioContext`) | Browser API | Audio routing graph, mixing, gain control | Baseline since April 2021. The only browser API that allows routing audio from multiple media elements through a programmable graph. |
| `createMediaElementSource()` | Browser API | Capture `<video>` element audio into the Web Audio graph | Standard method for feeding HTMLMediaElement audio into Web Audio processing. Once called, audio is re-routed entirely through the graph. |
| `GainNode` | Browser API | Per-channel volume control for mix/solo | Baseline since July 2015. The standard way to control volume in Web Audio. Supports `AudioParam` scheduling methods for click-free transitions. |
| `AudioParam.setTargetAtTime()` | Browser API | Smooth gain transitions to prevent clicks/pops | Exponential ramp that avoids discontinuities in the audio signal. Time constant of 0.015s gives a near-instant but smooth transition. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React state (`useState`) | ^19.2.0 | Track audio mode selection ("all" vs camera index) | Always -- drives which GainNode values are applied |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Web Audio API GainNode routing | `HTMLMediaElement.volume` property per video | Cannot mix to a single output destination. Setting `volume=0` on N-1 videos and `volume=1` on 1 video works for solo mode, but "all mix" at reduced volume causes clipping because each video outputs to the system independently. No smooth transitions. |
| Web Audio API GainNode routing | `HTMLMediaElement.muted` property per video | Binary mute/unmute only -- no volume control, no smooth transitions, no mix mode at reduced levels. |
| `setTargetAtTime()` for smooth transitions | `gain.value` direct assignment | Causes audible clicks/pops due to instantaneous value discontinuity in the audio signal. |
| `setTargetAtTime()` for smooth transitions | `linearRampToValueAtTime()` | Works but requires a `setValueAtTime()` anchor first. `setTargetAtTime()` is simpler for immediate transitions. |

**Installation:**
```bash
# No new dependencies needed -- Web Audio API is a browser-native API
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── audioMixer.ts         # AudioContext + GainNode graph management
├── components/
│   ├── PlaybackSection.tsx    # Add audio mode state, create mixer on first play
│   └── TransportBar.tsx       # Add audio source dropdown
└── types/
    └── index.ts               # Add AudioMode type
```

### Pattern 1: Singleton AudioContext with Lazy Initialization
**What:** Create the `AudioContext` lazily on the first user play action. This guarantees the context is created inside a user gesture, satisfying all browser autoplay policies. Store it in a `useRef` so it persists across renders without triggering re-renders.
**When to use:** Always -- AudioContext must be initialized inside a user gesture.
**Confidence:** HIGH -- verified via [MDN Web Audio API Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).

```typescript
// src/lib/audioMixer.ts

export interface AudioMixer {
  setMode: (mode: AudioMode) => void;
  destroy: () => void;
}

export type AudioMode = 'all' | number; // 'all' = mix, number = solo camera index

export function createAudioMixer(
  videoElements: HTMLVideoElement[],
): AudioMixer {
  const audioCtx = new AudioContext();
  const gainNodes: GainNode[] = [];

  // Create source -> gain -> destination for each video element
  for (const video of videoElements) {
    const source = audioCtx.createMediaElementSource(video);
    const gain = audioCtx.createGain();
    source.connect(gain);
    gain.connect(audioCtx.destination);
    gainNodes.push(gain);
  }

  // Initialize to "all mix" mode
  const mixGain = 1 / videoElements.length;
  for (const gain of gainNodes) {
    gain.gain.value = mixGain;
  }

  function setMode(mode: AudioMode): void {
    // Resume if suspended (e.g., after tab switch)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const FADE_TIME_CONSTANT = 0.015; // ~45ms to 95% (3 * 0.015)

    if (mode === 'all') {
      const mixGain = 1 / videoElements.length;
      for (const gain of gainNodes) {
        gain.gain.setTargetAtTime(mixGain, now, FADE_TIME_CONSTANT);
      }
    } else {
      // Solo: one camera at full volume, rest at zero
      for (let i = 0; i < gainNodes.length; i++) {
        const target = i === mode ? 1.0 : 0;
        gainNodes[i].gain.setTargetAtTime(target, now, FADE_TIME_CONSTANT);
      }
    }
  }

  function destroy(): void {
    // Disconnect all nodes
    for (const gain of gainNodes) {
      gain.disconnect();
    }
    audioCtx.close();
  }

  return { setMode, destroy };
}
```

### Pattern 2: GainNode Graph Topology
**What:** Each video element gets its own `MediaElementAudioSourceNode -> GainNode -> destination` chain. All GainNodes connect to the same `audioCtx.destination`. Volume control is per-node via the `gain.gain` AudioParam.
**When to use:** Always -- this is the fundamental audio routing architecture.
**Confidence:** HIGH -- verified via [MDN createMediaElementSource](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource) and [MDN GainNode](https://developer.mozilla.org/en-US/docs/Web/API/GainNode).

```
                        ┌─ GainNode[0] ─┐
  video[0] → Source[0] ─┤                ├─→ destination (speakers)
                        └────────────────┘
                        ┌─ GainNode[1] ─┐
  video[1] → Source[1] ─┤                ├─→ destination
                        └────────────────┘
                        ┌─ GainNode[2] ─┐
  video[2] → Source[2] ─┤                ├─→ destination
                        └────────────────┘
```

**All mix mode:** `gain[i].value = 1/N` for all i
**Solo mode (camera 1):** `gain[1].value = 1.0`, all others `0`

### Pattern 3: Smooth Gain Transitions
**What:** Use `AudioParam.setTargetAtTime()` instead of direct `gain.value` assignment to avoid audible clicks when switching audio modes.
**When to use:** Every time the audio mode changes (all mix <-> solo, or switching which camera is soloed).
**Confidence:** HIGH -- verified via [MDN setTargetAtTime](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime) and [MDN GainNode best practices](https://developer.mozilla.org/en-US/docs/Web/API/GainNode).

```typescript
// Time constant of 0.015s means:
// - 63.2% of transition in 15ms
// - 95.0% of transition in 45ms
// - 99.3% of transition in 75ms
// This is fast enough to feel instant but smooth enough to prevent clicks.
const FADE_TIME_CONSTANT = 0.015;

// Switch from "all mix" to "solo camera 2":
const now = audioCtx.currentTime;
gainNodes.forEach((gain, i) => {
  const target = i === 2 ? 1.0 : 0;
  gain.gain.setTargetAtTime(target, now, FADE_TIME_CONSTANT);
});
```

### Pattern 4: Integration with PlaybackSection
**What:** The audio mixer is created lazily on the first play action. It is stored in a `useRef` alongside the existing `syncEngineRef`. The audio mode state (`'all'` or a camera index number) is stored in `useState` and passed to the `TransportBar` for the dropdown UI.
**When to use:** Always -- this is how the mixer integrates with the existing component hierarchy.
**Confidence:** HIGH -- follows established project patterns (useRef for engine objects, useState for UI state).

```typescript
// In PlaybackSection.tsx:
const audioMixerRef = useRef<AudioMixer | null>(null);
const [audioMode, setAudioMode] = useState<AudioMode>('all');

// On first play, create the mixer if not yet created
const handlePlay = useCallback(() => {
  // Create audio mixer lazily (first play = user gesture)
  if (!audioMixerRef.current) {
    const videoEls = videoRefs.current.filter(Boolean) as HTMLVideoElement[];
    audioMixerRef.current = createAudioMixer(videoEls);
    // Apply current mode
    audioMixerRef.current.setMode(audioMode);
  }
  // ... existing play logic
}, [audioMode]);

// On audio mode change
const handleAudioModeChange = useCallback((mode: AudioMode) => {
  setAudioMode(mode);
  audioMixerRef.current?.setMode(mode);
}, []);
```

### Anti-Patterns to Avoid
- **Calling `createMediaElementSource()` more than once on the same element:** Throws `InvalidStateError: "HTMLMediaElement already connected previously to a different MediaElementSourceNode"`. Each video element can only be captured once. Store source nodes and never recreate them.
- **Creating `AudioContext` outside a user gesture:** The context starts in `suspended` state and browsers will not allow audio playback until the user interacts. Always create or resume inside a click handler.
- **Setting `gain.value` directly for mode switches:** Causes audible clicks/pops due to instantaneous discontinuity in the audio waveform. Always use `setTargetAtTime()` or `linearRampToValueAtTime()`.
- **Disconnecting/reconnecting nodes to change routing:** Disconnecting a `MediaElementAudioSourceNode` can cause the video element's audio to permanently stop. Instead, keep all nodes connected and control volume via `GainNode.gain` values (0 = silent, 1 = full volume).
- **Forgetting to resume the AudioContext after tab visibility change:** Some browsers suspend the AudioContext when the tab is backgrounded. Call `audioCtx.resume()` on play actions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio mixing/routing | Custom audio buffer merging | Web Audio API `GainNode` graph | The browser's audio graph handles sample-accurate mixing, threading, and output. Custom buffer processing is complex and adds latency. |
| Smooth volume transitions | Manual volume stepping with setInterval/rAF | `AudioParam.setTargetAtTime()` | AudioParam scheduling runs on the audio thread, not the main thread. Manual stepping causes glitches under main thread load. |
| Per-camera volume control | `video.volume` property per element | `GainNode.gain` AudioParam | `video.volume` doesn't route through a mixable graph. Multiple videos at full volume clip. GainNode gives precise, schedulable control. |
| Audio click prevention | Zero-crossing detection, crossfade buffers | `setTargetAtTime()` exponential ramp | The exponential decay is mathematically smooth (no discontinuities). Custom zero-crossing detection is error-prone and complex. |

**Key insight:** The Web Audio API provides everything needed for this phase with zero third-party dependencies. The only custom code is the mixer factory function (~40 lines) and the UI dropdown. The browser handles all the actual audio processing on a dedicated audio thread.

## Common Pitfalls

### Pitfall 1: createMediaElementSource Can Only Be Called Once Per Element
**What goes wrong:** Calling `createMediaElementSource(video)` on a video element that was already captured throws `InvalidStateError`.
**Why it happens:** The Web Audio spec mandates that a media element can only be the source for one `MediaElementAudioSourceNode` at a time. React StrictMode in development causes effects to run twice, potentially triggering this.
**How to avoid:** Create the audio mixer once and store it in a `useRef`. Guard creation with a null check: `if (!audioMixerRef.current) { ... }`. Never recreate the mixer on re-render. In StrictMode, the first effect cleanup will run, so the destroy function must handle being called on a still-active mixer gracefully.
**Warning signs:** Console error: `InvalidStateError: HTMLMediaElement already connected previously to a different MediaElementSourceNode`.

### Pitfall 2: AudioContext Autoplay Policy (Suspended State)
**What goes wrong:** Audio doesn't play even though videos are playing. The AudioContext is in `suspended` state.
**Why it happens:** Browser autoplay policy requires AudioContext to be created or resumed inside a user gesture (click, keydown, etc.). If the context is created during a useEffect or outside a direct event handler chain, it starts suspended.
**How to avoid:** Create the AudioContext inside the play button's click handler, or call `audioCtx.resume()` at the start of every play action. The play button is already a user gesture, so this is naturally satisfied.
**Warning signs:** `audioCtx.state === 'suspended'` after play. Videos play but no sound is heard.

### Pitfall 3: Audio Re-routing Silences Video Default Audio
**What goes wrong:** After calling `createMediaElementSource()`, the video element's audio is no longer sent to the default output. If the GainNode is not connected to `audioCtx.destination`, audio is completely silent.
**Why it happens:** `createMediaElementSource()` re-routes the element's audio entirely through the Web Audio graph. The default HTML audio output is disconnected.
**How to avoid:** Ensure the graph is complete: `source -> gain -> destination`. Never leave a source node unconnected. Test that audio plays after creating the mixer.
**Warning signs:** Video plays but audio is silent. No console errors.

### Pitfall 4: Gain Values and Clipping in Mix Mode
**What goes wrong:** Setting all gain values to 1.0 in "all mix" mode causes audio clipping (distortion) when multiple cameras have loud audio.
**Why it happens:** The browser sums all audio signals at the destination. If 4 cameras each contribute full-volume audio, the summed signal can be 4x normal amplitude, causing clipping.
**How to avoid:** In "all mix" mode, set each gain to `1/N` where N is the number of cameras. This normalizes the total output to approximately unity gain. For solo mode, the solo camera gets gain 1.0 (full volume).
**Warning signs:** Audio sounds distorted/crunchy during "all mix" playback. Volume is noticeably louder in mix mode than solo mode.

### Pitfall 5: AudioContext Suspension on Tab Background
**What goes wrong:** Audio stops when the user switches to another browser tab, and doesn't resume when they switch back.
**Why it happens:** Browsers may suspend the AudioContext (and throttle timers) when a tab is in the background. The `statechange` event fires but automatic resumption is not guaranteed.
**How to avoid:** Call `audioCtx.resume()` in the play handler and optionally listen for the `visibilitychange` event to resume when the tab regains focus.
**Warning signs:** Audio stops after tabbing away and back. `audioCtx.state` is `suspended` or `interrupted`.

### Pitfall 6: React StrictMode Double-Effect Runs
**What goes wrong:** The audio mixer is created, destroyed, then created again during development (React StrictMode double-invokes effects). The second creation fails because video elements are already connected.
**Why it happens:** React 18+ StrictMode deliberately double-fires effects in development to surface bugs.
**How to avoid:** Use a ref guard pattern: only create the mixer if `audioMixerRef.current === null`. Do NOT create the mixer in a useEffect -- create it lazily in the play handler (user gesture), which is not subject to StrictMode double-fire. The play handler is an event callback, not an effect.
**Warning signs:** `InvalidStateError` in development but not production. Audio works on second click but not first.

## Code Examples

### Complete AudioMixer Module
```typescript
// src/lib/audioMixer.ts
// Source: MDN Web Audio API createMediaElementSource + GainNode docs

export type AudioMode = 'all' | number;

export interface AudioMixer {
  setMode: (mode: AudioMode) => void;
  destroy: () => void;
}

const FADE_TIME_CONSTANT = 0.015; // ~45ms to 95% transition

export function createAudioMixer(
  videoElements: HTMLVideoElement[],
): AudioMixer {
  const audioCtx = new AudioContext();
  const gainNodes: GainNode[] = [];

  for (const video of videoElements) {
    const source = audioCtx.createMediaElementSource(video);
    const gain = audioCtx.createGain();
    source.connect(gain);
    gain.connect(audioCtx.destination);
    gainNodes.push(gain);
  }

  // Default: all-mix mode
  const mixLevel = 1 / videoElements.length;
  for (const gain of gainNodes) {
    gain.gain.value = mixLevel;
  }

  return {
    setMode(mode: AudioMode): void {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime;

      if (mode === 'all') {
        const level = 1 / gainNodes.length;
        for (const gain of gainNodes) {
          gain.gain.setTargetAtTime(level, now, FADE_TIME_CONSTANT);
        }
      } else {
        for (let i = 0; i < gainNodes.length; i++) {
          gainNodes[i].gain.setTargetAtTime(
            i === mode ? 1.0 : 0,
            now,
            FADE_TIME_CONSTANT,
          );
        }
      }
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
```

### TransportBar Audio Dropdown Integration
```typescript
// Addition to TransportBar.tsx
// Source: React select element + existing project TransportBar pattern

interface AudioDropdownProps {
  audioMode: AudioMode;
  cameraNames: string[];
  onAudioModeChange: (mode: AudioMode) => void;
}

// Inside TransportBar, add a <select> element:
<select
  value={audioMode === 'all' ? 'all' : String(audioMode)}
  onChange={(e) => {
    const val = e.target.value;
    onAudioModeChange(val === 'all' ? 'all' : Number(val));
  }}
  className="text-xs bg-gray-700 text-gray-300 rounded px-2 py-1"
>
  <option value="all">All Cameras</option>
  {cameraNames.map((name, i) => (
    <option key={i} value={String(i)}>{name}</option>
  ))}
</select>
```

### PlaybackSection Integration
```typescript
// Additions to PlaybackSection.tsx
// Source: Existing project patterns (useRef for engines, useState for UI state)

const audioMixerRef = useRef<AudioMixer | null>(null);
const [audioMode, setAudioMode] = useState<AudioMode>('all');

// In handlePlay callback (already a user gesture):
if (!audioMixerRef.current) {
  const videoEls = videoRefs.current.filter(
    (v): v is HTMLVideoElement => v !== null,
  );
  audioMixerRef.current = createAudioMixer(videoEls);
  audioMixerRef.current.setMode(audioMode);
}

// Cleanup in useEffect return:
return () => {
  audioMixerRef.current?.destroy();
  audioMixerRef.current = null;
};

// Audio mode change handler:
const handleAudioModeChange = useCallback((mode: AudioMode) => {
  setAudioMode(mode);
  audioMixerRef.current?.setMode(mode);
}, []);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `video.volume` per element | Web Audio API `GainNode` graph | Web Audio API Baseline 2021 | Programmable routing, schedulable transitions, mix/solo capabilities |
| `video.muted` toggle | `GainNode.gain` set to 0 | Web Audio API Baseline 2021 | Smooth fade instead of hard mute, no audio clicks |
| Direct `gain.value` assignment | `setTargetAtTime()` scheduling | Best practice since Web Audio 1.0 | Eliminates audible clicks on gain changes |
| Multiple AudioContext instances | Single shared AudioContext | Best practice since Web Audio 1.0 | Lower resource usage, simpler state management, avoids browser limits on context count |

**Deprecated/outdated:**
- `webkitAudioContext` prefix: No longer needed. Standard `AudioContext` has Baseline support since April 2021.
- `createGain()` factory method: Still works but `new GainNode(audioCtx)` constructor is the modern approach. Both are valid.

## Open Questions

1. **Mix gain level: `1/N` vs constant**
   - What we know: Setting each camera's gain to `1/N` in all-mix mode prevents clipping but reduces overall volume as camera count increases. With 2 cameras, each plays at 50%; with 8, each at 12.5%.
   - What's unclear: Whether `1/N` makes the all-mix mode too quiet with many cameras. An alternative is `1/sqrt(N)` which is louder but risks some clipping with correlated signals.
   - Recommendation: Start with `1/N` (safest, no clipping). If user feedback says it's too quiet, adjust to `1/sqrt(N)`. The gain formula is a single constant -- trivial to change later.

2. **Audio mixer lifecycle with React StrictMode**
   - What we know: Creating the mixer inside the play handler (not useEffect) avoids StrictMode double-fire. But the cleanup still needs to happen on unmount.
   - What's unclear: If the component unmounts and remounts (unlikely in this app, but possible with React transitions), the video elements may already have been captured by a previous mixer.
   - Recommendation: The destroy function should close the AudioContext. On remount, new video elements are created (VideoTile creates new blob URLs), so new `createMediaElementSource()` calls on fresh elements will succeed. Test this in development with StrictMode enabled.

3. **Dropdown placement: "next to the download button" vs TransportBar**
   - What we know: AUD-02 says "via dropdown next to the download button." The download button is in the `SyncResults` component, which is above the playback section.
   - What's unclear: Placing the audio dropdown far from the transport controls (in SyncResults) may be confusing UX. The TransportBar is the natural home for playback-related controls.
   - Recommendation: Place the dropdown in the TransportBar, adjacent to the display mode toggle. This keeps all playback controls together. The requirement says "next to the download button" -- interpret this as "in the playback control area" since the download button's location was set before the playback section existed.

## Sources

### Primary (HIGH confidence)
- [MDN: AudioContext.createMediaElementSource()](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource) - API docs, re-routing behavior, CORS restrictions, code examples
- [MDN: GainNode](https://developer.mozilla.org/en-US/docs/Web/API/GainNode) - Gain control, AudioParam scheduling, click prevention
- [MDN: AudioParam.setTargetAtTime()](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime) - Exponential fade formula, time constant semantics, progression table
- [MDN: Web Audio API Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) - AudioContext lifecycle, user gesture requirements, autoplay policy
- [MDN: MediaElementAudioSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/MediaElementAudioSourceNode) - Source node behavior, one-per-element restriction
- [Chrome Autoplay Policy](https://developer.chrome.com/blog/autoplay) - User gesture requirements for AudioContext

### Secondary (MEDIUM confidence)
- [Chromium Bug #429204](https://chromium-bugs.chromium.narkive.com/n3GguwtL/re-issue-429204-in-chromium-calling-createmediaelementsource-twice-with-the-same-htmlmediaelement) - Confirms `createMediaElementSource()` throws on duplicate calls (verified via MDN docs)
- [WebAudio Issue #822](https://github.com/WebAudio/web-audio-api/issues/822) - Video elements cannot be disconnected from Web Audio once connected (confirmed by MDN re-routing note)
- [alemangui.github.io: Web Audio clicks](http://alemangui.github.io/ramp-to-value) - Demonstrates click artifacts from direct `gain.value` assignment vs ramp methods

### Tertiary (LOW confidence)
- None -- all findings verified with at least two authoritative sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Web Audio API is a stable browser-native API, Baseline since 2021. All methods (`createMediaElementSource`, `GainNode`, `setTargetAtTime`) verified via MDN.
- Architecture: HIGH - The source -> gain -> destination graph topology is the canonical Web Audio pattern for multi-source mixing. Verified via MDN examples and Web Audio specification.
- Pitfalls: HIGH - All pitfalls documented with specific API behaviors and confirmed via official sources: one-source-per-element restriction, autoplay policy, gain clipping, StrictMode double-fire.

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable browser APIs, unlikely to change)
