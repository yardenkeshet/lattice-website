import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { objGroupToGeometry } from '../obj'

const parse = (text: string) => new OBJLoader().parse(text)

const TRIANGLE = `
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`

describe('objGroupToGeometry()', () => {
  it('computes normals when the OBJ has no vn lines', () => {
    const geom = objGroupToGeometry(parse(TRIANGLE))
    expect(geom.getAttribute('position').count).toBe(3)
    const n = geom.getAttribute('normal')
    expect(n).toBeDefined()
    expect([n.getX(0), n.getY(0), n.getZ(0)]).toEqual([0, 0, 1])
  })

  it('merges multiple objects into one geometry', () => {
    const text = `
o a
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
o b
v 0 0 1
v 1 0 1
v 0 1 1
f 4 5 6
`
    const geom = objGroupToGeometry(parse(text))
    expect(geom.getAttribute('position').count).toBe(6)
    geom.computeBoundingBox()
    expect(geom.boundingBox!.max.z).toBe(1)
  })

  it('keeps only position + normal attributes', () => {
    const text = `
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
f 1/1/1 2/2/1 3/3/1
`
    const geom = objGroupToGeometry(parse(text))
    expect(Object.keys(geom.attributes).sort()).toEqual(['normal', 'position'])
  })

  it('throws on an OBJ with no faces', () => {
    expect(() => objGroupToGeometry(new THREE.Group())).toThrow()
  })
})
