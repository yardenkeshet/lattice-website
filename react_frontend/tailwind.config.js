/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ── Primitives ── */
        'navy-dark':    'var(--navy-dark)',
        'navy-primary': 'var(--navy-primary)',
        'navy-medium':  'var(--navy-medium)',
        'blue-bright':  'var(--blue-bright)',
        'blue-light':   'var(--blue-light)',
        'cyan-light':   'var(--cyan-light)',
        'gray-50':      'var(--gray-50)',
        'gray-100':     'var(--gray-100)',
        'gray-400':     'var(--gray-400)',
        'gray-600':     'var(--gray-600)',
        'gray-900':     'var(--gray-900)',
        /* ── Semantic: Backgrounds ── */
        'bg-primary':    'var(--bg-primary)',
        'bg-secondary':  'var(--bg-secondary)',
        'bg-tertiary':   'var(--bg-tertiary)',
        'bg-card':       'var(--bg-card)',
        'bg-surface':    'var(--bg-surface)',
        'bg-surface-mid': 'var(--bg-surface-mid)',
        /* ── Semantic: Borders ── */
        'border-base':  'var(--border-base)',
        'border-muted': 'var(--border-muted)',
        'border-brand': 'var(--border-brand)',
        'border-focus': 'var(--border-focus)',
        'border-error': 'var(--border-error)',
        /* ── Semantic: Text ── */
        'text-base':        'var(--text-base)',
        'text-secondary':   'var(--text-secondary)',
        'text-tertiary':    'var(--text-tertiary)',
        'text-on-brand':    'var(--text-on-brand)',
        'text-link':        'var(--text-link)',
        'text-placeholder': 'var(--text-placeholder)',
        'text-error':       'var(--text-error)',
        /* ── Semantic: Actions ── */
        'action-primary':         'var(--action-primary)',
        'action-primary-hover':   'var(--action-primary-hover)',
        'action-primary-text':    'var(--action-primary-text)',
        'action-secondary':       'var(--action-secondary)',
        'action-secondary-hover': 'var(--action-secondary-hover)',
        'action-accent':          'var(--action-accent)',
        /* ── Semantic: Status ── */
        'status-error':      'var(--status-error)',
        'status-error-bg':   'var(--status-error-bg)',
        'status-success-bg': 'var(--status-success-bg)',
        'status-warning-bg': 'var(--status-warning-bg)',
        'status-info-bg':    'var(--status-info-bg)',
      },
      fontFamily: {
        heading: ['var(--font-heading)'],
        body:    ['var(--font-body)'],
        mono:    ['var(--font-mono)'],
      },
      fontSize: {
        h1:   ['var(--text-size-h1)',   { lineHeight: 'var(--leading-h1)' }],
        h2:   ['var(--text-size-h2)',   { lineHeight: 'var(--leading-h2)' }],
        h3:   ['var(--text-size-h3)',   { lineHeight: 'var(--leading-h3)' }],
        h4:   ['var(--text-size-h4)',   { lineHeight: 'var(--leading-h4)' }],
        body: ['var(--text-size-body)', { lineHeight: 'var(--leading-body)' }],
      },
      borderRadius: {
        tag:    'var(--radius-tag)',
        card:   'var(--radius-card)',
        button: 'var(--radius-button)',
        full:   'var(--radius-full)',
      },
      spacing: {
        sm: 'var(--space-sm)',
        md: 'var(--space-md)',
        lg: 'var(--space-lg)',
      },
    },
  },
  plugins: [],
};
