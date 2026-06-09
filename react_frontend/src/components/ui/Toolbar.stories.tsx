import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Toolbar } from './Toolbar'

const meta: Meta<typeof Toolbar> = {
  title: 'UI/Toolbar',
  component: Toolbar,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Top bar for the 3D workspace. ' +
          'Add button opens a native file picker for .stl/.obj/.3mf files. ' +
          'Zoom ±10% and camera mode (Perspective / Orthographic) both feed into ViewerScene.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Toolbar>

export const Default: Story = {
  render: () => {
    const [zoom, setZoom] = useState(100)
    const [mode, setMode] = useState<'perspective' | 'orthographic'>('perspective')
    return (
      <Toolbar
        fileNames={[]}
        zoom={zoom}
        cameraMode={mode}
        onZoomChange={setZoom}
        onCameraModeChange={setMode}
        onFilesAdd={files => alert(`Files selected: ${files.map(f => f.name).join(', ')}`)}
        onCalculate={() => alert('Calculate!')}
      />
    )
  },
}

export const Calculating: Story = {
  name: 'While calculating',
  render: () => (
    <Toolbar
      fileNames={[]}
      zoom={100}
      cameraMode="perspective"
      isCalculating
    />
  ),
}
