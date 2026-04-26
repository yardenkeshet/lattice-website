import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { NumberInput } from './NumberInput'

const meta: Meta<typeof NumberInput> = {
  title: 'UI/NumberInput',
  component: NumberInput,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A compact number spinner matching the Figma design system spec. ' +
          'Supports an optional 1-char prefix label, min/max clamping, step, ' +
          'hover/focus/disabled states, and controlled or uncontrolled usage.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    value:        { control: { type: 'number' } },
    defaultValue: { control: { type: 'number' } },
    min:          { control: { type: 'number' } },
    max:          { control: { type: 'number' } },
    step:         { control: { type: 'number' } },
    label:        { control: 'text' },
    disabled:     { control: 'boolean' },
  },
}

export default meta
type Story = StoryObj<typeof NumberInput>

/* ── Core states ── */

export const Default: Story = {
  args: {
    defaultValue: 53,
  },
}

export const WithLabel: Story = {
  name: 'With Label (X)',
  args: {
    label: 'X',
    defaultValue: 53,
  },
}

export const Disabled: Story = {
  args: {
    label: 'X',
    defaultValue: 53,
    disabled: true,
  },
}

/* ── Min / Max clamping ── */

export const WithMinMax: Story = {
  name: 'With Min / Max',
  args: {
    label: 'X',
    defaultValue: 41,
    min: 1,
    max: 100,
    step: 1,
  },
}

export const AtMinimum: Story = {
  name: 'Value at Minimum',
  args: {
    label: 'X',
    defaultValue: 1,
    min: 1,
    max: 100,
  },
}

export const AtMaximum: Story = {
  name: 'Value at Maximum',
  args: {
    label: 'X',
    defaultValue: 100,
    min: 1,
    max: 100,
  },
}

export const DecimalStep: Story = {
  name: 'Decimal Step (0.01)',
  args: {
    label: 'Z',
    defaultValue: 0.17,
    min: 0,
    max: 1,
    step: 0.01,
  },
}

/* ── Label variants ── */

export const LabelY: Story = {
  name: 'Label "Y"',
  args: {
    label: 'Y',
    defaultValue: 24,
    min: 1,
    max: 100,
  },
}

export const IconLabel: Story = {
  name: 'Icon Label',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <NumberInput
        label={<GridIcon />}
        defaultValue={4}
        min={1}
        max={20}
        aria-label="Grid columns"
      />
      <NumberInput
        label={<LayersIcon />}
        defaultValue={2}
        min={1}
        max={10}
        aria-label="Layers"
      />
    </div>
  ),
}

export const NoLabel: Story = {
  name: 'No Label',
  args: {
    defaultValue: 42,
    min: 0,
    'aria-label': 'Quantity',
  },
}

/* ── Controlled usage ── */

export const Controlled: Story = {
  name: 'Controlled',
  render: () => {
    const [val, setVal] = useState(10)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <NumberInput
          label="N"
          value={val}
          onChange={setVal}
          min={0}
          max={50}
        />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-size-body)', color: 'var(--text-secondary)', margin: 0 }}>
          Controlled value: <strong>{val}</strong>
        </p>
      </div>
    )
  },
}

/* ── All variants overview ── */

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)' }}>
      <Row label="Default">
        <NumberInput defaultValue={53} />
      </Row>
      <Row label='With label "X"'>
        <NumberInput label="X" defaultValue={53} />
      </Row>
      <Row label='With label "Y"'>
        <NumberInput label="Y" defaultValue={24} min={1} max={100} />
      </Row>
      <Row label="Min / Max (1–100)">
        <NumberInput label="X" defaultValue={41} min={1} max={100} />
      </Row>
      <Row label="Decimal step">
        <NumberInput label="Z" defaultValue={0.17} min={0} max={1} step={0.01} />
      </Row>
      <Row label="At minimum">
        <NumberInput label="X" defaultValue={1} min={1} max={100} />
      </Row>
      <Row label="At maximum">
        <NumberInput label="X" defaultValue={100} min={1} max={100} />
      </Row>
      <Row label="Disabled">
        <NumberInput label="X" defaultValue={53} disabled />
      </Row>
      <Row label="No label">
        <NumberInput defaultValue={42} aria-label="Quantity" />
      </Row>
      <Row label="Icon label (grid)">
        <NumberInput label={<GridIcon />} defaultValue={4} min={1} max={20} aria-label="Grid columns" />
      </Row>
      <Row label="Icon label (layers)">
        <NumberInput label={<LayersIcon />} defaultValue={2} min={1} max={10} aria-label="Layers" />
      </Row>
    </div>
  ),
}

/* ── Tiny icon helpers (10×10 SVG, matches Figma label slot) ── */

function GridIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="0.5" y="0.5" width="3.5" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1" />
      <rect x="6" y="0.5" width="3.5" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="6" width="3.5" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1" />
      <rect x="6" y="6" width="3.5" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function LayersIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1 3.5L5 1.5L9 3.5L5 5.5L1 3.5Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M1 6.5L5 8.5L9 6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-size-sm)',
        color: 'var(--text-secondary)',
        width: 160,
        flexShrink: 0,
      }}>
        {label}
      </span>
      {children}
    </div>
  )
}
