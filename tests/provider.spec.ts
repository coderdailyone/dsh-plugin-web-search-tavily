import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { IncomingHttpHeaders } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  TAVILY_PROVIDER_ID,
  TavilySearchProvider,
  mapTavilyResponse,
  mapTavilyResult,
} from '../src/provider.js'
import type { TavilySearchProviderOptions } from '../src/provider.js'

interface RecordedRequest {
  method: string | undefined
  url: string | undefined
  headers: IncomingHttpHeaders
  body: unknown
}

/** One-shot loopback Tavily double: records the request, serves a canned reply. */
function serve(status: number, payload: string, contentType = 'application/json'): Promise<{
  baseURL: string
  requests: RecordedRequest[]
  close: () => Promise<void>
}> {
  const requests: RecordedRequest[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk as Buffer))
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let body: unknown
      try {
        body = raw.length > 0 ? JSON.parse(raw) : undefined
      } catch {
        body = raw
      }
      requests.push({ method: request.method, url: request.url, headers: request.headers, body })
      response.writeHead(status, { 'content-type': contentType })
      response.end(payload)
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        baseURL: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((done, fail) => {
          server.close(error => error ? fail(error) : done())
        }),
      })
    })
  })
}

function options(overrides: Partial<TavilySearchProviderOptions> = {}): TavilySearchProviderOptions {
  return {
    apiKey: 'tvly-test-key',
    baseURL: 'https://api.tavily.com',
    searchDepth: 'basic',
    topic: 'general',
    includeAnswer: true,
    ...overrides,
  }
}

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

describe('mapTavilyResult', () => {
  it('maps url, title, snippet, and publishedAt', () => {
    expect(mapTavilyResult({
      url: 'https://example.com/a',
      title: 'A',
      content: 'snippet text',
      published_date: '2026-08-01',
    })).toEqual({
      url: 'https://example.com/a',
      title: 'A',
      snippet: 'snippet text',
      publishedAt: '2026-08-01',
    })
  })

  it('drops entries without a non-blank snippet and omits absent optionals', () => {
    expect(mapTavilyResult({ url: 'https://example.com/a', content: '   ' })).toBeUndefined()
    expect(mapTavilyResult({ url: 'https://example.com/a' })).toBeUndefined()
    expect(mapTavilyResult({ url: 'https://example.com/a', title: null, content: 'x', published_date: null }))
      .toEqual({ url: 'https://example.com/a', snippet: 'x' })
  })
})

describe('mapTavilyResponse', () => {
  it('maps answer to content and filters snippet-less results', () => {
    expect(mapTavilyResponse({
      answer: 'the answer',
      results: [
        { url: 'https://a.example', content: 'keep' },
        { url: 'https://b.example', content: '' },
      ],
    })).toEqual({
      content: 'the answer',
      sources: [{ url: 'https://a.example', snippet: 'keep' }],
      truncated: false,
    })
  })

  it('omits content for a blank or absent answer and tolerates missing results', () => {
    expect(mapTavilyResponse({ answer: '  ' })).toEqual({ sources: [], truncated: false })
    expect(mapTavilyResponse({})).toEqual({ sources: [], truncated: false })
  })
})

describe('TavilySearchProvider.available', () => {
  it('requires a key, a parseable base URL, and a valid numResults', () => {
    expect(new TavilySearchProvider(options()).available()).toBe(true)
    expect(new TavilySearchProvider(options({ apiKey: '' })).available()).toBe(false)
    expect(new TavilySearchProvider(options({ baseURL: 'not a url' })).available()).toBe(false)
    expect(new TavilySearchProvider(options({ numResults: 0 })).available()).toBe(false)
    expect(new TavilySearchProvider(options({ numResults: 2.5 })).available()).toBe(false)
    expect(new TavilySearchProvider(options({ numResults: 5 })).available()).toBe(true)
  })
})

