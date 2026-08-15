<p align="center">
  <img src="https://raw.githubusercontent.com/coderdailyone/dsh-plugin-web-search-tavily/main/docs/assets/banner.svg" alt="dsh-plugin-web-search-tavily — Tavily backend for dsh's built-in web_search" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-plugin-web-search-tavily"><img src="https://img.shields.io/npm/v/dsh-plugin-web-search-tavily?color=14b8a6&label=npm" alt="npm version"></a>
  <img src="https://img.shields.io/npm/l/dsh-plugin-web-search-tavily?color=34d399" alt="license">
  <a href="https://github.com/deepseek-ai/deepseek-harness/discussions/2021"><img src="https://img.shields.io/badge/dsh-Show%20Your%20Plugins!-0f766e" alt="dsh discussion"></a>
</p>

<p align="center">
  <a href="#install">Install</a> · <a href="#config">Config</a> · <a href="#behavior">Behavior</a> · <a href="#model-experience">Model Experience</a> · <a href="./README.zh.md">中文文档</a>
</p>

A community [Tavily](https://tavily.com) search provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`). It registers a `WebSearchProvider` into the `ctx.web` capability seam, so the shipped `web_search` tool can be served by Tavily without touching any model-facing schema.

Ships as a **dsh bundle**: installing it into a profile inserts its plugin row automatically.

## Install

```sh
dsh plugin --profile web add dsh-plugin-web-search-tavily
```

Provide the API key through the environment (`TAVILY_API_KEY`, e.g. in `$DSH_HOME/.env`) or through plugin config. When more than one search provider is usable in your composition, pin the selection with `$DSH_WEB_SEARCH_PROVIDER=tavily` or by patching the `web` row's `searchProvider` in your profile's `cordis.patch.yml`; with Tavily as the only usable provider, selection is automatic.

Verify without booting, then boot:

```sh
dsh --profile web --dump-config   # shows a "# == dsh-plugin-web-search-tavily" layer
dsh --profile web
```

## Config

Override any field by patching the `web-search-tavily` row in your profile's `cordis.patch.yml` (a patch replaces the whole `config` value — restate the fields you keep):

| Key | Default | Meaning |
|---|---|---|
| `apiKey` | `$TAVILY_API_KEY` | Tavily API key. Empty makes the provider registered-but-unavailable. |
| `baseURL` | `https://api.tavily.com` | Endpoint base; `/search` is appended. |
| `searchDepth` | `basic` | Tavily `search_depth`. `advanced` returns richer snippets at extra credit cost. |
| `topic` | `general` | Tavily `topic` vertical (`general` or `news`; `news` populates `publishedAt`). |
| `includeAnswer` | `true` | Request Tavily's generated answer; it surfaces as the search result's `content`. |
| `numResults` | *(omitted)* | Default result count when a request carries no `maxResults`. The seam still enforces the tool-layer bound either way. |

```yaml
- id: web-search-tavily
  config:
    searchDepth: advanced
    includeAnswer: false
```

## Behavior

- `POST {baseURL}/search` with `Authorization: Bearer <key>`, honoring the request `AbortSignal`; redirects are refused.
- `results[].content` maps to `snippet`, `published_date` to `publishedAt`; entries without a non-blank snippet are dropped rather than padded with invented text.
- A non-blank `answer` maps to the result's `content`; nothing is fabricated when Tavily returns none.
- Cancellation surfaces as `WebError` code `WEB_ABORTED`; every other failure (transport, non-2xx, unprocessable body) is `WEB_PROVIDER_ERROR` with the richest provider detail available and a preserved `cause` chain. A non-2xx JSON error body's `detail.error` / `detail` / `error` / `message` fields are tried in that order.
- `available()` is a cheap local check (key present, base URL parseable, bounds valid) and never touches the network.

## Model Experience

### What the model sees

Nothing from this package directly. The model-facing `web_search` schema and rendering belong to `@deepseek-ai/dsh-tool-web`; this provider only changes which backend serves the call. Result `content` (Tavily's generated answer, when enabled) and per-source `title`/`snippet`/`publishedAt` flow through the tool's ordinary rendering.

### Token effect

`includeAnswer: true` adds one provider-generated answer paragraph to each search result the model reads. `searchDepth: advanced` tends to return longer snippets. Both are provider-output effects; the tool-layer `maxResults` bound is enforced by the seam regardless of provider.

### KV Cache effect

None. Search results enter the conversation as ordinary tool results; this package contributes no prompt sections and changes no request prefix.

## Development

```sh
npm install
npm run build
npm test                      # keyless: loopback double asserts wire shape and error taxonomy
TAVILY_API_KEY=tvly-... npm test   # adds the live smoke (self-skips without the key)
```

Keyless tests drive the real provider against a loopback HTTP double and assert the exact request shape (method, path, bearer header, user-agent, body fields), response mapping, the error taxonomy, and cancellation. The live smoke verifies the wire contract against the real API and self-skips without a key; it last passed against the live Tavily API at v0.1.1 (2026-08).

## Known Limitations and Deferred Work

- **The Tavily wire contract is pinned to its 2026-08 public documentation.** Field names (`search_depth`, `include_answer`, `max_results`) are this package's responsibility to track; the live smoke is the drift detector, last green against the live API at v0.1.1.
- **`include_domains` / `exclude_domains` / `days` are not exposed.** The seam's request carries only `query` and `maxResults` today; domain filtering would be provider config rather than a per-call control, and no consumer has asked for it yet.
- **No retry policy.** A transient Tavily failure surfaces as one `WEB_PROVIDER_ERROR`; retrying is left to the caller or a future seam-level policy, matching the in-tree providers.
- **dsh is in developer preview.** This package pins `@deepseek-ai/dsh-web` to the currently published pre-release; expect lockstep bumps while upstream iterates.

## License

MIT
