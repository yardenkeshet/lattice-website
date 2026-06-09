import type { Meta, StoryObj } from '@storybook/react'
import { DualViewerLayout } from './DualViewerLayout'

const meta: Meta<typeof DualViewerLayout> = {
  title: 'Components/DualViewerLayout',
  component: DualViewerLayout,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof DualViewerLayout>

export const BothEmpty: Story = {
  args: {
    file1: null,
    file2: null,
    onFile1Drop: (f) => console.log('file1 dropped', f.name),
    onFile2Drop: (f) => console.log('file2 dropped', f.name),
    cameraMode: 'perspective',
    zoom: 100,
    onZoomChange: (z) => console.log('zoom', z),
  },
  decorators: [
    (Story) => (
      <div style={{ height: '500px' }}>
        <Story />
      </div>
    ),
  ],
}
