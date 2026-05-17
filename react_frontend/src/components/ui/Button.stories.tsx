import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

/* ── Inline icon helpers ── */

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A 31px tall button matching the Figma spec. ' +
          'Two variants: secondary (gray, matches Figma "Export") and primary (navy). ' +
          'Accepts optional left/right icons.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant:  { control: 'radio', options: ['primary', 'secondary'] },
    disabled: { control: 'boolean' },
  },
}

export default meta
type Story = StoryObj<typeof Button>

/* ── Secondary ── */

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Export' },
}

export const SecondaryDisabled: Story = {
  name: 'Secondary — Disabled',
  args: { variant: 'secondary', children: 'Export', disabled: true },
}

export const SecondaryLeftIcon: Story = {
  name: 'Secondary — Left Icon',
  args: { variant: 'secondary', children: 'Download', leftIcon: <DownloadIcon /> },
}

export const SecondaryRightIcon: Story = {
  name: 'Secondary — Right Icon',
  args: { variant: 'secondary', children: 'Next', rightIcon: <ChevronRightIcon /> },
}

/* ── Primary ── */

export const Primary: Story = {
  args: { variant: 'primary', children: 'Calculate' },
}

export const PrimaryDisabled: Story = {
  name: 'Primary — Disabled',
  args: { variant: 'primary', children: 'Calculate', disabled: true },
}

export const PrimaryLeftIcon: Story = {
  name: 'Primary — Left Icon',
  args: { variant: 'primary', children: 'Add Tile', leftIcon: <PlusIcon /> },
}

export const PrimaryRightIcon: Story = {
  name: 'Primary — Right Icon',
  args: { variant: 'primary', children: 'Continue', rightIcon: <ChevronRightIcon /> },
}

export const PrimaryBothIcons: Story = {
  name: 'Primary — Both Icons',
  args: {
    variant: 'primary',
    children: 'Export',
    leftIcon: <DownloadIcon />,
    rightIcon: <ChevronRightIcon />,
  },
}

/* ── All variants ── */

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)' }}>

      <Section label="Secondary">
        <Button variant="secondary">Export</Button>
        <Button variant="secondary" leftIcon={<DownloadIcon />}>Download</Button>
        <Button variant="secondary" rightIcon={<ChevronRightIcon />}>Next</Button>
        <Button variant="secondary" disabled>Disabled</Button>
      </Section>

      <Section label="Primary">
        <Button variant="primary">Calculate</Button>
        <Button variant="primary" leftIcon={<PlusIcon />}>Add Tile</Button>
        <Button variant="primary" rightIcon={<ChevronRightIcon />}>Continue</Button>
        <Button variant="primary" leftIcon={<DownloadIcon />} rightIcon={<ChevronRightIcon />}>Export</Button>
        <Button variant="primary" disabled>Disabled</Button>
      </Section>

      <Section label="Icon only">
        <Button variant="secondary" aria-label="Download"><DownloadIcon /></Button>
        <Button variant="primary" aria-label="Add"><PlusIcon /></Button>
      </Section>

    </div>
  ),
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-size-sm)',
        fontWeight: 600,
        color: 'var(--text-secondary)',
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}
