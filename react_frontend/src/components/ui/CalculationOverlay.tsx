// react_frontend/src/components/ui/CalculationOverlay.tsx
import * as React from 'react'
import {
  type CalcOverlayPhase,
  CALCULATING_PHRASES,
  FINALIZING_PHRASES,
  OVERLAY_PHRASE_STEP_MS,
  overlayPhraseIndex,
} from '../../lib/progressDisplay'

export interface CalculationOverlayProps {
  isOpen: boolean
  phase: CalcOverlayPhase
  /** Real queue-position text (e.g. "Site is busy — you're #2 in line"),
   * shown verbatim when phase === 'waiting'. Ignored for the other phases,
   * which use the fabricated CALCULATING_PHRASES/FINALIZING_PHRASES
   * sequences instead. */
  waitingText: string
}

const PHASE_HEADING: Record<CalcOverlayPhase, string> = {
  waiting: 'Getting in line',
  calculating: 'Building your lattice',
  finalizing: 'Wrapping up',
}

const PHASE_LABEL: Record<CalcOverlayPhase, string> = {
  waiting: 'Waiting',
  calculating: 'Calculating',
  finalizing: 'Finalizing',
}

export const CalculationOverlay: React.FC<CalculationOverlayProps> = ({ isOpen, phase, waitingText }) => {
  const [elapsedMs, setElapsedMs] = React.useState(0)

  // Restart the phrase clock every time the phase itself changes, so
  // 'calculating' and 'finalizing' each begin their own rotation from the
  // first phrase in their list rather than continuing the previous phase's
  // count.
  React.useEffect(() => {
    setElapsedMs(0)
    if (!isOpen || phase === 'waiting') return
    const id = window.setInterval(
      () => setElapsedMs(ms => ms + OVERLAY_PHRASE_STEP_MS),
      OVERLAY_PHRASE_STEP_MS,
    )
    return () => window.clearInterval(id)
  }, [isOpen, phase])

  if (!isOpen) return null

  const phrases = phase === 'finalizing' ? FINALIZING_PHRASES : CALCULATING_PHRASES
  const phraseText = phase === 'waiting' ? waitingText : phrases[overlayPhraseIndex(elapsedMs, phrases.length)]

  return (
    <div style={scrimStyle}>
      <div role="alertdialog" aria-modal="true" aria-label={PHASE_HEADING[phase]} style={cardStyle}>
        <div className="animate-spin" style={ringStyle} />
        <p style={headingStyle}>{PHASE_HEADING[phase]}</p>
        <p style={phraseStyle}>{phraseText}</p>
        <div style={barTrackStyle}>
          <div style={barFillStyle} />
        </div>
        <p style={stageLabelStyle}>{PHASE_LABEL[phase]}</p>
      </div>
    </div>
  )
}

/* ─── Styles — all values reference design tokens ─── */

const scrimStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  backgroundColor: 'rgba(4, 44, 78, 0.55)',
}

const cardStyle: React.CSSProperties = {
  width: '80%',
  maxWidth: 420,
  minWidth: 280,
  backgroundColor: 'var(--bg-primary)',
  borderRadius: 14,
  boxShadow: '1px 2px 9px 0px rgba(0,0,0,0.25)',
  padding: '36px 32px 30px',
  textAlign: 'center',
}

const ringStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  margin: '0 auto 20px',
  borderRadius: '50%',
  border: '4px solid var(--gray-100)',
  borderTopColor: 'var(--blue-bright)',
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  fontSize: '1.0625rem',
  color: 'var(--navy-dark)',
  margin: '0 0 10px',
}

const phraseStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: '0.9375rem',
  color: 'var(--text-secondary)',
  minHeight: '1.4em',
  margin: '0 0 22px',
}

const barTrackStyle: React.CSSProperties = {
  height: 6,
  borderRadius: 99,
  backgroundColor: 'var(--gray-100)',
  overflow: 'hidden',
}

const barFillStyle: React.CSSProperties = {
  height: '100%',
  width: '38%',
  borderRadius: 99,
  background: 'linear-gradient(90deg, var(--blue-light), var(--blue-bright))',
  animation: 'overlay-bar-sweep 1.6s ease-in-out infinite',
}

const stageLabelStyle: React.CSSProperties = {
  marginTop: 18,
  fontSize: '0.6875rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  fontWeight: 600,
}
