import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'
import { Config, apply, inject, name } from '../src/index.js'
import { TavilySearchProvider } from '../src/provider.js'

/** Capture the provider `apply` registers without booting a Cordis tree. */
function stubContext(): { ctx: Context; registered: WebSearchProvider[] } {
  const registered: WebSearchProvider[] = []
  const ctx = {
    web: {
      registerSearchProvider(provider: WebSearchProvider) {
        registered.push(provider)
        return () => {}
      },
    },
  } as unknown as Context
  return { ctx, registered }
}

describe('plugin contract', () => {
  it('declares the loader-facing name and the web seam dependency', () => {
    expect(name).toBe('web-search-tavily')
    expect(inject).toEqual(['web'])
  })

  it('validates config through the exported schema', () => {
    expect(() => Config({ searchDepth: 'advanced', numResults: 5 })).not.toThrow()
    expect(() => Config({ searchDepth: 'frantic' })).toThrow()
    expect(() => Config({ numResults: 0 })).toThrow()
  })

  it('registers a Tavily provider with constant and env-var defaults applied', () => {
    const { ctx, registered } = stubContext()
    apply(ctx, { apiKey: 'tvly-k' })
    expect(registered).toHaveLength(1)
    expect(registered[0]).toBeInstanceOf(TavilySearchProvider)
    expect(registered[0]!.id).toBe('tavily')
    expect(registered[0]!.available()).toBe(true)
  })

  it('is registered-but-unavailable without a key, not absent', () => {
    const previous = process.env.TAVILY_API_KEY
    delete process.env.TAVILY_API_KEY
    try {
      const { ctx, registered } = stubContext()
      apply(ctx, {})
      expect(registered).toHaveLength(1)
      expect(registered[0]!.available()).toBe(false)
    } finally {
      if (previous !== undefined) process.env.TAVILY_API_KEY = previous
    }
  })
})
