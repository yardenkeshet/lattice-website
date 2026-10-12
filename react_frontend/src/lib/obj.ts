import * as React from 'react'
import * as pako from 'pako'
import * as THREE from 'three'
import { useLoader } from '@react-three/fiber'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Gzip-compresses a mesh text file (e.g. OBJ) and returns a base64-encoded
 * result in the same format the server emits (`base64(gzip(OBJ))`).
 */
export function meshTextToGzB64(text: string): string {
  const compressed = pako.gzip(text)
  let bin = ''
  compressed.forEach(b => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

/**
 * Decodes a base64-encoded gzipped OBJ string (as returned by the server's
 * `result` event) into a Blob URL that Three.js OBJLoader can consume.
 *
 * Caller is responsible for calling URL.revokeObjectURL() when done.
 */
export function objGzB64ToBlobUrl(objGzB64: string): string {
  const binary = atob(objGzB64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const decompressed = pako.ungzip(bytes)
  const blob = new Blob([decompressed], { type: 'text/plain' })
  return URL.createObjectURL(blob)
}

/**
 * React hook that converts an obj_gz_b64 string into a stable Blob URL.
 * Revokes the previous URL automatically when the input changes or the
 * component unmounts.
 */
export function useObjBlobUrl(objGzB64: string | null | undefined): string | undefined {
  const [blobUrl, setBlobUrl] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    if (!objGzB64) {
      setBlobUrl(undefined)
      return
    }
    let url: string | undefined
    try {
      url = objGzB64ToBlobUrl(objGzB64)
      setBlobUrl(url)
    } catch {
      setBlobUrl(undefined)
    }
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [objGzB64])

  return blobUrl
}

/**
 * Flattens an OBJLoader result (a Group of one or more meshes) into a single
 * BufferGeometry carrying `position` + `normal`, so callers can keep treating
 * the model as one `<mesh geometry>`. Normals are computed when the OBJ has no
 * `vn` lines; OBJLoader output is non-indexed, so those come out flat — the
 * same look the STL pipeline produced.
 *
 * Throws on an empty group so the surrounding error boundary handles it.
 */
export function objGroupToGeometry(group: THREE.Object3D): THREE.BufferGeometry {
  group.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []
  group.traverse(child => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', mesh.geometry.getAttribute('position').clone())
    const normal = mesh.geometry.getAttribute('normal')
    if (normal) g.setAttribute('normal', normal.clone())
    if (!mesh.matrixWorld.equals(new THREE.Matrix4())) g.applyMatrix4(mesh.matrixWorld)
    parts.push(g)
  })
  if (parts.length === 0) throw new Error('OBJ contains no mesh geometry')

  // mergeGeometries requires identical attribute sets — drop normals unless
  // every part has them, then recompute.
  const allHaveNormals = parts.every(p => p.getAttribute('normal'))
  if (!allHaveNormals) parts.forEach(p => p.deleteAttribute('normal'))

  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts)
  if (!merged) throw new Error('Failed to merge OBJ geometry')
  if (!merged.getAttribute('normal')) merged.computeVertexNormals()
  return merged
}

/** Suspense-loads an OBJ URL and returns it as a single BufferGeometry. */
export function useObjGeometry(url: string): THREE.BufferGeometry {
  const group = useLoader(OBJLoader, url)
  const geometry = React.useMemo(() => objGroupToGeometry(group), [group])
  React.useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}
