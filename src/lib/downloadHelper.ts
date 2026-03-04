/**
 * Trigger a browser file download from a Uint8Array.
 * Creates a temporary blob URL and anchor element, clicks it, then cleans up.
 */
export function triggerDownload(data: Uint8Array, filename: string, mimeType: string): void {
  const blob = new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after short delay to ensure download initiates
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
