import type { FileType } from '../components/types'

const BASE_URL = 'http://localhost:5003';

export async function downloadResults(token: string, fileType: FileType): Promise<void> {
  const response = await fetch(`${BASE_URL}/download-results`, {
    method: 'POST',
    body: new URLSearchParams({ token, file_type: fileType }),
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
  a.download = fileType === 'stl' ? 'result.stl' : 'result.igs';
  a.click();
  URL.revokeObjectURL(url);
}