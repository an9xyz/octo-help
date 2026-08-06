# 调研 + 实测：用 Octo 官方接口替代 DOM/React 反查

调研对象：上游前端 [Mininglamp-OSS/octo-web](https://github.com/Mininglamp-OSS/octo-web) `main`。
**所有接口都在 `im.deepminer.com.cn` 的真实登录环境里实测过**（2026-08-06，ego-browser），
下文的状态码、耗时、响应体都是实际抓到的，不是推断。

---

## 0. 实测结论

| 问题 | 实测结果 |
| --- | --- |
| 鉴权是 Cookie 吗？ | **不是。** 不带 `token` 头 → `401 err.shared.auth.token_missing`。background 里 fetch 拿不到 token，方案不成立 |
| 群成员能拿到吗？ | **能。** `GET /api/v1/groups/{id}/membersync?version=0&limit=N` → 200，71 人 / 30 ms，不需要 `X-Space-Id` |
| 快捷 @ 可行吗？ | **可行，已实现并在真实页面点通**：点头像 → 编辑器出现 `<span data-type="mention" data-id="…">@许建文</span>`，与 Octo 自己的 @ 下拉产物完全一致 |
| 撤回原文能从接口拿吗？ | **不能。后端已把撤回消息的 payload 清空**：正常消息 `payload.content` 完整，撤回消息只剩 `payload: {"type":1}`。这条路是死的，任何客户端方案都拿不到 —— 撤回功能因此**整体下线**（§5） |

---

## 1. 鉴权：token 请求头（实测）

```
GET /api/v1/groups/<id>/membersync?version=0&limit=5     （不带 token）
→ 401 {"error":{"code":"err.shared.auth.token_missing","message":"token不能为空，请先登录！"}}
```

token 的位置（octo-web `App.tsx:551` + `StorageService.tsx:2`，实测一致）：

- `sid = sessionStorage["octo.session.sid"]` → 实测 `"h49ods"`
- `token = sessionStorage["token"+sid]`，并镜像到 `localStorage["token"+sid]`
- **实测这台机器的 localStorage 里有 3 个 `token<sid>`**（`tokenh49ods` / `tokenu8h1fw` / `tokena05pk4`）
  —— 多账号并存是真事，必须按本标签页的 sid 取，否则会用错身份。

所以请求只能发在**能读到页面 storage 的上下文**里。我们发在 MAIN world：同源相对 URL、
无 CORS、无需 host 权限，token 不跨上下文传递，也不落扩展存储、不打日志。

## 2. 群成员（实测）

```
GET /api/v1/groups/75bcaf3a886f4b989cc4268b93586a17/membersync?version=0&limit=10000
→ 200, 35 条, ~30ms
{ uid, name, remark, role, version, is_deleted, status, robot, bot_admin,
  is_external, source_space_id, home_space_name,
  realname_verified: true, real_name: "余嘉伟", … }
```

**「35 条」不等于「35 人」——这里曾经让我们误以为接口少拿了人：**

| 数据源 | 数量 |
| --- | --- |
| `membersync?version=0&limit=10000` 原始记录 | 35（其中 11 条 `is_deleted: 1`，已退群） |
| 过滤 `is_deleted` 后 | **24**（其中 15 个 AI、9 个真人） |
| `groups/{id}/members?limit=200&page=1`（后端已过滤退群） | **24** |
| 页面「聊天信息（24）」/「查看全部 24 名成员」 | **24** |

退群记录随同步下发是设计使然：增量同步靠它才知道「这个人走了」。所以客户端必须自己过滤，
过滤后的数字与页面完全一致。`limit` 对齐上游的 10000（`syncSubscribersCallback`），
所以「全部成员」在这里和在 app 里是同一个意思。

上游的两条取数路径（均已实测）：

- SDK 全量/增量：`groups/{id}/membersync?version={v}&limit=10000` —— 含退群记录，供本地合并
- 成员面板：`groups/{id}/members?keyword=&limit=&page=` —— 后端已过滤，适合纯展示/搜索

- **增量有效**：把 `version` 换成响应里的最大 version（实测 1175121）→ 返回 `[]`。刷新几乎免费。
- **不需要 `X-Space-Id`**：群 ID 自带 space 归属。
- **非本群 → 400（内层 403）**：`{"error":{"code":"err.server.group.view_forbidden","http_status":403},"status":400}`
  —— 注意外层状态码是 400，按外层判断会当成"请求错误"无限重试。
- 实测这个群 24 人里 **15 个是 AI**，所以「过滤已退群」「真人排在 bot 前」不是洁癖，
  否则头像条一眼过去全是机器人。
- 展示名优先级照抄上游：**real_name(已实名) → remark → name**；`realname_verified` 实测是布尔
  `true`，但上游代码兼容 `1/"1"/"true"`，我们也兼容。

## 3. 当前是哪个会话（实测）

- 上游 `main` 有 `data-conversation-channel-id/-type`，但**当前部署的构建还没有**（实测读到 `{}`）。
- **可用的替代：选中的会话行 `.wk-conversationlist-item-selected` 里的头像 `<img src>`**
  → `/api/v1/groups/<groupId>/avatar`（1:1 是 `/users/<uid>/avatar`）。纯属性，无框架内部结构。
  子区的会话行头像本来就指向**父群**，而子区成员就是父群成员 —— 正好是成员接口要的 ID。
- 兜底才用 fiber（实测从 `.wk-conversation-content` 往上第 4 层拿到
  `channel = { channelID: "bc0145…____2048765652532989952", channelType: 5 }`）。
- 消息行 `data-message-seq` 在当前部署里**是有的**（实测 31941 等）。
- 最近发言者也能从行内头像 `/users/<uid>/avatar` 反出 uid —— 这是 DOM 里唯一还留着**发送者身份**
  （而不只是名字）的地方，用来排序头像条。

## 4. 快捷 @：一个坑 + 一个意外收获

**坑**：mention 不是文本。上游发送时把编辑器序列化成 `@[uid:label]` 再解析，
且广播哨兵（@所有人/@所有AI）只认「节点来源」的信任标记（octo-web#330 的安全修复）。
所以往输入框插一段 `@张三` 文本，**看起来对，实际没人收到提醒**。

**意外收获**：Tiptap 把 editor 实例挂在自己的 DOM 元素上 —— `.ProseMirror` 有个 own property
`editor`（实测 `Object.keys(pm)` → `["pmViewDesc","editor"]`）。于是可以直接调用上游「@TA」
菜单调的同一个命令，**完全不碰 React**：

```js
pm.editor.chain().focus()
  .insertContent({ type: 'mention', attrs: { id: uid, label } })
  .insertContent(' ').run()
```

实测产物：

```html
<span data-type="mention" class="mention" data-id="ada105087fbe4725ab11eda250407497"
      data-label="许建文" data-mention-suggestion-char="@" contenteditable="false">@许建文</span>
```

与从 Octo 自己下拉里选出来的一模一样。拿不到这个 handle 时**一律不插入**（fail closed）：
假 @ 比没有功能更糟，用户会以为已经通知到人了。

## 5. 撤回原文：接口是死路 → 功能已整体下线

`POST /api/v1/message/channel/sync` 对正常消息返回完整正文：

```json
{ "message_seq": 5128, "revoke": 0,
  "payload": { "type": 1, "content": "@🌙 Octo 发车员 // Lucy 你来同步操作下 app octo-drive-prod",
               "mention": { "uids": ["octo_666_bot"], "entities": [{ "offset":0,"length":20,"uid":"octo_666_bot" }] } } }
```

对**撤回**消息只返回空壳（扫了 3 个群 800 条，命中的 6 条全都一样；图片同理，`{"type":2}`）：

```json
{ "message_seq": 5130, "revoke": 1, "is_deleted": 0,
  "revoker": "11be65096f214886b69ef9d8fcfa5c55",
  "payload": { "type": 1 } }
```

于是原文的唯一来源，是那条消息当初正常送达时进入页面内存的那一份。推论链：

1. 接口拿不到 → 只能读页面内存 → 前提是**那条消息在这个页面里渲染过**（会话正开着即可，人不必在）。
2. 你当时在别的会话、或浏览器没开 → 页面内存里从来没有过它 → **谁都还原不出来**。
3. 想突破 2，只能在消息还正常显示时把正文**提前存到本地**。这一版实现过（DOM 取文本、
   `channelId:messageSeq` 为键、滚动窗口、独立开关），但它只多覆盖「看过 → 刷新 → 之后才被撤回」
   这一窄场景，代价却是整个插件唯一把他人消息正文写入磁盘的地方。**移除。**
4. 剩下的能力（「只有会话开着时才有效」）无法向用户讲清楚，也正好错过人们想用它的时刻
   （**我当时没看到**）。因此**撤回功能整体下线**，相关代码全部删除。

留在这里的只是结论，避免以后有人再走一遍：**撤回原文在服务端已被清除，客户端没有任何补救办法**。

## 6. 这次实际改了什么

| 位置 | 之前 | 现在 |
| --- | --- | --- |
| `utils/octoApi.ts`（新） | — | 只读 API 客户端：sid/token 解析、`/api/v1/` 拼接（拒绝绝对 URL）、超时、错误分类（`isAuthError` / `isForbidden` 认内层 403） |
| `utils/octoMembers.ts`（新） | — | 成员接口 + 缓存（TTL 5 分钟、version 增量、并发去重）、展示名规则、排序（被 @ 频率 → 最近发言 → 人 → 群主/管理 → 拼音）|
| `utils/octoMentionTargets.ts`（新） | — | 从会话历史的 `payload.mention.uids` 统计「谁最常被 @」（全群都算、自己发的双倍、越近权重越高），供头像条排序 |
| `utils/octoChannelContext.ts`（新） | — | 当前会话解析：data 属性 → 选中会话行头像 → fiber 三级兜底；子区归并到父群；最近发言者 uid |
| `utils/octoMention.ts`（新） | — | `.ProseMirror.editor` → 插入真 mention 节点，拿不到就返回 false |
| `utils/octoMentionBar.ts`（新） | — | 头像条 UI：挂在 `.wk-messageinput-card` 底部，跟随「舒适输入框」开关，会话切换/React 重渲染自动重挂，切走时丢弃过期结果 |
| `octo-main-world.ts` | 撤回还原（Fiber 反查 + 克隆气泡 + 自有样式 + 自己的开关，约 450 行）| **整体删除**（§5）；`utils/octoRecall.ts` 随之更名 `utils/octoShared.ts` |
| `utils/octoSelectors.ts` | — | 新增 `conversationMessages` / `conversationListSelected` / `composerEditor`，并把「快捷 @ 群成员」纳入兼容自检 |

## 7. 还没做 / 已知边界

1. **`@所有人 / @所有AI`** 没做。它们的哨兵 uid（`-1/-2/-3` 一族）只有"节点来源"才被后端路由，
   技术上可行（我们走的就是节点路径），但常量定义在上游 `Utils/mentionRender.ts`，抄错会变成
   "看起来 @ 了全群但没人收到"。要做就得先把那几个常量核对清楚。
2. **超大群**：`membersync` 取 `limit=10000`（与上游一致），头像条默认**渲染全部存活成员**
   （横向可滚动），仅保留 200 个节点的 DOM 保护上限；超过部分的 uid 查名会落空并退回旧逻辑
   （不会显示错名字）。
3. **搜索**：头像条本身没有关键字过滤（要搜人时，Octo 自己的 `@` 下拉仍然可用；
   如果要做，`groups/{id}/members?keyword=` 已经实测可用）。
4. **兼容自检**：`composerEditor` 已进自检；接口层的 401/403 目前只是静默降级，
   还没接进设置页的「哪项能力不可用」提示。

## 8. 复现用脚本（真实登录页面控制台，只读）

```js
(async () => {
  const sid = sessionStorage.getItem('octo.session.sid') || '';
  const token = sessionStorage.getItem('token' + sid) || localStorage.getItem('token' + sid);
  const sel = document.querySelector('.wk-conversationlist-item-selected');
  const src = [...(sel?.querySelectorAll('img') || [])].map((i) => i.getAttribute('src'))
    .find((s) => /\/groups\/[^/]+\/avatar/.test(s || ''));
  const group = /\/groups\/([^/?#]+)\/avatar/.exec(src || '')?.[1];
  const members = await fetch(`/api/v1/groups/${group}/membersync?version=0&limit=50`, { headers: { token } })
    .then((r) => (console.log('membersync', r.status), r.json()));
  console.log('group', group, 'members', members.length, members[0]);

  // 撤回消息的 payload 是否被清空
  const body = { channel_id: group, channel_type: 2, start_message_seq: 0, end_message_seq: 0, pull_mode: 0, limit: 100 };
  const page = await fetch('/api/v1/message/channel/sync', {
    method: 'POST', headers: { token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json());
  console.table((page.messages || []).filter((m) => m.revoke === 1 || m.message_extra?.revoke === 1)
    .map((m) => ({ seq: m.message_seq, type: m.payload?.type, hasContent: !!m.payload?.content })));

  // 编辑器 handle
  console.log('editor?', !!document.querySelector('.wk-messageinput-editor .ProseMirror')?.editor);
})();
```
