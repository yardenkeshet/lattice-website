import * as React from 'react'

export interface PopupProps {
  isOpen: boolean
  onClose: () => void
  /** Question shown at the top of the alert. Defaults to the file-download prompt. */
  message?: string
  children?: React.ReactNode
}

const Popup: React.FC<PopupProps> = ({
  isOpen,
  onClose,
  message = 'Which file type would you like to download?',
  children,
}) => {
  if (!isOpen) return null

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={message}
        style={contentStyle}
        onClick={e => e.stopPropagation()}
      >
        <button aria-label="Close" onClick={onClose} style={closeButtonStyle}>
          &times;
        </button>
        <p style={messageStyle}>{message}</p>
        {children}
      </div>
    </div>
  )
}

/* ─── Styles — all values reference design tokens ─── */

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.45)',
  zIndex: 1000,
}

const contentStyle: React.CSSProperties = {
  position: 'relative',
  backgroundColor: 'var(--bg-primary)',
  borderRadius: 14,
  boxShadow: '1px 2px 9px 0px rgba(0,0,0,0.25)',
  padding: 'var(--space-md, 16px) var(--space-md, 16px)',
  minWidth: 260,
}

const closeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 10,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  color: 'var(--text-secondary)',
}

const messageStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-base)',
  margin: '0 24px 12px 0',
  textAlign: 'center',
}

export default Popup
