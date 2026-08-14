# dsh-plugin-web-search-tavily

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的社区 [Tavily](https://tavily.com) 搜索 provider。它向 `ctx.web` 能力接缝注册一个 `WebSearchProvider`，让自带的 `web_search` 工具由 Tavily 提供服务，而不触碰任何模型面 schema。

以 **dsh bundle** 形式分发：装进 profile 时自动插入插件行。

## 安装

```sh
dsh plugin --profile web add dsh-plugin-web-search-tavily
```

API key 经环境变量提供（`TAVILY_API_KEY`，可放在 `$DSH_HOME/.env`），或写进插件配置。当组合里有多个可用搜索 provider 时，用 `$DSH_WEB_SEARCH_PROVIDER=tavily` 或在 profile 的 `cordis.patch.yml` 里给 `web` 行钉 `searchProvider` 来指定选择；Tavily 是唯一可用 provider 时自动选中。

先不启动验证组合，再启动：

```sh
dsh --profile web --dump-config   # 应出现 "# == dsh-plugin-web-search-tavily" 层
dsh --profile web
```

## 配置

在 profile 的 `cordis.patch.yml` 里 patch `web-search-tavily` 行即可覆盖任意字段（patch 替换整个 `config` 值——保留的字段要重述）：

| 键 | 默认 | 含义 |
|---|---|---|
| `apiKey` | `$TAVILY_API_KEY` | Tavily API key。为空时 provider 注册但不可用。 |
| `baseURL` | `https://api.tavily.com` | 端点基址；`/search` 由本包追加。 |
| `searchDepth` | `basic` | Tavily 的 `search_depth`。`advanced` 返回更丰富的摘要，额外计费。 |
| `topic` | `general` | Tavily 的 `topic` 垂直类目（`general` 或 `news`；`news` 会填充 `publishedAt`）。 |
| `includeAnswer` | `true` | 请求 Tavily 生成的答案；作为搜索结果的 `content` 呈现。 |
| `numResults` | *（缺省）* | 请求未携带 `maxResults` 时的默认结果数。工具层上界始终由接缝强制执行。 |

```yaml
- id: web-search-tavily
  config:
    searchDepth: advanced
    includeAnswer: false
```

## 行为

- `POST {baseURL}/search`，携带 `Authorization: Bearer <key>`，尊重请求的 `AbortSignal`；拒绝重定向。
- `results[].content` 映射为 `snippet`，`published_date` 映射为 `publishedAt`；没有非空摘要的条目被丢弃，而不是用编造的文本填充。
- 非空 `answer` 映射为结果的 `content`；Tavily 未返回时不虚构任何内容。
- 取消以 `WebError` 代码 `WEB_ABORTED` 呈现；其余失败（传输、非 2xx、不可解析响应体）为 `WEB_PROVIDER_ERROR`，携带可得的最丰富 provider 细节并保留 `cause` 链。非 2xx JSON 错误体按 `detail.error` / `detail` / `error` / `message` 顺序取信息。
- `available()` 是廉价的本地检查（key 存在、基址可解析、界合法），永不触网。

## Model Experience

### What the model sees

本包不直接向模型呈现任何内容。模型面的 `web_search` schema 与渲染属于 `@deepseek-ai/dsh-tool-web`；本 provider 只改变服务该调用的后端。结果的 `content`（启用时为 Tavily 生成的答案）与逐来源的 `title`/`snippet`/`publishedAt` 经工具的常规渲染流入对话。

### Token effect

`includeAnswer: true` 给模型读到的每次搜索结果增加一段 provider 生成的答案。`searchDepth: advanced` 倾向于返回更长的摘要。两者都是 provider 输出侧的效果；工具层的 `maxResults` 上界无论 provider 为谁都由接缝强制执行。

### KV Cache effect

无。搜索结果作为普通工具结果进入对话；本包不贡献 prompt 段落，不改变任何请求前缀。

## 开发

```sh
npm install
npm run build
npm test                      # 无 key：回环替身断言线上形状与错误分类
TAVILY_API_KEY=tvly-... npm test   # 追加真机冒烟（无 key 自跳过）
```

无 key 测试用回环 HTTP 替身驱动真 provider，断言精确的请求形状（方法、路径、bearer 头、user-agent、body 字段）、响应映射、错误分类与取消。真机冒烟对真实 API 验证线上契约，无 key 自跳过；v0.1.1（2026-08）已对真实 Tavily API 验证通过。

## Known Limitations and Deferred Work

- **Tavily 线上契约钉在其 2026-08 公开文档。** 字段名（`search_depth`、`include_answer`、`max_results`）由本包负责跟踪；真机冒烟是漂移探测器，v0.1.1 已对真实 API 验证为绿。
- **未暴露 `include_domains` / `exclude_domains` / `days`。** 接缝的请求今天只携带 `query` 与 `maxResults`；域名过滤应是 provider 配置而非逐调用控制，且尚无消费者提出需求。
- **无重试策略。** 瞬态 Tavily 失败呈现为一次 `WEB_PROVIDER_ERROR`；重试留给调用方或未来的接缝级策略，与树内 provider 一致。
- **dsh 处于 developer preview。** 本包钉在当前发布的预发布版 `@deepseek-ai/dsh-web` 上；上游迭代期间预期需要跟随升版。

## License

MIT
