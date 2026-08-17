# Spec：网页划词剪存到 Octo 文档

在**任意网页**选中一段文字，一键把它（连同来源标题/链接）追加写进用户指定的 Octo 文档里。

本文件只做规划，不含实现。技术事实来自上游 `Mininglamp-OSS/octo-cli` 的
`internal/registry/specs/docs.json` 与 `internal/client/client.go`（已核对，见 §2）。
带「⚠️ 待实测」的点必须在真实环境跑通后才能定稿。

---

## 1. 目标与非目标

**做：**
- 任意页面选中文本 → 触发「剪存到 Octo」 → 追加到一个**固定的目标文档**末尾。
- 每条剪存带：正文（选中文本）+ 来源（页面标题、URL）+ 时间。
- 结果反馈：成功/失败提示（含"文档打不开/无权限/token 失效"这类可操作的错误）。

**不做（本期）：**
- 富文本/图片/表格剪存 —— MVP 只存**纯文本**（`selectionText`，见 §5）。
- 选中即浮现的自定义按钮 UI —— MVP 用**右键菜单**，不往每个页面注入内容脚本（§4）。
- 多目标文档/自动分类 —— 只有一个目标文档，用户在设置里选定。

---

## 2. 为什么走 Bot REST API（而不是复用网页 token）

现有 `utils/octoApi.ts` 是**只读**客户端，刻意不做任何写操作，且用的是网页版的
`token` 请求头 + 页面 storage 里的会话 token（`docs/research-octo-api.md`）。文档**正文**
的实时编辑在网页侧走 Yjs websocket，不是简单 REST —— 复用这条路成本高。

改用 **Bot REST API**（用户在设置里自己填 bot token），这是 octo-cli 用的同一套接口，
**有现成的 REST 正文增量编辑端点**：

| 事实 | 出处（已核对） |
| --- | --- |
| 鉴权是 `Authorization: Bearer <token>` 头 | `client.go:954` |
| Base URL 用 `OCTO_API_BASE_URL`，路径形如 `/v1/bot/docs/...` | `docs.json` `x-octo-base-url` |
| Token 形态：`bf_`=User Bot、`app_`=App Bot、`uk_`=user key | `internal/credential/token.go` |
| 读正文：`GET /v1/bot/docs/{docId}/content` → `{doc, schemaVersion, baseVersion}` | `docs.json:298` |
| 写正文：`PATCH /v1/bot/docs/{docId}/content`，`If-Match: <baseVersion>`，body `{ops:[...]}` | `docs.json:327` |
| 只支持 `doc_type=doc`（board/sheet 返回 409） | 同上 description |
| 乐观并发：body 变了返回 `412 base_version_stale` | 同上 |

其它可能用到的端点：`POST /v1/bot/docs`（建文档，返回 `docId`）、
`GET /v1/bot/docs`（列出 bot 可见文档，供设置页选目标）、
`POST /v1/bot/docs/search`（按关键词找文档）。

---

## 3. 写入流程（核心）

追加一条剪存 = 一次「读—改—写」，带乐观并发重试：

```
1. GET  /v1/bot/docs/{docId}/content          → { doc, baseVersion }
2. 构造 insert op：把剪存块追加到 doc 根节点末尾
3. PATCH /v1/bot/docs/{docId}/content
        If-Match: baseVersion
        body: { ops: [ <insert op> ] }
   ├─ 200 → 成功，拿到新 baseVersion
   └─ 412 base_version_stale → 回到 1 重读，重试（上限 3 次；仍失败则报错）
```

**追加用的 op**（形状来自 `docs.json:352` 的 op 说明）：

```jsonc
{
  "type": "insert",
  "at": { "path": [], "position": "inside_end" },   // ⚠️ 待实测：path:[] 指根节点、inside_end=追加为最后子节点
  "content": [ /* 一或多个 ProseMirror 块节点 */ ]
}
```

**剪存块的内容**（ProseMirror 块节点）—— 节点/标记名 ⚠️ **待实测**：必须先对真实文档跑一次
`docs content get`，照抄它的 schema（`paragraph` / `text` / `link` mark 等确切命名），
不能凭空猜。示意：

