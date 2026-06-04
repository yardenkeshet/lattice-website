import * as React from 'react'
import * as pako from 'pako'

/**
 * Gzip-compresses an ASCII STL string and returns a base64-encoded result
 * in the same format the server emits (`base64(gzip(ASCII-STL))`).
 */
export function stlTextToGzB64(text: string): string {
  const compressed = pako.gzip(text)
  let bin = ''
  compressed.forEach(b => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

/**
 * Decodes a base64-encoded gzipped ASCII STL string (as returned by the server's
 * `result` event) into a Blob URL that Three.js STLLoader can consume.
 *
 * Caller is responsible for calling URL.revokeObjectURL() when done.
 */
export function stlGzB64ToBlobUrl(stlGzB64: string): string {
  const binary = atob(stlGzB64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const decompressed = pako.ungzip(bytes)
  const blob = new Blob([decompressed], { type: 'text/plain' })
  return URL.createObjectURL(blob)
}

/**
 * React hook that converts a stl_gz_b64 string into a stable Blob URL.
 * Revokes the previous URL automatically when the input changes or the
 * component unmounts.
 */
export function useStlBlobUrl(stlGzB64: string | null | undefined): string | undefined {
  const [blobUrl, setBlobUrl] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    if (!stlGzB64) {
      setBlobUrl(undefined)
      return
    }
    let url: string | undefined
    try {
      url = stlGzB64ToBlobUrl(stlGzB64)
      setBlobUrl(url)
    } catch {
      setBlobUrl(undefined)
    }
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [stlGzB64])

  return blobUrl
}
