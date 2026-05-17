import type { Meta, StoryObj } from '@storybook/react'
import { IconButton } from './IconButton'

/* ── Inline SVG icons for the stories ── */

function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1 3h12M1 7h12M1 11h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M7 1v8M4 6l3 3 3-3M1 11h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const meta: Meta<typeof IconButton> = {
  title: 'UI/IconButton',
  component: IconButton,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A 31×31px icon button with a 44×44px hit/glow area, matching the Figma spec. ' +
          'Pass any SVG icon as children. The outer glow area lights up on hover.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    'aria-label': { control: 'text' },
  },
}

export default meta
type Story = StoryObj<typeof IconButton>

/* ── Core states ── */

export const Default: Story = {
  args: { 'aria-label': 'Open menu' },
  render: args => <IconButton {...args}><MenuIcon /></IconButton>,
}

export const Disabled: Story = {
  args: { 'aria-label': 'Open menu', disabled: true },
  render: args => <IconButton {...args}><MenuIcon /></IconButton>,
}

/* ── Icon variants ── */

export const AllIcons: Story = {
  name: 'Icon Variants',
  render: () => (
    <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
      <IconButton aria-label="Menu"><MenuIcon /></IconButton>
      <IconButton aria-label="Close"><CloseIcon /></IconButton>
      <IconButton aria-label="Back"><ChevronLeftIcon /></IconButton>
      <IconButton aria-label="Add"><PlusIcon /></IconButton>
      <IconButton aria-label="Download"><DownloadIcon /></IconButton>
    </div>
  ),
}

/* ── All states ── */

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', padding: 'var(--space-md)' }}>
      <Row label="Default">
        <IconButton aria-label="Menu"><MenuIcon /></IconButton>
      </Row>
      <Row label="Hover (move cursor)">
        <IconButton aria-label="Menu"><MenuIcon /></IconButton>
      </Row>
      <Row label="Disabled">
        <IconButton aria-label="Menu" disabled><MenuIcon /></IconButton>
      </Row>
      <Row label="With onClick">
        <IconButton aria-label="Add" onClick={() => alert('clicked!')}><PlusIcon /></IconButton>
      </Row>
      <Row label="Close">
        <IconButton aria-label="Close"><CloseIcon /></IconButton>
      </Row>
      <Row label="Download">
        <IconButton aria-label="Download"><DownloadIcon /></IconButton>
      </Row>
    </div>
  ),
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-size-sm)',
        color: 'var(--text-secondary)',
        width: 140,
        flexShrink: 0,
      }}>
        {label}
      </span>
      {children}
    </div>
  )
}