```jsonc
[
  { "type": "paragraph", "content": [
      { "type": "text", "text": "<选中的文本>" } ] },
  { "type": "paragraph", "content": [
      { "type": "text", "text": "来源：<页面标题> ",
        "marks": [] },
      { "type": "text", "text": "<url>",
        "marks": [ { "type": "link", "attrs": { "href": "<url>" } } ] },
      { "type": "text", "text": "  ·  2026-01-01 12:00" } ] }
]
```

op 构造是一个**纯函数** `buildClipOps(text, url, title, now)`，好单测（§9）。

**闸门**（`docs.json:337` 已列出，构造时就要防）：单次 op 数、单 op 内容大小、
路径深度、body 形状 —— 我们只追加一个浅层块，天然不触顶；但选中文本要**截断**到合理上限
（如 20 KB）避免 `413 op_content_too_large`。

---

## 4. 扩展内架构

Bot token 存在扩展存储里 → **后台 service worker 直接调 REST**（`host_permissions`
绕过 CORS）。好处：**任意页面都能用，不需要开着 Octo 标签页**，也不碰页面 storage。

```
右键菜单「剪存到 Octo」(选中文本时出现)
        │  contextMenus.onClicked  { selectionText, pageUrl, pageTitle }
        ▼
background.ts
  ├─ 读设置：botToken / apiBaseUrl / targetDocId
  ├─ 未配置 → 打开设置页(side panel)提示先配置
  ├─ clipToDoc(): GET content → buildClipOps → PATCH content（412 重试）
  └─ 结果 → chrome.notifications / badge 反馈
```

- **MVP 不注入全站内容脚本**：右键菜单 `contexts:['selection']`，选中文本从
  `info.selectionText` 拿，页面标题/URL 从 `tab` 拿。零页面侵入。
- 现有 `background.ts` 已有 `onMessage`/`commands`/`omnibox` 监听，剪存的
  `contextMenus.onClicked` 与 `clipToDoc()` 加在同一处即可，不新增 entrypoint。
- 网络层新写 `utils/octoDocsApi.ts`（Bot REST 客户端：Bearer 头、base URL 拼接、
  `contentGet`/`contentEdit`、错误分类），与只读的 `octoApi.ts` 分开——两者鉴权方式和
  信任边界不同，不要混。

**后续增强（非本期）**：选中即浮现「剪存」小按钮，需要全站内容脚本 + `<all_urls>`；
届时再评估权限与隐私说明。

---

## 5. 数据来源与限制

- `info.selectionText` 是**纯文本**，会折叠部分空白、丢失富格式和图片 —— MVP 接受这个损失。
- 超长选区**截断**到上限（默认 20 KB），末尾加「…（已截断）」。
- 空白/纯空格选区：不触发（菜单在有选区时才出现，二次校验 trim 后非空）。

---

## 6. 设置项（side panel）

新增一个「剪存」功能卡（沿用 `FeatureSection` 模式），写入 `storage.local`：

| key | 含义 | 默认 |
| --- | --- | --- |
| `octoClipEnabled` | 功能开关 | 关（需用户显式开启并配置） |
| `octoClipBotToken` | Bot token（`bf_`/`app_`/`uk_`） | 空 |
| `octoApiBaseUrl` | API 根地址 | `https://im.deepminer.com.cn` |
| `octoClipDocId` | 目标文档 docId | 空 |

- 设置页可提供「测试连接」：调一次 `GET /v1/bot/docs/{docId}/content`，把 401/403/404
  翻译成人话（token 失效 / bot 无此文档权限 / 文档不存在）。
- 目标文档可选「新建」：调 `POST /v1/bot/docs {title}` 拿 `docId` 回填。
- token 是敏感项：输入框用 password 类型，展示时打码（参考 octo-cli `MaskToken`）。

---

## 7. 权限变更（`wxt.config.ts` manifest）

| 权限 | 用途 | 说明 |
| --- | --- | --- |
| `contextMenus` | 右键「剪存到 Octo」 | 新增 |
| `notifications` | 成功/失败提示 | 新增（或改用 badge，见 §8） |
| host：API base 域名 | 后台跨域 `fetch` bot API | base URL **可配置** → 见下 |

