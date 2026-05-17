import type { Meta, StoryObj } from '@storybook/react'
import { Footer } from './Footer'

const meta: Meta<typeof Footer> = {
  title: 'UI/Footer',
  component: Footer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Site footer: a 7px navy top stripe followed by an 88px decorative body. ' +
          'Accepts an optional bgImage for the brand wave/circle motif; ' +
          'falls back to a CSS gradient when omitted.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Footer>

export const Default: Story = {
  name: 'Default (CSS gradient)',
  args: {},
}

export const WithImage: Story = {
  name: 'With background image',
  args: {
    bgImage: 'https://picsum.photos/seed/footer/1400/700',
  },
}
