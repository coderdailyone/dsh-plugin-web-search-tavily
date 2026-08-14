/**
 * Wire types for the Tavily Search API (`POST /search`), written against the
 * public API documentation as of 2026-08. Only the fields this provider reads
 * are declared; unknown fields are ignored.
 * @module dsh-plugin-web-search-tavily/types
 */

/** One entry of Tavily's `results[]`. */
export interface TavilyResult {
  readonly url: string
  readonly title?: string | null
  /** Tavily's extracted content snippet for the result. */
  readonly content?: string | null
  /** ISO-8601-ish publication date; present mainly for `topic: "news"`. */
  readonly published_date?: string | null
}

/** The `POST /search` response envelope. */
export interface TavilySearchResponse {
  /** Provider-generated answer, present when `include_answer` was requested. */
  readonly answer?: string | null
  readonly results?: readonly TavilyResult[]
}

/** Error body shape returned by Tavily on non-2xx responses. */
export interface TavilyError {
  readonly detail?: { readonly error?: string } | string
  readonly error?: string
  readonly message?: string
}
