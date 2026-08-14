# Octo 聊天增强

一个增强 Octo（`im.deepminer.com.cn`）网页版聊天体验的浏览器扩展（WXT + React）：把界面换成自己喜欢的样子，把每天要做几十次的操作变快。

- **消息美化 + 换肤** —— 三档气泡配色（AI / 自己 / 他人）、自己的头像略大且 hover 会越转越快、折叠会话自动展开、消息中的 `$...$` / `$$...$$` LaTeX 公式渲染、长消息限高「展开全文」、暗色适配，以及可切换的消息主题。
- **舒适输入框 + 选区格式 + 快捷 @** —— 默认三行编辑空间，工具栏移到右下角，保留 Octo 原生的附件、快捷键和全屏展开；选中文本会出现 Discord 式格式条，点击可插入粗体、斜体、删除线、引用、行内代码或代码块，不必手打 Markdown；常用的粗体和斜体也支持 `Ctrl/Cmd+B`、`Ctrl/Cmd+I`。底部多 5 个群成员头像，点一下就 @ 他。头像按「这个会话里谁被 @ 得最多」排序（常被 @ 的 AI 会排最前），插入的是真 mention，对方会收到提醒。
- **全站主题 + 世界杯特效** —— 可切换导航、会话和输入区配色，提供足球射门动画与梅西、姆巴佩水印。
- **GitHub 快捷入口** —— 自动识别消息中的仓库、Issue、PR、Commit、Action、Release 和文件链接，在消息旁提供准确跳转；PR/Issue 编号后即使直接粘着文字也不会把文字带进 URL。
- **会话列表整理** —— 插件内独立的「会话列表」Tab 统一管理重要性排序、行精简与折叠；插件不接管 Octo 官方置顶能力。「折叠的会话」入口显示名称摘要、数量和未读状态，点开后折叠项以缩进和分组底色展开，可查看、进入或逐条恢复，状态按账号和 Space 本地保存。
- **Bot 资料卡「全息卡牌」+ 开卡抽卡** —— 把 Bot 资料卡改成 synthwave 落日 banner + 悬浮圆头像 + 信息合并大框 + 创建者置底署名，随鼠标 3D 倾斜；每次打开还会随机抽一个稀有度（宝可梦式档位 N/R/SR/SSR/UR，越稀越少），据此渲染金箔全息卡框、稀有度角标与高档辉光脉动，SR 及以上播放全屏揭晓特效。
- **输入框宠物** —— 内置蚂蚁、蜗牛、巫师和僵尸四种巡游宠物，输入或收到新消息时在输入框上沿活动；也可导入 `.zip` / `.codex-pet.zip` 自定义宠物。
- **新消息气泡** —— 桌宠启用时，当前页面收到他人的新消息会显示 5 秒短气泡；内容只在本地内存中处理，不持久化。
- **统一的开关面板** —— 侧边栏里每项功能都是同一种形态：一行状态 + 自己的开关，细节折叠起来，展开一项自动收起其它项。

所有功能都在浏览器本地处理，不改动 Octo 源码，不会上传宠物包，也**不会把任何聊天内容写入磁盘或发往任何第三方**。

## 原理

