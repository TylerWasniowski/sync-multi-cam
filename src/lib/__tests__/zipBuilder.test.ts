import { describe, it, expect } from 'vitest';

// We test buildZip directly -- fflate is a real dependency (small, pure JS)
// so we can use it without mocking for integration-style tests.

describe('buildZip', () => {
  it('returns a Uint8Array for empty input', async () => {
    const { buildZip } = await import('../zipBuilder.ts');
    const result = buildZip([]);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0); // empty ZIP still has headers
  });

  it('returns a Uint8Array containing one file', async () => {
    const { buildZip } = await import('../zipBuilder.ts');
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const result = buildZip([{ name: 'test.mp4', data }]);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(data.length); // ZIP has headers + data
  });

  it('includes all files when given multiple files', async () => {
    const { buildZip } = await import('../zipBuilder.ts');
    const files = [
      { name: 'video1.mp4', data: new Uint8Array([1, 2, 3]) },
      { name: 'video2.mp4', data: new Uint8Array([4, 5, 6]) },
      { name: 'video3.mp4', data: new Uint8Array([7, 8, 9]) },
    ];
    const result = buildZip(files);

    expect(result).toBeInstanceOf(Uint8Array);
    // ZIP should contain all file data -- larger than any single file
    expect(result.length).toBeGreaterThan(9);
  });

  it('uses store mode (level 0) -- no compression for pre-compressed video', async () => {
    // Verify by checking that the output ZIP contains the original bytes verbatim.
    // With level 0 (store), the raw data appears uncompressed in the ZIP.
    const { buildZip } = await import('../zipBuilder.ts');
    const data = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
    const result = buildZip([{ name: 'test.bin', data }]);

    // The original bytes should appear somewhere in the ZIP (store mode = no compression)
    const resultStr = Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('');
    expect(resultStr).toContain('deadbeef');
  });

  it('can be unzipped back to original files', async () => {
    const { buildZip } = await import('../zipBuilder.ts');
    const { unzipSync } = await import('fflate');

    const files = [
      { name: 'a.mp4', data: new Uint8Array([10, 20, 30]) },
      { name: 'b.mp4', data: new Uint8Array([40, 50, 60]) },
    ];
    const zipped = buildZip(files);
    const unzipped = unzipSync(zipped);

    expect(Object.keys(unzipped)).toHaveLength(2);
    expect(Array.from(unzipped['a.mp4'])).toEqual([10, 20, 30]);
    expect(Array.from(unzipped['b.mp4'])).toEqual([40, 50, 60]);
  });
});
