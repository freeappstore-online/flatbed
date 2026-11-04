// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const themeBlocks = [...css.matchAll(/:root(?:\[data-theme=['"]dark['"]\])?\s*\{([^}]+)\}/g)]

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map((channel) => {
    const value = parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels.reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0)
}

describe('Tailwind surface contract', () => {
  it('pairs accent backgrounds with an AA foreground in both themes', () => {
    const themes = themeBlocks.filter((block) => /--accent:/.test(block[1]))
    expect(themes).toHaveLength(2)
    for (const block of themes) {
      const accent = /--accent:\s*(#[\da-f]{6});/i.exec(block[1])?.[1]
      const foreground = /--accent-fg:\s*(#[\da-f]{6});/i.exec(block[1])?.[1]
      expect(accent).toBeDefined()
      expect(foreground).toBeDefined()
      const values = [luminance(accent!), luminance(foreground!)].sort((a, b) => b - a)
      expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5)
    }
    expect(css).toContain('--color-accent-fg: var(--accent-fg)')
  })

  it('keeps card surfaces opaque in light and dark themes', () => {
    const surfaces = themeBlocks.flatMap((block) => [...block[1].matchAll(/--panel:\s*([^;]+);/g)])
    expect(surfaces).toHaveLength(2)
    for (const [, value] of surfaces) {
      expect(value).toMatch(/^(?:#[\da-f]{6}|rgb\([^/]+\))$/i)
    }
  })

  it('uses the opaque page token for floating surfaces in both themes', () => {
    const surfaces = themeBlocks.flatMap((block) => [...block[1].matchAll(/--popover:\s*([^;]+);/g)])
    expect(surfaces).toHaveLength(2)
    for (const [, value] of surfaces) expect(value).toBe('var(--paper)')
    expect(css).toContain('--color-popover: var(--popover)')
  })

  it('scans SDK utilities and maps semantic colours for Tailwind', () => {
    expect(css).toContain('@source "../node_modules/@freeappstore/sdk/dist"')
    for (const token of ['paper', 'ink', 'panel', 'accent', 'danger']) {
      expect(css).toContain(`--color-${token}: var(--${token})`)
    }
  })
})
