import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('triggerDownload', () => {
  let mockAnchor: {
    href: string;
    download: string;
    click: ReturnType<typeof vi.fn>;
  };

  const mockCreateElement = vi.fn();
  const mockAppendChild = vi.fn();
  const mockRemoveChild = vi.fn();
  const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
  const mockRevokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();

    mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    mockCreateElement.mockReturnValue(mockAnchor);
    mockCreateObjectURL.mockReturnValue('blob:mock-url');

    // Set up minimal DOM globals for node environment
    (globalThis as Record<string, unknown>).document = {
      createElement: mockCreateElement,
      body: {
        appendChild: mockAppendChild,
        removeChild: mockRemoveChild,
      },
    };

    // Mock URL static methods
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).document;
  });

  it('creates a Blob with the correct mimeType', async () => {
    const { triggerDownload } = await import('../downloadHelper.ts');
    const data = new Uint8Array([1, 2, 3]);

    triggerDownload(data, 'test.zip', 'application/zip');

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = mockCreateObjectURL.mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect((blobArg as Blob).type).toBe('application/zip');
  });

  it('sets the anchor href to the blob URL and download to the filename', async () => {
    const { triggerDownload } = await import('../downloadHelper.ts');
    const data = new Uint8Array([1, 2, 3]);

    triggerDownload(data, 'synced_videos.zip', 'application/zip');

    expect(mockAnchor.href).toBe('blob:mock-url');
    expect(mockAnchor.download).toBe('synced_videos.zip');
  });

  it('clicks the anchor element to initiate download', async () => {
    const { triggerDownload } = await import('../downloadHelper.ts');
    const data = new Uint8Array([1, 2, 3]);

    triggerDownload(data, 'test.mp4', 'video/mp4');

    expect(mockAnchor.click).toHaveBeenCalledTimes(1);
  });

  it('appends and removes the anchor from document.body', async () => {
    const { triggerDownload } = await import('../downloadHelper.ts');
    const data = new Uint8Array([1, 2, 3]);

    triggerDownload(data, 'test.mp4', 'video/mp4');

    expect(mockAppendChild).toHaveBeenCalledWith(mockAnchor);
    expect(mockRemoveChild).toHaveBeenCalledWith(mockAnchor);
  });

  it('revokes the object URL after 1000ms delay', async () => {
    const { triggerDownload } = await import('../downloadHelper.ts');
    const data = new Uint8Array([1, 2, 3]);

    triggerDownload(data, 'test.mp4', 'video/mp4');

    // URL should not be revoked immediately
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();

    // Advance timers by 1000ms
    vi.advanceTimersByTime(1000);

    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
