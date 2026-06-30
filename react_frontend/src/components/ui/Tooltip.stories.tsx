// react_frontend/src/components/ui/Tooltip.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Tooltip } from './Tooltip'

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Tooltip>

export const Short: Story = {
  args: {
    content: "The lattice maker's main widget",
    children: <button style={{ padding: '6px 14px' }}>Hover me</button>,
  },
}

export const Long: Story = {
  args: {
    content:
      'Three types of volumetric macro-shape volumetric (trivariate) construction are supported:\n1. Extrusion – the input IGES surface is extruded in +Z by a desired extrusion length.\n2. Revolution – the input IGES surface is revolved around the +Z axis.\n3. Ruling – the two input IGES surfaces are ruled in between.',
    children: <button style={{ padding: '6px 14px' }}>Hover for long text</button>,
  },
}
