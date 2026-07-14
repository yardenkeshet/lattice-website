export interface KeyComboEvent {
  ctrlKey: boolean
  shiftKey: boolean
  key: string
}

/** Ctrl+Shift+L — hidden entry point to the /viewlog page. */
export function isLogViewerShortcut(e: KeyComboEvent): boolean {
  return e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l'
}
