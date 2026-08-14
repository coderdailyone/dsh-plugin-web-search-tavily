import { describe, expect, it } from 'vitest'
import { TavilySearchProvider } from '../src/provider.js'

/**
 * With-key smoke against the real Tavily API. Self-skips without
 * `TAVILY_API_KEY`; skipping is a key-availability fact, not a cost signal.
 */
describe.skipIf(!process.env.TAVILY_API_KEY)('Tavily live', () => {
  it('returns at least one snippet-bearing source for a plain query', async () => {
    const provider = new TavilySearchProvider({
      apiKey: process.env.TAVILY_API_KEY!,
      baseURL: 'https://api.tavily.com',
      searchDepth: 'basic',
      topic: 'general',
      includeAnswer: true,
      numResults: 3,
    })
    const result = await provider.search({ query: 'DeepSeek Harness agent framework', maxResults: 3 })
    expect(result.sources.length).toBeGreaterThan(0)
    for (const source of result.sources) {
      expect(source.url).toMatch(/^https?:\/\//)
      expect(source.snippet!.length).toBeGreaterThan(0)
    }
  }, 30_000)
})