- **快捷 @ 群成员**：输入框底部 5 个头像，点一下即 @。排序不靠猜 —— 用 `message/channel/sync` 读这个会话历史里的 `payload.mention.uids`，统计谁被 @ 得最多（全群都算，自己发的双倍，越近权重越高，实测某群 top1 被 @ 19 次 / 200 条），无需学习期也不落盘；群成员名册来自 Octo 自己的成员接口 `GET /api/v1/groups/{id}/membersync`（鉴权是 `token` 请求头，取自页面 `sessionStorage["token"+sid]`；请求发在 MAIN world，同源、只读、凭证不出标签页）。插入的是**真 mention 节点** —— Tiptap 把编辑器实例挂在 `.ProseMirror` 元素的 `editor` 属性上，我们调用与 Octo「@TA」相同的 `insertContent({type:'mention',attrs:{id,label}})`；拿不到这个实例就不插入，绝不用纯文本假冒 @（那样收不到提醒）。
- **每个功能一个开关**：美化引擎也有了自己的开关键 `octoBeautifyEnabled`（缺省为开）。关闭时 MAIN world 会 `teardownBeautify()`，并丢弃主题/射门/球星/鼠标这一族设置消息（它们都在驱动已经拆掉的引擎）；重新打开时内容脚本会重放整族设置，和总开关的处理方式一致。
- **换肤**：主题模型 `base`→`body[theme-mode]`（亮/暗，联动 app 原生暗色）、`skin`→`body[data-octo-skin]`（消息皮肤）。样式由注入的大段 CSS 按这两个属性切换；Side Panel 选中的主题存 `browser.storage.local`，经内容脚本转发到 MAIN world 应用。有 `MutationObserver` 在 app 启动强制亮色时「重申」所选主题（带自写抑制 + 去抖，避免与 app 抢属性打死循环）。
- **开卡抽卡**：Bot 资料卡弹窗挂载时，美化引擎的 `sync()` 按加权概率 `Math.random()` 抽一个稀有度，写到 `.wk-modal-shell` / `.wk-bot-detail-content` 的 `data-octo-rarity` 上——卡框配色、角标文字（`content: attr(...)`）、辉光强度全部由 CSS 据此渲染。抽卡是「每个卡片实例一次」：同一弹窗重渲染沿用已抽结果，关闭重开则是新实例、重新抽。揭晓特效节点注入 `<body>`（在弹窗 React 树之外，避免被 reconcile 清掉），播完自移除。只读随机 + 自身属性写入，不改源码、不改 React 状态。
- **桌面宠物**：Side Panel 使用 JSZip 本地校验并解压宠物包，把 manifest 与 spritesheet data URL 存入 `browser.storage.local`；内容脚本把状态转发到 MAIN world，页面脚本按 manifest 播放动作状态机，并把拖拽位置回写 storage。Codex v1 `8 × 9` 与 v2 `8 × 11` atlas 使用官方动作行和逐帧时长；无动画配置的旧 Octo 包仍按 `12 × 13` 第一行播放。
- **输入区增强**：舒适模式通过 scoped CSS 调整 Octo 的 `.wk-messageinput-*` 布局；选区格式条只监听选区变化，并通过页面已有 Tiptap 事务写入文本节点，绝不改写 ProseMirror DOM。包含真 mention 或附件的选区会拒绝转换，避免把结构化节点降级成纯文本；宠物输入框模式用 `ResizeObserver`、滚动监听和批量定位跟随当前会话输入框。
- **会话列表按重要性排序**：整个功能是一张样式表，**没有 JS 逻辑、没有 MutationObserver、不动 DOM**。因为 Octo 自己已经把需要的信号渲染成了 class：它对「群里 @我」和「私聊有未读」输出同一个 `.wk-mention`（渲染条件是 `hasMention || (unread && !muted)`，所以它穿透免打扰），置顶是 `-top`，免打扰（含子区继承父群）是 `-muted`。于是「谁在等我回」就是 `:has(.wk-mention)`，排序交给 CSS `order`，随 React 更新自动自愈。**想在这个文件里加 JS 前先读它的头注释** —— 盖章式的 pass 必须跟着每次渲染重跑，而它能算的东西 class 里已经有了。用 `order` 而不搬 DOM，是因为 React 每次 commit 都会重新强加自己的子节点顺序（搬进自己的分组 wrapper 更糟：`removeChild` 会对着 React 记录的父节点调用，直接抛 `NotFoundError`）。作用域用 `:has(> .wk-conversationlist-item)` 限定，恰好等价于「只在最近栏」——因为 `compact` 是整表级 prop，关注栏渲染的是 `.wk-conv-compact-item`，一个普通行都没有，所以它的拖拽排序完全不受影响。四级阶梯之间用 `:not()` 互斥而不靠层叠：`:has()` 会继承其参数的优先级，一条朴素的 mention 规则会盖过置顶规则、把预期次序反过来。
- **会话行四级精简 + 只看最近一周**：一行最多九个信号，真正回答「要不要我现在处理」的只有两个。L1 纯 CSS 删冗余装饰；L2 用 grid 把面包屑从独占一行改成标题前缀，并归并「一次子区活动占两行」（只在那行没有未读时才归并，绝不隐藏在等人处理的会话）；**L3 单行是重点 —— 预览文本就是那个「信息流」**，删掉它列表才从「推内容」变成「报状态」，未读数字同时收成圆点（99+ 和 19 导向同一个决定），时间和面包屑一起移到悬停 —— 面包屑在 L3 被删是对 L2 的有意反转：L2 的行还有内容、你本就在读它，而 L3 的一行只回答「谁在活跃」，291px 的侧边栏里前缀要吃掉近 90px 去渲染一个被截成「FT-OctoCore…」的名字，识别不了任何东西；可达性靠盖在行上的 `title`（`父群 · 名称 · 时间`，且只写没有 title 的行、并用 `data-octo-conv-title` 记住哪些是自己写的，以便降级时只收回自己的）；L4 才是父群真正回来的地方，把连续同父群折成分组表头，表头文字用 `content: attr()` 从盖的属性里取，不注入任何节点。L3 靠 `display: contents` 把第二行从布局里摘掉、让未读点落到第一行右侧 —— 这是不搬 DOM 就能跨行搬子节点的唯一办法。**一周过滤不需要时间戳**：Octo 自己的 `getTimeStringAutoShort2` 正好在 7×24 小时处切换格式，判据是「时间文字含 4 位连续数字」（不用斜杠，因为非中文 locale 会输出 `03.08.2026`）；置顶、@我（含免打扰群里的 @我）和非免打扰未读的永不折叠，免打扰的未读堆积不买豁免，其余收进一个 `order: 9999` 的脚注（大 order 是为了在排序把容器变成 flex 后仍留在最后）。状态一律写 `data-octo-*` 属性而非 class：行的 `className` 会被 React 在每次未读/选中/免打扰翻转时整体重写。**只有 L4 与「按重要性排序」互斥**（折叠要按 DOM 顺序判断上一行，而排序只改视觉顺序），阶梯刻意这么排，好让真正管用的 L3 永远不被这个冲突禁掉。多级门控统一由 `at(levels, ...)` 生成，每条规则自带完整后代选择器——手写 `body[..='2'],body[..='3'] .item` 会因逗号退化成一个裸 `body[..='2']`，曾经因此在 L2 把整个页面 `display:none`。
- **会话折叠**：不复制 Octo 的会话列表，也不接管官方置顶规则；只给原生行盖 `data-octo-*` 属性，并在 `body` 上复用一个避开未读徽章的轻量「折叠 / 恢复」悬停操作，绝不往 React 管理的行里塞子节点。「折叠的会话」入口是紧凑的列表分组栏，显示数量和未读状态；点开后原生行以轻缩进、3px 行间距、圆角浅色行紧跟入口展开，不再使用重复的蓝色竖线；其顺序优先于“一周前自动收起”，不会再被推到列表末尾。稳定身份来自原生行的 React key（`<channelId>-<channelType>`），能保留子区完整的 `group____thread` ID；解析失败时保持可见。折叠键以 `${channelType}:${channelId}` 保存到 `browser.storage.local`，外层按页面当前 `uid + Space` 隔离。MAIN world 只发增删请求，内容脚本串行执行 storage 的读改写，避免快速连续操作互相覆盖。

