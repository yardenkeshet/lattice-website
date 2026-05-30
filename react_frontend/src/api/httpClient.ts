const BASE_URL = 'http://localhost:5003';

/**
 * Sends a .igs file to the server and returns the converted STL content
 * as a plain base64 string (no gzip wrapper).
 *
 * Expected server response: JSON { stl_b64: string }
 */
export async function convertIgsToStl(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  console.log("COnverting@@@");
  const response = await fetch(`${BASE_URL}/convert_igs_to_stl`, {
    method: 'POST',
    body: form,
  });
  console.log("got", response);
  if (!response.ok) {
    throw new Error(`IGS conversion failed: ${response.status} ${response.statusText}`);
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
 */
export async function downloadResults(token: string): Promise<void> {
  const form = new FormData();
  form.append('token', token);

  const response = await fetch(`${BASE_URL}/download-results`, {
    method: 'POST',
    body: new URLSearchParams({ token }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'results.zip';
  a.click();

  URL.revokeObjectURL(url);
}