/**
 * Web Worker: WebCodecs + Mediabunny export pipeline.
 *
 * Demuxes multiple MP4 inputs, decodes video frames, composites them onto
 * an OffscreenCanvas at grid positions, encodes H.264+AAC via hardware-
 * accelerated WebCodecs, and muxes to MP4.
 *
 * Communication with the main thread uses typed ExportWorkerCommand /
 * ExportWorkerMessage messages.
 */

import {
  Input, Output, MP4,
  BlobSource, BufferTarget,
  Mp4OutputFormat, CanvasSource,
  VideoSampleSink, AudioBufferSink,
  AudioBufferSource,
} from 'mediabunny';
import { computeGridLayout } from './gridLayout';
import type { ExportWorkerCommand, ExportWorkerMessage, AudioConfig } from '../types/index';

let cancelled = false;

function post(msg: ExportWorkerMessage, transfer?: Transferable[]): void {
  if (transfer) {
    self.postMessage(msg, { transfer });
  } else {
    self.postMessage(msg);
  }
}

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

/**
 * Concatenate an array of AudioBuffer chunks into a single AudioBuffer.
 * All chunks must share the same numberOfChannels and sampleRate.
 */
function concatenateAudioBuffers(
  chunks: AudioBuffer[],
  sampleRate: number,
  channels: number,
): AudioBuffer {
  if (chunks.length === 0) {
    // Return a silent 1-sample buffer as a fallback
    return new AudioBuffer({ length: 1, numberOfChannels: channels, sampleRate });
  }

  const totalLength = chunks.reduce((sum, buf) => sum + buf.length, 0);
  const merged = new AudioBuffer({
    length: totalLength,
    numberOfChannels: channels,
    sampleRate,
  });

  for (let ch = 0; ch < channels; ch++) {
    const dest = merged.getChannelData(ch);
    let offset = 0;
    for (const chunk of chunks) {
      // If the chunk has fewer channels, fill with silence
      if (ch < chunk.numberOfChannels) {
        dest.set(chunk.getChannelData(ch), offset);
      }
      offset += chunk.length;
    }
  }

  return merged;
}

/**
 * Decode and mix audio from the relevant inputs per the AudioConfig.
 * Returns an AudioBuffer ready for AudioBufferSource.add(), or null
 * if no audio should be included.
 */
async function mixAudio(
  inputs: Input[],
  audioConfig: AudioConfig,
  offsets: number[],
  totalDurationSeconds: number,
): Promise<AudioBuffer | null> {
  if (audioConfig.mode === 'none') return null;

  const unmutedIndices =
    audioConfig.mode === 'single'
      ? [audioConfig.trackIndex]
      : audioConfig.trackIndices;

  if (unmutedIndices.length === 0) return null;

  const sampleRate = 48_000;
  const channels = 2; // stereo output

  // Decode audio from each unmuted track
  const decodedAudio: { buffer: AudioBuffer; offset: number }[] = [];

  for (const idx of unmutedIndices) {
    if (idx >= inputs.length) continue;

    const audioTrack = await inputs[idx].getPrimaryAudioTrack();
    if (!audioTrack) continue;

    const sink = new AudioBufferSink(audioTrack);
    const chunks: AudioBuffer[] = [];

    for await (const { buffer } of sink.buffers()) {
      if (cancelled) return null;
      chunks.push(buffer);
    }

    if (chunks.length === 0) continue;

    const trackChannels = chunks[0].numberOfChannels;
    const trackSampleRate = chunks[0].sampleRate;

    const concatenated = concatenateAudioBuffers(chunks, trackSampleRate, trackChannels);
    decodedAudio.push({
      buffer: concatenated,
      offset: offsets[idx],
    });
  }

  if (decodedAudio.length === 0) return null;

  // Single track: use OfflineAudioContext to resample to 48kHz stereo
  // Multiple tracks: use OfflineAudioContext to mix + resample
  const totalSamples = Math.ceil(totalDurationSeconds * sampleRate);
  const offlineCtx = new OfflineAudioContext(channels, totalSamples, sampleRate);

  for (const { buffer, offset } of decodedAudio) {
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);
    source.start(offset);
  }

  return await offlineCtx.startRendering();
}

// ---------------------------------------------------------------------------
// Main export pipeline
// ---------------------------------------------------------------------------

