import { getFFmpeg } from './ffmpeg.ts';
import { fetchFile } from '@ffmpeg/util';
import { getKeyframeTimes } from './keyframeIndex.ts';

const TAG = '[TRIM]';

/**
 * Stream-copy trim: snaps to nearest keyframe >= trimSeconds using mp4box.js
 * container index, then FFmpeg `-c copy`. No re-encoding, preserves HEVC/HDR.
 *
 * Returns null when trimSeconds === 0 (reference file — no trim needed).
 */
export async function trimVideo(
  file: File,
  trimSeconds: number,
  onProgress?: (secondsEncoded: number) => void
): Promise<Uint8Array | null> {
  if (trimSeconds === 0) {
    console.log(TAG, `Skipping "${file.name}" — trimSeconds=0 (reference file)`);
    return null;
  }

  console.log(TAG, `Starting "${file.name}" — trim ${trimSeconds}s from start`);
  const t0 = performance.now();

  // Read keyframe positions from container (no decoding)
  const keyframes = await getKeyframeTimes(file);
  // Snap forward: first keyframe >= trimSeconds (never include footage that should be trimmed)
  let snapTime = keyframes.find((t) => t >= trimSeconds);
  if (snapTime === undefined) {
    snapTime = keyframes[keyframes.length - 1];
  }
  console.log(TAG, `Snap: ideal=${trimSeconds}s → keyframe=${snapTime}s`);

  const ffmpeg = await getFFmpeg();
  const id = crypto.randomUUID().slice(0, 8);
  const inputName = `trim_in_${id}.mp4`;
  const outputName = `trim_out_${id}.mp4`;

  const progressHandler = ({ time }: { progress: number; time: number }) => {
    if (onProgress && time > 0) {
      onProgress(time / 1_000_000);
    }
  };
  ffmpeg.on('progress', progressHandler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    await ffmpeg.exec([
      '-ss', String(snapTime),
      '-i', inputName,
      '-c', 'copy',
      '-avoid_negative_ts', '1',
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(TAG, `Complete "${file.name}" — stream copy, ${((data as Uint8Array).byteLength / 1024 / 1024).toFixed(1)}MB output, ${elapsed}s total`);
    return data as Uint8Array;
  } finally {
    ffmpeg.off('progress', progressHandler);
    for (const f of [inputName, outputName]) {
      await ffmpeg.deleteFile(f).catch(() => {});
    }
  }
}

/**
 * Coordinate trim points across multiple files so they all overshoot by
 * approximately the same amount, minimizing inter-file drift.
 *
 * Different files have different keyframe phases so exact alignment isn't
 * possible with stream-copy — but this gets within one GOP (~0.93s).
 */
export async function calculateAlignedTrims(
  files: { file: File; idealTrimSeconds: number }[]
): Promise<{ file: File; snapTrimSeconds: number; driftFromIdeal: number }[]> {
  // Get keyframe times for all files in parallel
  const allKeyframes = await Promise.all(
    files.map((f) => getKeyframeTimes(f.file))
  );

  // First pass: snap each file independently to find per-file overshoot
  const snapped = files.map((f, i) => {
    const keyframes = allKeyframes[i];
    const snap = keyframes.find((t) => t >= f.idealTrimSeconds) ?? keyframes[keyframes.length - 1];
    return { ...f, keyframes, snap, overshoot: snap - f.idealTrimSeconds };
  });

  // Find the maximum overshoot — all files should target this
  const maxOvershoot = Math.max(...snapped.map((s) => s.overshoot));

  // Second pass: re-snap each file targeting idealTrim + maxOvershoot
  return snapped.map((s) => {
    const target = s.file === snapped.find((x) => x.overshoot === maxOvershoot)?.file
      ? s.snap // The file that defined maxOvershoot keeps its snap
      : s.keyframes.find((t) => t >= s.idealTrimSeconds + maxOvershoot) ?? s.keyframes[s.keyframes.length - 1];

    return {
      file: s.file,
      snapTrimSeconds: target,
      driftFromIdeal: target - s.idealTrimSeconds,
    };
  });
}
