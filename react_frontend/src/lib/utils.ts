import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const DEFAULT_X_COUNT = 3
export const DEFAULT_Y_COUNT = 3
export const DEFAULT_Z_COUNT = 3