async function runExport(
  config: Extract<ExportWorkerCommand, { type: 'start' }>,
): Promise<void> {
  cancelled = false;

  // Ensure even dimensions for H.264
  const width = config.resolution.width & ~1;
  const height = config.resolution.height & ~1;

  // 1. Create Mediabunny Inputs (one per source file)
  const inputs = config.files.map(file => new Input({
    formats: [MP4],
    source: new BlobSource(file),
  }));

  let output: Output<Mp4OutputFormat, BufferTarget> | null = null;
  let videoSource: CanvasSource | null = null;
  let audioSource: AudioBufferSource | null = null;

  try {
    // 2. Get video tracks and create VideoSampleSinks
    const videoTracks = await Promise.all(
      inputs.map(input => input.getPrimaryVideoTrack()),
    );
    const videoSinks = videoTracks.map(track =>
      track ? new VideoSampleSink(track) : null,
    );

    if (cancelled) { post({ type: 'cancelled' }); return; }

    // 3. Set up OffscreenCanvas at export resolution
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    // 4. Create Mediabunny Output with CanvasSource for H.264 encoding
    output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });

    videoSource = new CanvasSource(canvas, {
      codec: 'avc',
      bitrate: config.bitrate,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'quality',
      keyFrameInterval: 2,
    });
    output.addVideoTrack(videoSource, { frameRate: config.fps });

    // 5. Handle audio
    const mixedAudio = await mixAudio(
      inputs,
      config.audioConfig,
      config.offsets,
      config.totalDurationSeconds,
    );

    if (cancelled) { post({ type: 'cancelled' }); return; }

    if (mixedAudio) {
      audioSource = new AudioBufferSource({
        codec: 'aac',
        bitrate: 192_000,
      });
      output.addAudioTrack(audioSource);
    }

    // 6. Compute grid layout at export resolution
    const layout = computeGridLayout(
      width,
      height,
      config.files.length,
      config.tileAspectRatio,
    );

    // 7. Start output and run frame loop
    await output.start();

    const frameDuration = 1 / config.fps;
    const totalFrames = Math.ceil(config.totalDurationSeconds * config.fps);

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (cancelled) {
        post({ type: 'cancelled' });
        return;
      }

      const timestamp = frameIdx * frameDuration;

      // Clear canvas to black
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, width, height);

      // Draw each input's frame at its grid position
      for (let i = 0; i < videoSinks.length; i++) {
        const sink = videoSinks[i];
        if (!sink) continue;

        const localTime = timestamp - config.offsets[i];
        if (localTime < 0) continue;

        const sample = await sink.getSample(localTime);
        if (sample) {
          try {
            const tile = layout.tiles[i];
            sample.draw(ctx, tile.x, tile.y, tile.width, tile.height);
          } finally {
            // CRITICAL: release GPU memory
            sample.close();
          }
        }
      }

      // Feed composited canvas to encoder (await for backpressure)
      await videoSource.add(timestamp, frameDuration);

      // Report progress
      post({ type: 'progress', ratio: (frameIdx + 1) / totalFrames });
    }

    // 8. Finalize audio (if applicable)
    if (audioSource && mixedAudio) {
      await audioSource.add(mixedAudio);
      audioSource.close();
      audioSource = null;
    }

    // 9. Finalize output
    videoSource.close();
    videoSource = null;
    await output.finalize();

    const result = (output.target as BufferTarget).buffer;
    if (!result) {
      throw new Error('Export finalized but output buffer is empty');
    }
    post(
      { type: 'complete', data: result },
      [result],
    );
  } catch (err) {
    if (cancelled) {
      post({ type: 'cancelled' });
    } else {
      throw err;
    }
  } finally {
    // Cleanup: dispose all inputs
    for (const input of inputs) {
      try { input.dispose(); } catch { /* ignore */ }
    }
    // Cancel output if still active (error/cancel path)
    if (output && output.state !== 'finalized' && output.state !== 'canceled') {
      try {
        if (videoSource) videoSource.close();
        if (audioSource) audioSource.close();
        await output.cancel();
      } catch { /* ignore cleanup errors */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

self.onmessage = (e: MessageEvent<ExportWorkerCommand>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'start':
      runExport(msg).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        post({ type: 'error', message });
      });
      break;

    case 'cancel':
      cancelled = true;
      break;
  }
};