describe('TavilySearchProvider.search', () => {
  it('sends the documented request shape and maps the response', async () => {
    const double = await serve(200, JSON.stringify({
      answer: 'generated answer',
      results: [{ url: 'https://a.example', title: 'A', content: 'sa', published_date: '2026-01-02' }],
    }))
    cleanups.push(double.close)
    const provider = new TavilySearchProvider(options({ baseURL: double.baseURL, numResults: 7 }))

    const result = await provider.search({ query: 'dsh plugins' })

    expect(double.requests).toHaveLength(1)
    const seen = double.requests[0]!
    expect(seen.method).toBe('POST')
    expect(seen.url).toBe('/search')
    expect(seen.headers.authorization).toBe('Bearer tvly-test-key')
    expect(seen.headers['content-type']).toBe('application/json')
    expect(seen.headers['user-agent']).toContain('dsh-plugin-web-search-tavily/')
    expect(seen.body).toEqual({
      query: 'dsh plugins',
      search_depth: 'basic',
      topic: 'general',
      include_answer: true,
      max_results: 7,
    })
    expect(result).toEqual({
      content: 'generated answer',
      sources: [{ url: 'https://a.example', title: 'A', snippet: 'sa', publishedAt: '2026-01-02' }],
      truncated: false,
    })
  })

  it('lets a per-request maxResults win over the configured default and omits the field when neither is set', async () => {
    const double = await serve(200, JSON.stringify({ results: [] }))
    cleanups.push(double.close)
    const bounded = new TavilySearchProvider(options({ baseURL: double.baseURL, numResults: 7 }))
    await bounded.search({ query: 'q', maxResults: 3 })
    expect((double.requests[0]!.body as { max_results?: number }).max_results).toBe(3)

    const unbounded = new TavilySearchProvider(options({ baseURL: double.baseURL }))
    await unbounded.search({ query: 'q' })
    expect(double.requests[1]!.body).not.toHaveProperty('max_results')
  })

  it('surfaces the richest available detail from a non-2xx JSON error body', async () => {
    for (const [payload, expected] of [
      [JSON.stringify({ detail: { error: 'nested detail' } }), 'nested detail'],
      [JSON.stringify({ detail: 'string detail' }), 'string detail'],
      [JSON.stringify({ error: 'flat error' }), 'flat error'],
      [JSON.stringify({ message: 'just message' }), 'just message'],
    ] as const) {
      const double = await serve(432, payload)
      const provider = new TavilySearchProvider(options({ baseURL: double.baseURL }))
      await expect(provider.search({ query: 'q' })).rejects.toMatchObject({
        name: 'WebError',
        code: 'WEB_PROVIDER_ERROR',
        message: expected,
      })
      await double.close()
    }
  })

  it('falls back to the HTTP status for a non-JSON error body', async () => {
    const double = await serve(500, 'gateway soup', 'text/plain')
    cleanups.push(double.close)
    const provider = new TavilySearchProvider(options({ baseURL: double.baseURL }))
    await expect(provider.search({ query: 'q' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
      message: 'Tavily API error (HTTP 500)',
    })
  })

  it('classifies an unprocessable 2xx body as WEB_PROVIDER_ERROR', async () => {
    const double = await serve(200, 'not json', 'application/json')
    cleanups.push(double.close)
    const provider = new TavilySearchProvider(options({ baseURL: double.baseURL }))
    await expect(provider.search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  })

  it('surfaces cancellation as WEB_ABORTED', async () => {
    const provider = new TavilySearchProvider(options({ baseURL: 'http://127.0.0.1:9' }))
    const controller = new AbortController()
    controller.abort()
    await expect(provider.search({ query: 'q' }, controller.signal)).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })

  it('classifies a connection failure as WEB_PROVIDER_ERROR with a cause chain', async () => {
    const provider = new TavilySearchProvider(options({ baseURL: 'http://127.0.0.1:9' }))
    const failure = await provider.search({ query: 'q' }).then(
      () => { throw new Error('expected rejection') },
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(WebError)
    expect((failure as WebError).code).toBe('WEB_PROVIDER_ERROR')
    expect((failure as { cause?: unknown }).cause).toBeDefined()
  })

  it('registers under the stable provider id', () => {
    expect(new TavilySearchProvider(options()).id).toBe(TAVILY_PROVIDER_ID)
  })
})
