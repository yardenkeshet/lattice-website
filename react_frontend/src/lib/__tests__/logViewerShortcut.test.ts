import { describe, it, expect } from 'vitest'
import { isLogViewerShortcut } from '../logViewerShortcut'

describe('isLogViewerShortcut', () => {
  it('matches Ctrl+Shift+L', () => {
    expect(isLogViewerShortcut({ ctrlKey: true, shiftKey: true, key: 'L' })).toBe(true)
  })

  it('is case-insensitive on the key', () => {
    expect(isLogViewerShortcut({ ctrlKey: true, shiftKey: true, key: 'l' })).toBe(true)
  })

  it('rejects Ctrl+L without Shift', () => {
    expect(isLogViewerShortcut({ ctrlKey: true, shiftKey: false, key: 'L' })).toBe(false)
  })

  it('rejects Shift+L without Ctrl', () => {
    expect(isLogViewerShortcut({ ctrlKey: false, shiftKey: true, key: 'L' })).toBe(false)
  })

  it('rejects Ctrl+Shift+<other key>', () => {
    expect(isLogViewerShortcut({ ctrlKey: true, shiftKey: true, key: 'K' })).toBe(false)
  })
})
