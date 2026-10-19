export interface WheelZoomEvent {
  ctrlKey: boolean
}

/** True for the wheel event Chrome/Firefox fire for Ctrl+scroll and for
 * trackpad pinch-to-zoom (pinch is reported as a ctrlKey wheel event too) —
 * the gesture that changes the browser's page zoom. */
export function isWheelZoomGesture(e: WheelZoomEvent): boolean {
  return e.ctrlKey
}

export interface KeyZoomEvent {
  ctrlKey: boolean
  metaKey: boolean
  key: string
}

const ZOOM_KEYS = new Set(['+', '-', '=', '0', 'Add', 'Subtract'])

/** True for the keyboard shortcuts that change browser page zoom:
 * Ctrl/Cmd + Plus/Minus/Equals/0, main row or numpad. */
export function isKeyboardZoomShortcut(e: KeyZoomEvent): boolean {
  if (!e.ctrlKey && !e.metaKey) return false
  return ZOOM_KEYS.has(e.key)
}
