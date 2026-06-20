export const EXTRUSION = 'extrusion'
export const REVOLUTION = 'revolution'
export const RULING = 'ruling'

export const CROSS = 'cross'
export const DIAGONAL = 'diagonal'
export const CROSS_DIAGONAL = 'cross_diagonal'

export const DEFAULT_CALC_MODE: CalcMode = EXTRUSION

//Calculation parameters:
export const DEFAULT_X_COUNT = 1
export const DEFAULT_Y_COUNT = 1
export const DEFAULT_Z_COUNT = 10
export const DEFAULT_G1 = 1
export const DEFAULT_G2 = 1

//UI parameters:
export const DEFAULT_CAMERA_MODE = 'perspective' as const
export const DEFAULT_ZOOM = 100
export const DEFAULT_LATTICE_MENU_OPEN = true
export const DEFAULT_TILE_MENU_OPEN = true
export const INITIAL_VIEWER_RESET_KEY = 'initial'

export const DEFAULT_MODEL_COLOR = "#00aaff"
export const DEFAULT_BACKGROUND_COLOR = "#fff"

//Tile types and parameters:

export const DEFAULT_TILE_TYPE: TileType = DIAGONAL


import type { CalcMode, TileType } from '../calculation_params'

export interface TileDef {
    label: string
    imageUrl: string
    sliders: SliderDef[]
}

export interface SliderDef {
    label: string
    min: number
    max: number
    defaultValue: number
    step: number
}