美化/换肤逻辑移植自油猴脚本 [an9xyz/octo-script](https://github.com/an9xyz/octo-script)（MIT），改为由扩展 Side Panel + `browser.storage` 驱动，去掉了原脚本页面内的 NavRail 菜单。

## 结构

- `entrypoints/octo-main-world.ts` — MAIN-world 脚本：启动美化引擎、快捷 @、输入框宠物与新消息气泡、GitHub 快捷入口，并运行 DOM 兼容性自检。
- `entrypoints/octo-kick-world.ts` — 按需注入的 MAIN-world 脚本，封装 pixi.js 射门特效（见下方「体积与性能约束」）。
- `utils/octoBeautify.ts` — 美化 + 换肤引擎（主题模型 / 折叠展开 / 公式渲染 / AI 连续标记 / 限高展开 / 作用域化 sync）。
- `utils/octoBeautify.css` — 美化样式表，由 `?raw` 原文字导入（**不要**改成 `?inline`，原因见文件顶部注释）。
- `utils/octoThemeCatalog.ts` — 主题/皮肤/射门样式的纯数据目录，**零 import**。Side Panel 和内容脚本只靠它拿默认值，不用拖入引擎。
- `utils/octoSelectors.ts` — **所有 JS 侧 Octo DOM 选择器的单一来源**，兼 DOM 兼容性自检。新增选择器请加在这里。
- `utils/octoConvFold.ts` / `utils/octoConvRowKey.ts` — 手动会话折叠的页面应用、持久化消息与原生行稳定身份解析。
- `utils/octoPageFeatures.ts` — 页面侧功能登记表（总开关控制的启/停）。`stop` 必填。
- `utils/octoSettingsParsers.ts` — storage 原始值 → 设置值的纯函数解析器（含默认值与迁移规则）。
- `utils/octoSettingsRelay.ts` — `postToPage` 与变更集工具。
- `utils/octoSyncScope.ts` — mutation 分类：判定一批 DOM 变动需要哪些 pass、可限定在哪些子树。
- `utils/octoFullscreenKickLazy.ts` — pixi 射门特效的惰加载门面（签名与同步版一致）。
- `utils/octoFullscreenKickPixi.ts` — pixi.js 实现，只能由 `octo-kick-world.ts` 引入。
- `utils/octoShared.ts` — 共享常量（目标域名、storage key、postMessage 协议）。
- `utils/octoPet.ts` — 宠物包大小、路径、manifest 与图片校验及本地解析。
- `utils/octoPetState.ts` — 宠物状态校验器。兼任安全边界：页面可以伪造 postMessage，这里的校验决定伪造消息能否造成危害。
- `utils/octoPetRenderer.ts` — 桌面宠物 overlay、spritesheet 动画与拖拽交互。
- `utils/octoBuiltInCompanion.ts` — 四只内置输入框宠物的巡游、定位和消息唤醒。
- `utils/octoGithubLink.ts` — GitHub URL 边界识别、分类和消息快捷入口。
- `utils/octoComposerEnhancer.ts` — 三行舒适输入框样式、快捷 @ 头像条与选区格式条的生命周期接线。
- `utils/octoComposerFormat.ts` — 选中编辑器文本后的 Discord 式格式条：定位、可逆 Markdown 包裹、Tiptap 文本事务和安全清理。
- `utils/octoConvSort.ts` — 会话列表按重要性排序：一张样式表，无 JS 逻辑、无 observer。
- `utils/octoConvCompact.ts` — 会话行四级精简（减装饰 / 收面包屑 / 单行 / 连续折叠）+ 只看最近一周，CSS + 属性盖章。
- `utils/octoConvGroup.ts` — 精简的纯规则：父群通知行归并、连续同父群成组、一周以外判定。
- `utils/octoApi.ts` — **只读** Octo API 客户端：sid/token 解析（鉴权是 `token` 请求头，不是 cookie）、`/api/v1/` 拼接、超时、错误分类。凭证不落扩展存储、不打日志、只发同源。
- `utils/octoMembers.ts` — 群成员名册（`membersync` + TTL/增量/并发去重缓存）、展示名规则、候选排序、同步查名。
- `utils/octoMentionTargets.ts` — 从会话历史的 `payload.mention.uids` 统计「谁最常被 @」，供头像条排序。
- `utils/octoMentionBar.ts` — 输入框底部的 5 个快捷 @ 头像（渲染、会话切换重挂、点击插入）。
- `utils/octoMention.ts` — 通过 `.ProseMirror` 元素上的 Tiptap 实例插入**真 mention 节点**；拿不到实例就不插入。
- `utils/octoChannelContext.ts` — 当前会话解析（data 属性 → 选中会话行头像 → Fiber 三级兜底）与最近发言者。
- `utils/extensionIdentity.ts` — 固定的扩展 ID（Chrome `manifest.key` 公钥 + Firefox add-on id）。
- `utils/octoPetSpeech.ts` — 监听当前会话新增消息、提取短摘要、过滤自己/系统/已撤回/重复消息。
- `entrypoints/sidepanel/FeatureSection.tsx` — 「一行状态 + 独立开关 + 折叠详情」的通用外壳，每个功能都用它，开关刻意放在展开按钮之外（嵌套可交互元素既不合法，也会让「关掉」和「看设置」变成同一个点击目标）。
- `assets/player-source/` — 球星水印源图，仅供 `scripts/split-player-animation-assets.py` 使用，**不打包进扩展**。

## 体积与性能约束

这些不是建议，而是会被回归的约束：

- **pixi.js 不得进入常驻脚本**。pixi + pixi-filters 约 540 KB，只有选了球星水印的用户需要。它住在独立的 `octo-kick-world.js`，由 `octoFullscreenKickLazy` 在首次启用时请求内容脚本 `injectScript` 注入（WXT 推荐的 main-world 模式）。
- **内容脚本不得 import 美化引擎**。它只需转发设置；曾因为 import 三个默认主题常量而把整个 pixi 拖进去（231 KB 死代码）。默认值请从 `octoThemeCatalog` 取。
- **sync 的代价不得随会话长度增长**。消息相关的 pass 靠 `octoSyncScope` 限定在变动子树内；clamp 的测高读写分离并用 `WeakSet` 记忆结果。实测：3000 条消息下单条新消息的处理从 9.1 ms 降到 1.0 ms。
- **不要用 `ResizeObserver` 观察消息元素**。它对目标持强引用，会把被回收的上千条消息钉在内存里。clamp 的失效信号用的是 document 级 `load` 捕获 + window `resize`。
- **WXT 自动导入是关的**（`wxt.config.ts` 的 `imports: false`），WXT API 从 `#imports` 显式导入。自动导入扫描 `utils/` 时，会把 `setFullscreenKick*` 这组同名导出解析到 **pixi 实现**而不是懒加载门面：一旦 main-world 侧漏写一行 import，540 KB 引擎就会静默进入常驻包，而且绕过上面那条 eslint 守卫。

## 安全模型

MAIN world 与页面共享同一个 realm，`window.postMessage` **不是可信通道** —— `event.source !== window` 加一个 `source` 字段不构成认证，Octo 页面上的任何脚本都能伪造完全一样的消息。

因此原则是「使伪造消息无害」，而不是「防止伪造消息到达」：

- 每个 MAIN-world 入口都要重新校验收到的字段，不能依赖内容脚本已经校验过。
- 任何来自消息的 URL 必须收敛到安全集合：宠物图只接受 `data:image/*;base64,`，水印图由 `extensionAssetUrl()` 钉住协议与路径。否则页面可以借插件之手向外部发请求（装机探测 + 内网外发通道）。
- 主题类参数统一过 `*ById()` 白名单，未知值回退默认而不是直接 `setAttribute`。
- 页面上不用 `innerHTML` 拼接（MAIN world 的 innerHTML 以页面权限执行）。

## 兼容性自检

Octo 是我们不控制的移动目标。改版重命名类名时，受影响的功能会静默失效，用户只会觉得「插件坏了」。MAIN world 在启动后的 1.5 / 5 / 15 秒探测关键选择器，并把结论写入 storage，Side Panel 据此提示具体哪项能力失效。

避免误报是设计重点：应用外壳未渲染前结论为「不确定」且不报告；每项检查声明前置条件，前置缺失时不连带报告其下游检查；仅在结论变化时写入。


## 新增一个功能要改哪里

目标是每项只改一处，且漏改会被编译器或测试拦下：

1. `octoShared.ts`：加 storage key + 消息类型与接口（并加入 `OctoMessage` 联合）。
2. `octoSettingsParsers.ts`：加解析器，并把 key 加入 `RELAYED_STORAGE_KEYS` 和 `SIMPLE_RELAY_KEYS`。
   → 内容脚本的 relay 表是以这个联合为键的 `Record`，**忘了接线会直接编译失败**。
3. `octo-main-world.ts`：在 `SETTING_HANDLERS` 表里加一行。
4. 面板 UI 用 `FeatureSection`：功能自己的开关放 `enabled` / `onToggleEnabled`，折叠里放细节。没有真实布尔开关的功能要先补一个 storage key（例如美化引擎的 `octoBeautifyEnabled`），而不是在面板上留一个假开关。
5. 如果它在页面上留下任何痕迹（样式、属性、节点、监听器、定时器）：在 `PAGE_FEATURES`
   里加一项，`stop` 是必填的。这是「关掉总开关 = 等于没装插件」的结构保证。
6. `sidepanel/App.tsx`：加 UI。

关于解析器：大多数设置只需一个解析函数，因为初始快照和 `onChanged` 变更集形状相同。
但注意：删除宠物会 **remove** `octoDesktopPetEnabled` 键，变更集里它是 `undefined` ——
此时套用「初始默认值」会把用户刚删的宠物重新启用。所以三个设置刻意保留了
`...Initial` / `...FromChange` 两个版本，并有测试断言二者结果不同，防止后人「清理」掉。

## 开发

```bash
pnpm install
pnpm dev        # 启动 17321 端口，不自动打开浏览器
pnpm compile    # 类型检查
pnpm build      # 生产构建
```

安装扩展后打开 Octo，点击扩展图标打开 Side Panel：选择消息主题、切换「舒适输入框」，或在「桌面宠物」区导入 `.zip` / `.codex-pet.zip`。导入后宠物默认启用，可选择自由拖拽或输入框陪伴，也可停用、更换或删除。仅在 `im.deepminer.com.cn` 生效（改域名见 `wxt.config.ts` 的 `OCTO_MATCHES`）；所有处理在本地完成，插件不向任何服务器发送数据。

## 宠物包动作格式

Codex 宠物包可直接导入：`1536 × 1872` 的 v1 atlas 会自动识别，v2 包按官方格式在 `pet.json` 声明 `"spriteVersionNumber": 2`。静止播放 `idle`，悬浮播放 `waving`，拖动时按方向播放 `running-left` / `running-right`；松开后按鼠标是否仍在宠物上恢复悬浮或静止动作。标准 atlas 的其余 `jumping`、`failed`、`waiting`、`running`、`review` 动作也会完成解析。

自定义 atlas 推荐使用顶层 `columns` / `rows` / `frameDurationMs` / `animations` / `stateAnimations`。以下是一个完整、最小可用的 `pet.json`：

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "spritesheetPath": "spritesheet.webp",
  "columns": 4,
  "rows": 1,
  "frameDurationMs": 125,
  "animations": {
    "idle": { "row": 0, "frames": 4 }
  },
  "stateAnimations": {
    "idle": "idle"
  }
}
```

`animations` 也兼容同义顶层字段 `actions`。`frames` 可以是从第 0 列开始的帧数，也可以是明确的列索引数组。动作可用 `fps`、`frameDurationMs` 或可选的 `frameDurationsMs` 逐帧时长；`stateAnimations.dragLeft` / `dragRight` 可覆盖左右拖动动作。导入时会校验网格、行列范围、时长、状态引用与图片尺寸，错误包不会进入页面脚本。

为兼容早期对外示例，也接受以下别名，导入后会规范化为上面的顶层格式：

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "spritesheetPath": "spritesheet.webp",
  "sprite": { "columns": 6, "rows": 3, "defaultFps": 8 },
  "actions": {
    "calm": { "row": 0, "frames": 6 },
    "happy": { "row": 1, "frames": 4 },
    "grabbed": { "row": 2, "frames": 6 }
  },
  "states": {
    "default": "calm",
    "hover": "happy",
    "dragging": "grabbed",
    "dragLeft": "grabbed",
    "dragRight": "grabbed"
  }
}
```

