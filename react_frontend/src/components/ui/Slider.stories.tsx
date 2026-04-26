import type { Meta, StoryObj } from '@storybook/react'
import { Slider } from './Slider'

const meta: Meta<typeof Slider> = {
  title: 'UI/Slider',
  component: Slider,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A chunky range slider built on Radix UI primitives, styled with Lattice World design tokens. Supports optional value badge, label, min/max, and disabled state.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    min: { control: { type: 'number' } },
    max: { control: { type: 'number' } },
    step: { control: { type: 'number' } },
    showValue: { control: 'boolean' },
    disabled: { control: 'boolean' },
    label: { control: 'text' },
    valuePrecision: { control: { type: 'number', min: 0, max: 4 } },
  },
}

export default meta
type Story = StoryObj<typeof Slider>

export const Default: Story = {
  args: {
    defaultValue: [0.5],
    min: 0,
    max: 1,
    step: 0.01,
  },
  decorators: [Story => <div style={{ width: 300 }}><Story /></div>],
}

export const WithValueBadge: Story = {
  name: 'With Value Badge',
  args: {
    defaultValue: [0.57],
    min: 0,
    max: 1,
    step: 0.01,
    showValue: true,
    valuePrecision: 2,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

export const WithLabel: Story = {
  name: 'With Label',
  args: {
    label: 'Grading Strength',
    defaultValue: [0.3],
    min: 0,
    max: 1,
    step: 0.01,
    showValue: true,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

export const CustomRange: Story = {
  name: 'Custom Min / Max',
  args: {
    label: 'Num Tiles X',
    defaultValue: [24],
    min: 1,
    max: 100,
    step: 1,
    showValue: true,
    valuePrecision: 0,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

export const Disabled: Story = {
  args: {
    defaultValue: [0.4],
    min: 0,
    max: 1,
    step: 0.01,
    showValue: true,
    disabled: true,
    label: 'Disabled Slider',
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', width: 360, padding: 'var(--space-lg)' }}>
      <Slider
        label="Default"
        defaultValue={[0.5]}
        min={0} max={1} step={0.01}
      />
      <Slider
        label="With Value Badge"
        defaultValue={[0.57]}
        min={0} max={1} step={0.01}
        showValue
        valuePrecision={2}
      />
      <Slider
        label="Grading Smoothness"
        defaultValue={[0.17]}
        min={0} max={1} step={0.01}
        showValue
        valuePrecision={2}
      />
      <Slider
        label="Num Tiles (1–100)"
        defaultValue={[41]}
        min={1} max={100} step={1}
        showValue
        valuePrecision={0}
      />
      <Slider
        label="Disabled"
        defaultValue={[0.6]}
        min={0} max={1} step={0.01}
        showValue
        disabled
      />
    </div>
  ),
}
