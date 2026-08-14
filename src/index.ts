/**
 * `dsh-plugin-web-search-tavily`: registers a Tavily-backed `WebSearchProvider`
 * with `ctx.web`. A function/namespace plugin (NOT a default-export service):
 * a search provider does not own the `ctx.web` key — it registers INTO the
 * seam's provider registry. The key is owned by `@deepseek-ai/dsh-web`.
 * @module dsh-plugin-web-search-tavily
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import {
  TAVILY_DEFAULT_BASE_URL,
  TAVILY_DEFAULT_SEARCH_DEPTH,
  TAVILY_DEFAULT_TOPIC,
  TavilySearchProvider,
} from './provider.js'

export {
  TAVILY_DEFAULT_BASE_URL,
  TAVILY_DEFAULT_SEARCH_DEPTH,
  TAVILY_DEFAULT_TOPIC,
  TAVILY_PROVIDER_ID,
  TavilySearchProvider,
  mapTavilyResult,
  mapTavilyResponse,
} from './provider.js'
export type { TavilySearchProviderOptions } from './provider.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-tavily'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** Tavily API key. Falls back to `$TAVILY_API_KEY`. Empty → provider unavailable. */
  apiKey?: string
  /** Endpoint base; `/search` is appended. Defaults to the public API. */
  baseURL?: string
  /** Tavily `search_depth`. `advanced` costs extra credits. Defaults to `basic`. */
  searchDepth?: 'basic' | 'advanced'
  /** Tavily `topic` vertical. Defaults to `general`. */
  topic?: 'general' | 'news'
  /** Request Tavily's generated answer as `content`. Defaults to `true`. */
  includeAnswer?: boolean
  /** Default result count when a request carries no `maxResults`. Omitted = provider default. */
  numResults?: number
}

export const Config: z<Config> = z.object({
  apiKey: z.string(),
  baseURL: z.string(),
  searchDepth: z.union(['basic', 'advanced'] as const),
  topic: z.union(['general', 'news'] as const),
  includeAnswer: z.boolean(),
  numResults: z.number().step(1).min(1),
})

/** Register the Tavily search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new TavilySearchProvider({
    apiKey: config.apiKey ?? process.env.TAVILY_API_KEY ?? '',
    baseURL: config.baseURL ?? TAVILY_DEFAULT_BASE_URL,
    searchDepth: config.searchDepth ?? TAVILY_DEFAULT_SEARCH_DEPTH,
    topic: config.topic ?? TAVILY_DEFAULT_TOPIC,
    includeAnswer: config.includeAnswer ?? true,
    ...config.numResults !== undefined ? { numResults: config.numResults } : {},
  }))
}
