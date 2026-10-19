import { describe, it, expect } from 'vitest'
import { isWheelZoomGesture, isKeyboardZoomShortcut } from '../browserZoomGuard'

describe('isWheelZoomGesture', () => {
  it('matches a Ctrl+wheel event', () => {
    expect(isWheelZoomGesture({ ctrlKey: true })).toBe(true)
  })

  it('rejects a plain wheel event', () => {
    expect(isWheelZoomGesture({ ctrlKey: false })).toBe(false)
  })
})

describe('isKeyboardZoomShortcut', () => {
  it('matches Ctrl+Plus/Minus/Equals/0', () => {
    for (const key of ['+', '-', '=', '0']) {
      expect(isKeyboardZoomShortcut({ ctrlKey: true, metaKey: false, key })).toBe(true)
    }
  })

  it('matches Cmd (meta) as well as Ctrl', () => {
    expect(isKeyboardZoomShortcut({ ctrlKey: false, metaKey: true, key: '+' })).toBe(true)
  })

  it('matches numpad Add/Subtract', () => {
    expect(isKeyboardZoomShortcut({ ctrlKey: true, metaKey: false, key: 'Add' })).toBe(true)
    expect(isKeyboardZoomShortcut({ ctrlKey: true, metaKey: false, key: 'Subtract' })).toBe(true)
  })

  it('rejects the key without Ctrl or Cmd', () => {
    expect(isKeyboardZoomShortcut({ ctrlKey: false, metaKey: false, key: '+' })).toBe(false)
  })

  it('rejects an unrelated Ctrl+key combo', () => {
    expect(isKeyboardZoomShortcut({ ctrlKey: true, metaKey: false, key: 'a' })).toBe(false)
  })
})
