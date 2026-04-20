import { describe, it, expect } from 'vitest'

describe('Basic Setup', () => {
  it('should pass a smoke test', () => {
    expect(true).toBe(true)
  })

  it('should have access to JSDOM', () => {
    const element = document.createElement('div')
    expect(element).not.toBeNull()
  })
})
