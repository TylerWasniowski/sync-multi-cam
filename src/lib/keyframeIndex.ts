import { createFile, type MP4BoxBuffer } from 'mp4box';

/**
 * Reads keyframe (RAP) timestamps from MOV/MP4 container metadata (stss atom)
 * using mp4box.js. No frame decoding — reads the container index only.
 */
export async function getKeyframeTimes(file: File): Promise<number[]> {
  const mp4 = createFile();
  const buffer = await file.arrayBuffer();
  const mp4buf = buffer as MP4BoxBuffer;
  mp4buf.fileStart = 0;

  return new Promise<number[]>((resolve, reject) => {
    mp4.onReady = (info) => {
      const videoTrack = info.videoTracks[0];
      if (!videoTrack) {
        reject(new Error('No video track found'));
        return;
      }

      const samples = mp4.getTrackSamplesInfo(videoTrack.id);
      const keyframes = samples
        .filter((s) => s.is_sync)
        .map((s) => s.cts / s.timescale)
        .sort((a, b) => a - b);

      resolve(keyframes);
    };

    mp4.onError = (e: string) => reject(new Error(e));
    mp4.appendBuffer(mp4buf);
    mp4.flush();
  });
}
