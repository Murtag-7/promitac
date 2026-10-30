import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge our custom type scale so `text-body` (size) never cancels `text-ink` (colour).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['meta', 'small', 'body', 'title', 'screen', 'hero'] }],
      rounded: [{ rounded: ['chip', 'control', 'card', 'panel'] }],
      shadow: [{ shadow: ['overlay'] }]
    }
  }
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
