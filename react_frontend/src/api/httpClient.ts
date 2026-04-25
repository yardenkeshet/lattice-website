const BASE_URL = 'http://localhost:5003';

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