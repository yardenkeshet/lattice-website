import type { CalculateArgs } from './types';
import { DEFAULT_TESSELLATION_TOLERANCE } from '../lib/parameters';

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? '';

/**
 * Sends a .igs file to the server and returns the converted STL content
 * as a plain base64 string (no gzip wrapper).
 *
 * Expected server response: JSON { stl_b64: string }
 */
export async function convertIgsToStl(file: File, tolerance: number = DEFAULT_TESSELLATION_TOLERANCE): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('tolerance', String(tolerance));
  const response = await fetch(`${BASE_URL}/convert_igs_to_stl`, {
    method: 'POST',
    body: form,
  });
  console.log("got", response);
  if (!response.ok) {
    const message = await response
      .json()
      .then(body => body?.error as string | undefined)
      .catch(() => undefined);
    throw new Error(message ?? `IGS conversion failed: ${response.status} ${response.statusText} ${response.body}`);
  }
  const data = await response.json();
  return data.stl_b64 as string;
}

/**
 * Triggers a browser file download for a completed calculation result.
 *
 * The server accepts a POST with a form-encoded `token`, validates it,
 * then streams back a ZIP containing the output STL + IGS files.
 * The token is single-use — it is invalidated on the server after one call.
 *
 * On an invalid/expired token the server redirects to `/`, so the download
 * simply silently fails rather than throwing.
 *
 * When the File System Access API is available (Chromium browsers), a native
 * "Save As" dialog lets the user pick the destination folder and file name.
 * Other browsers fall back to a plain anchor download into the default
 * downloads folder.
 */
export async function downloadResults(token: string, fileType: 'stl' | 'igs'): Promise<void> {
  const response = await fetch(`${BASE_URL}/download-results`, {
    method: 'POST',
    body: new URLSearchParams({ token, file_type: fileType }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const disposition = response.headers.get('Content-Disposition');
  const match = disposition?.match(/filename=(.+)/);
  const filename = match?.[1] ?? `results.${fileType}`;

  const blob = await response.blob();

  const showSaveFilePicker = (window as unknown as {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  }).showSaveFilePicker;

  if (showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Archive',
            accept: { 'application/zip': ['.zip'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // User dismissed the save dialog — not an error.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


/**
 * Uploads a canvas snapshot PNG plus the calculation params that produced it
 * to the permanent calc_log archive. Fire-and-forget from the caller's
 * perspective — failures should be caught and ignored by the caller so a
 * logging hiccup never affects the displayed calculation result.
 */
export async function logCalculation(image: Blob, filename: string, args: CalculateArgs): Promise<void> {
  const form = new FormData();
  form.append('image', image, 'snapshot.png');
  form.append('metadata', JSON.stringify({ filename, args }));

  const response = await fetch(`${BASE_URL}/log-calculation`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Calc log failed: ${response.status} ${response.statusText}`);
  }
}