对应关系为 `sprite.columns/rows` → `columns/rows`、`sprite.defaultFps` → `frameDurationMs = 1000 / defaultFps`，以及 `states.default/hover/dragging/dragLeft/dragRight` → `stateAnimations.idle/hover/drag/dragLeft/dragRight`。同一包可同时写推荐的顶层字段和兼容别名，但两者必须一致；冲突会在导入时明确报错。

## 安装 Release 包

从仓库的 [Releases](https://github.com/botshen/octo-help/releases) 下载 Chrome ZIP，解压后在 `chrome://extensions` 中打开「开发者模式」，选择「加载已解压的扩展程序」。

## 固定的扩展 ID

本扩展的 ID 是固定的，不随安装位置变化：

| 浏览器 | ID |
| --- | --- |
| Chrome / Edge | `pcofpmfiknglflncnjejfldadchndnoo` |
| Firefox | `octo-chat-enhancer@botshen.github.io` |

为什么需要固定：未打包的扩展没有自带身份，Chromium 用「加载目录的绝对路径」求哈希当 ID。于是每台机器、甚至同一台机器上重新解压到另一个文件夹，都会得到不同的 ID —— 浏览器把它当成另一个扩展，`browser.storage.local` 也是空的，用户导入的宠物和所有开关无声无息全部丢失；`chrome-extension://<id>/` 这个 origin 也无法被任何外部引用。

做法：manifest 的 `key` 字段声明一个 RSA 公钥，Chromium 改为对公钥求哈希，ID 就处处一致。公钥和推导出的 ID 写在 [`utils/extensionIdentity.ts`](./utils/extensionIdentity.ts)，`wxt.config.ts` 根据目标浏览器写入 `key`（Chrome）或 `browser_specific_settings.gecko.id`（Firefox 不读 `key`）。公钥本身不是秘密，可以入库；`extensionIdentity.test.ts` 会从公钥重算一遍 ID，两者不一致就报错，防止改了一边忘了另一边。

私钥不在仓库里，也不影响上面的 ID（只有签 `.crx` 做自托管更新时才需要）。如需重新生成一套密钥（**会换掉 ID，等于让所有现有安装丢失数据**）：

```bash
openssl genrsa -out chrome-extension-key.pem 2048          # 私钥：离库保存、chmod 600
openssl rsa -in chrome-extension-key.pem -pubout -outform DER | base64 -w0   # 填回 manifest.key
```

ID = 该 DER 公钥 SHA-256 的前 128 bit，每个十六进制位 0-f 映射为 a-p（推导实现见 `extensionIdentity.test.ts`）。

## 发布

版本更新记录统一维护在 [`CHANGELOG.md`](./CHANGELOG.md)，Release 页面不会使用提交记录代替用户可读的更新说明。

发布前，先把本次变化整理为目标版本的二级标题，例如 `## [0.2.0] - 2026-08-01`，并提交 `CHANGELOG.md`。可以在本地预览最终 Release 正文：

```bash
pnpm release:notes v0.2.0
```

发布命令会检查工作区、分支和对应版本的更新说明，运行类型检查、构建 ZIP、更新版本号、创建提交和 tag，并推送到 GitHub。GitHub Actions 随后会从 `CHANGELOG.md` 提取正文，自动创建 Release，并上传 Chrome ZIP 和 SHA-256 校验文件。

```bash
pnpm release patch   # 0.1.0 -> 0.1.1
pnpm release minor   # 0.1.0 -> 0.2.0
pnpm release major   # 0.1.0 -> 1.0.0
pnpm release 1.2.3   # 发布指定版本
```
