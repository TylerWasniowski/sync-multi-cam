/**
 * Web Worker: WebCodecs + Mediabunny export pipeline.
 *
 * Demuxes multiple MP4/MOV/MKV/WebM inputs, decodes video frames, composites
 * them onto an OffscreenCanvas at grid positions, encodes H.264+AAC via
 * hardware-accelerated WebCodecs, and muxes to MP4.
 *
 * Audio pipeline uses AudioSampleSink + AudioSampleSource (WebCodecs-based,
 * no Web Audio API) so it works reliably in Web Workers.
 *
 * Communication with the main thread uses typed ExportWorkerCommand /
 * ExportWorkerMessage messages.
 */

import {
  Input, Output,
  MP4, QTFF, MATROSKA, WEBM,
  BlobSource, BufferTarget,
  Mp4OutputFormat, CanvasSource,
  VideoSampleSink,
  AudioSampleSink, AudioSampleSource, AudioSample,
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
// Audio helpers — uses AudioSampleSink/Source (WebCodecs), no Web Audio API
// ---------------------------------------------------------------------------

/** Decoded track: continuous per-channel Float32 PCM at the source sample rate */
interface DecodedTrack {
  channels: Float32Array[];  // one array per channel
  sampleRate: number;
  offsetSeconds: number;     // sync offset for this track
}

/**
 * Decode an audio track to raw PCM Float32 arrays (one per channel).
 */
async function decodeAudioTrack(
  input: Input,
  offsetSeconds: number,
): Promise<DecodedTrack | null> {
  const audioTrack = await input.getPrimaryAudioTrack();
  if (!audioTrack) return null;

  const sink = new AudioSampleSink(audioTrack);
  const channelChunks: Float32Array[][] = [];
  let sampleRate = 0;
  let numChannels = 0;

  for await (const sample of sink.samples()) {
    if (cancelled) { sample.close(); return null; }

    sampleRate = sample.sampleRate;
    numChannels = sample.numberOfChannels;

    // Ensure we have enough channel chunk arrays
    while (channelChunks.length < numChannels) channelChunks.push([]);

    for (let ch = 0; ch < numChannels; ch++) {
      const size = sample.allocationSize({ planeIndex: ch, format: 'f32-planar' });
      const buf = new Float32Array(size / 4);
      sample.copyTo(buf, { planeIndex: ch, format: 'f32-planar' });
      channelChunks[ch].push(buf);
    }

    sample.close();
  }

  if (channelChunks.length === 0 || sampleRate === 0) return null;

  // Concatenate chunks per channel
  const channels = channelChunks.map(chunks => {
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const result = new Float32Array(totalLen);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return result;
  });

  return { channels, sampleRate, offsetSeconds };
}

/**
 * Decode, mix, and feed audio into the Output via AudioSampleSource.
 * Call AFTER the video frame loop so all video frames are queued first.
 */
async function processAudio(
  inputs: Input[],
  audioConfig: AudioConfig,
  offsets: number[],
  totalDurationSeconds: number,
  audioSource: AudioSampleSource,
): Promise<void> {
  if (audioConfig.mode === 'none') return;

  const unmutedIndices =
    audioConfig.mode === 'single'
      ? [audioConfig.trackIndex]
      : audioConfig.trackIndices;

  if (unmutedIndices.length === 0) return;

  const outRate = 48_000;
  const outChannels = 2; // stereo
  const totalFrames = Math.ceil(totalDurationSeconds * outRate);

  console.log('[ExportWorker] decoding audio from', unmutedIndices.length, 'tracks');

  // Decode all unmuted tracks
  const decoded: DecodedTrack[] = [];
  for (const idx of unmutedIndices) {
    if (idx >= inputs.length) continue;
    if (cancelled) return;

    const track = await decodeAudioTrack(inputs[idx], offsets[idx]);
    if (track) decoded.push(track);
  }

  if (decoded.length === 0) return;

  console.log('[ExportWorker] mixing', decoded.length, 'audio tracks into', totalFrames, 'frames @', outRate, 'Hz');

  // Mix all tracks into stereo output at outRate
  const mixed: Float32Array[] = Array.from({ length: outChannels }, () => new Float32Array(totalFrames));

  for (const track of decoded) {
    const ratio = track.sampleRate / outRate; // >1 means source has more samples per output sample
    const startFrame = Math.round(track.offsetSeconds * outRate);

    for (let outCh = 0; outCh < outChannels; outCh++) {
      // Use source channel, falling back to channel 0 for mono→stereo
      const srcCh = Math.min(outCh, track.channels.length - 1);
      const src = track.channels[srcCh];
      const dst = mixed[outCh];

      for (let outIdx = Math.max(0, startFrame); outIdx < totalFrames; outIdx++) {
        const srcFloat = (outIdx - startFrame) * ratio;
        const srcIdx = Math.floor(srcFloat);
        if (srcIdx >= src.length - 1) break;

        // Linear interpolation for resampling
        const frac = srcFloat - srcIdx;
        dst[outIdx] += src[srcIdx] * (1 - frac) + src[srcIdx + 1] * frac;
      }
    }
  }

  // Clamp to [-1, 1]
  for (const ch of mixed) {
    for (let i = 0; i < ch.length; i++) {
      if (ch[i] > 1) ch[i] = 1;
      else if (ch[i] < -1) ch[i] = -1;
    }
  }

  // Feed mixed audio to AudioSampleSource in chunks
  const chunkSize = 4096; // frames per chunk
  for (let i = 0; i < totalFrames; i += chunkSize) {
    if (cancelled) break;

    const frames = Math.min(chunkSize, totalFrames - i);

    // f32-planar layout: [ch0_data][ch1_data]
    const data = new Float32Array(frames * outChannels);
    for (let ch = 0; ch < outChannels; ch++) {
      data.set(mixed[ch].subarray(i, i + frames), ch * frames);
    }

    const sample = new AudioSample({
      data: data.buffer,
      format: 'f32-planar',
      sampleRate: outRate,
      numberOfChannels: outChannels,
      timestamp: i / outRate,
    });

    await audioSource.add(sample);
    sample.close();
  }
}

/**
 * Check if any unmuted track has an audio stream, so we know whether to
 * add an audio track to the output before calling output.start().
 */
async function hasAudio(
  inputs: Input[],
  audioConfig: AudioConfig,
): Promise<boolean> {
  if (audioConfig.mode === 'none') return false;

  const indices =
    audioConfig.mode === 'single'
      ? [audioConfig.trackIndex]
      : audioConfig.trackIndices;

  for (const idx of indices) {
    if (idx >= inputs.length) continue;
    const track = await inputs[idx].getPrimaryAudioTrack();
    if (track) return true;
  }
  return false;
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

  console.log('[ExportWorker] starting pipeline', { width, height, files: config.files.length });

  // 1. Create Mediabunny Inputs (one per source file)
  // Support all container formats the app accepts (MP4, MOV, MKV, WebM).
  // MP4 rejects QuickTime 'qt  ' major brand — QTFF handles MOV files.
  const inputFormats = [MP4, QTFF, MATROSKA, WEBM];
  const inputs = config.files.map((file, i) => {
    console.log(`[ExportWorker] input ${i}: ${file.name}, ${file.size} bytes, type="${file.type}"`);
    return new Input({
      formats: inputFormats,
      source: new BlobSource(file),
    });
  });

  let output: Output<Mp4OutputFormat, BufferTarget> | null = null;
  let videoSource: CanvasSource | null = null;
  let audioSource: AudioSampleSource | null = null;

  try {
    // 2. Get video tracks and create VideoSampleSinks
    const videoTracks = await Promise.all(
      inputs.map(input => input.getPrimaryVideoTrack()),
    );
    const videoSinks = videoTracks.map(track =>
      track ? new VideoSampleSink(track) : null,
    );

    console.log('[ExportWorker] video tracks loaded:', videoTracks.map(t => t !== null));
    if (cancelled) { post({ type: 'cancelled' }); return; }

    // 3. Check if we'll have audio (must decide before output.start())
    const includeAudio = await hasAudio(inputs, config.audioConfig);
    if (cancelled) { post({ type: 'cancelled' }); return; }

    // 4. Set up OffscreenCanvas at export resolution
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    // 5. Create Mediabunny Output with CanvasSource for H.264 encoding
    output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });

    videoSource = new CanvasSource(canvas, {
      codec: 'avc',
      bitrate: config.bitrate,
      keyFrameInterval: 2,
    });
    output.addVideoTrack(videoSource);

    if (includeAudio) {
      audioSource = new AudioSampleSource({
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
    const totalFrames = Math.ceil(config.totalDurationSeconds * config.fps);
    console.log('[ExportWorker] starting output + frame loop, totalFrames:', totalFrames);
    await output.start();

    const frameDuration = 1 / config.fps;

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

      // Report progress (video = 90% of work, audio = 10%)
      post({ type: 'progress', ratio: ((frameIdx + 1) / totalFrames) * 0.9 });
    }

    // 8. Process audio (decode, mix, feed) — happens after all video frames
    if (audioSource) {
      await processAudio(
        inputs,
        config.audioConfig,
        config.offsets,
        config.totalDurationSeconds,
        audioSource,
      );
      audioSource.close();
      audioSource = null;
    }

    post({ type: 'progress', ratio: 0.95 });

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
  console.log('[ExportWorker] received message:', msg.type);

  switch (msg.type) {
    case 'start':
      runExport(msg).catch((err: unknown) => {
        console.error('[ExportWorker] pipeline error:', err);
        const message = err instanceof Error ? err.message : String(err);
        post({ type: 'error', message });
      });
      break;

    case 'cancel':
      cancelled = true;
      break;
  }
};