**host 权限两难**（base URL 用户可改）：
- 方案 A（省事）：固定 `https://im.deepminer.com.cn/*`，与现有 `OCTO_MATCHES` 同域，
  已在 host_permissions 里 → **零新增 host 权限**。base URL 设置项仅供自建部署的高级用户，
  非默认域名时用 `optional_host_permissions` 运行时申请。
- 方案 B：直接申请 `<all_urls>` host —— 过宽，不采。

**采方案 A**：默认域名零新增权限；改地址的用户走 optional 权限申请。

---

## 8. 反馈与错误处理

失败必须能让用户**下一步做对**，不能只 toast「失败」：

| 情况 | 判定 | 提示 |
| --- | --- | --- |
| 未配置 | token/docId 为空 | 打开设置页，引导填写 |
| token 失效 | 401 | 「Bot token 无效或过期，请在设置里更新」 |
| 无权限 | 403 | 「该 Bot 不是此文档的可写成员」+ 如何加成员 |
| 文档不存在/类型不符 | 404 / 409 | 「目标文档不存在或不是普通文档（doc）」 |
| 并发冲突重试仍失败 | 412×3 | 「文档正被频繁编辑，请稍后重试」 |
| 网络/网关 | fetch 失败 / 5xx | 「网络异常，稍后重试」 |

反馈载体：优先 `chrome.notifications`；若不想加权限，用 action badge（"✓"/"!" 几秒）。

---

## 9. 测试计划（vitest，沿用仓库约定）

- `utils/octoDocsApi.test.ts`：注入 `fetchImpl`，验证 Bearer 头、base URL 拼接、
  412 重试逻辑、错误分类（401/403/404/409/412）。
- `octoDocsClipOps.test.ts`：`buildClipOps()` 纯函数——正常文本、超长截断、
  URL 转 link mark、空选区拒绝、特殊字符不破坏 JSON。
- 后台 `contextMenus.onClicked` 处理：用现有测试风格 stub `browser.*`，
  验证「未配置→开设置」「配置齐→调 clipToDoc」分支。

---

## 10. 安全与隐私

- **Bot token 是账号级 bearer 凭证，且会持久化到 `storage.local`（明文，仅扩展沙箱内可读）。**
  这与现有只读设计「token 绝不落盘」（research-octo-api.md §1）是**有意的相反取舍**，
  由用户主动填写并知情。缓解：
  - 建议用**专用 Bot**、最小权限（仅作为目标文档的 writer 成员），别用主账号 token。
  - token 只发往配置的 API 域名（同 `octoApi.ts` 的绝对 URL 防护，拒绝把 token 发去别处）。
  - 设置页明示「此 token 保存在本机浏览器扩展存储中」。
- 剪存内容是用户主动选中并主动触发的，不做任何自动/后台抓取。

---

## 11. 开放问题（定稿前必须实测）

1. ⚠️ `insert` op 用 `path:[]` + `position:"inside_end"` 追加到文档末尾是否成立？
   备选：`path:[lastIndex]` + `position:"after"`（lastIndex 从 `content get` 的 `doc.content.length-1` 算）。
2. ⚠️ 真实文档的 ProseMirror schema：`paragraph`/`text`/`link` 的确切节点名与 `link` mark 的
   `attrs` 结构 —— 跑一次 `docs content get` 照抄。
3. Bot 加入目标文档为 writer 的路径：`docs members set` 还是网页 UI？设置页要给指引。
4. base URL 非默认域名时 optional host 权限申请的时机与失败兜底。
5. `app_`（App Bot）token 是否能写用户文档，或必须 `bf_`（User Bot）？octo-cli 对 message search
   拒 `app_`，docs 写入的限制待测。

---

## 12. 里程碑

1. `utils/octoDocsApi.ts` + `buildClipOps` + 单测（不碰 UI，可独立验证）。
2. 后台 `contextMenus` + `clipToDoc()` 接线；badge/notification 反馈。
3. side panel 剪存设置卡（token/baseUrl/docId/开关 + 测试连接 + 新建文档）。
4. 权限：`contextMenus`（+ notifications），optional host。
5. 真实环境跑通 §11 的实测点，回填 schema 与 op 形状，定稿。
</content>
</invoke>
