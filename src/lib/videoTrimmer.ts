import { getFFmpeg } from './ffmpeg.ts';
import { fetchFile } from '@ffmpeg/util';

/**
 * Smart rendering: re-encode only from trim point to first keyframe (~0.5-2s),
 * stream-copy the rest, concat. Falls back to full re-encode if smart rendering fails.
 *
 * Returns null when trimSeconds === 0 (reference file optimization).
 * Returns Uint8Array of trimmed video data otherwise.
 */
export async function trimVideo(
  file: File,
  trimSeconds: number,
  onProgress?: (secondsEncoded: number) => void
): Promise<Uint8Array | null> {
  // Skip when no trim needed (reference/latest-starting file)
  if (trimSeconds === 0) return null;

  const ffmpeg = await getFFmpeg();
  const id = crypto.randomUUID().slice(0, 8);
  const inputName = `trim_in_${id}.mp4`;
  const startSeg = `trim_start_${id}.mp4`;
  const restSeg = `trim_rest_${id}.mp4`;
  const concatList = `trim_list_${id}.txt`;
  const outputName = `trim_out_${id}.mp4`;

  const progressHandler = ({ time }: { progress: number; time: number }) => {
    // NOTE: Do NOT use the progress field -- broken in @ffmpeg/core 0.12.x
    if (onProgress && time > 0) {
      onProgress(time / 1_000_000);
    }
  };
  ffmpeg.on('progress', progressHandler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    // Try smart rendering first
    try {
      // Attempt to probe keyframes by running ffmpeg with -skip_frame nokey
      // and parsing log output for I-frame timestamps.
      // In WASM FFmpeg, ffprobe is not available, so we use the main binary
      // with flags that cause it to log keyframe info.
      const keyframeTimestamps: number[] = [];
      const logHandler = ({ message }: { message: string }) => {
        // Parse log lines like: "pts_time:3.000000" from showinfo filter output
        const match = message.match(/pts_time:\s*([\d.]+)/);
        if (match) {
          keyframeTimestamps.push(parseFloat(match[1]));
        }
      };
      ffmpeg.on('log', logHandler);

      try {
        await ffmpeg.exec([
          '-skip_frame', 'nokey',
          '-i', inputName,
          '-vf', 'showinfo',
          '-f', 'null',
          '-',
        ]);
      } finally {
        ffmpeg.off('log', logHandler);
      }

      // Find first keyframe at or after trim point
      const firstKeyframe = keyframeTimestamps.find(t => t >= trimSeconds);
      if (firstKeyframe === undefined || firstKeyframe === trimSeconds) {
        // No keyframe found after trim point, or trim is exactly on keyframe
        // Fall through to fallback
        throw new Error('No suitable keyframe found for smart rendering');
      }

      const reEncodeDuration = firstKeyframe - trimSeconds;

      // Step 2: Re-encode from trim point to first keyframe
      await ffmpeg.exec([
        '-ss', String(trimSeconds),
        '-accurate_seek',
        '-i', inputName,
        '-t', String(reEncodeDuration),
        '-c:v', 'libx264',
        '-crf', '18',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '192k',
        startSeg,
      ]);

      // Step 3: Stream-copy from first keyframe to end (no -t/-to = full remaining)
      await ffmpeg.exec([
        '-ss', String(firstKeyframe),
        '-i', inputName,
        '-c', 'copy',
        restSeg,
      ]);

      // Step 4: Write concat list and merge
      const listContent = `file '${startSeg}'\nfile '${restSeg}'\n`;
      await ffmpeg.writeFile(concatList, new TextEncoder().encode(listContent));

      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', concatList,
        '-c', 'copy',
        outputName,
      ]);
    } catch {
      // Fallback: Full re-encode (still frame-precise, just slower)
      // No -t or -to flags: keeps full remaining footage after trim point (OUT-02)
      await ffmpeg.exec([
        '-ss', String(trimSeconds),
        '-accurate_seek',
        '-i', inputName,
        '-c:v', 'libx264',
        '-crf', '18',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '192k',
        outputName,
      ]);
    }

    const data = await ffmpeg.readFile(outputName);
    return data as Uint8Array;
  } finally {
    ffmpeg.off('progress', progressHandler);
    // Clean up ALL possible intermediate files
    for (const f of [inputName, startSeg, restSeg, concatList, outputName]) {
      await ffmpeg.deleteFile(f).catch(() => {});
    }
  }
}
