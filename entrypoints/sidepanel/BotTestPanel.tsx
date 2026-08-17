import { browser } from '#imports';
import { useEffect, useState } from 'react';
import {
  BOT_BASE_URL_STORAGE_KEY,
  BOT_CLIP_DOC_STORAGE_KEY,
  BOT_SHARE_TARGET_STORAGE_KEY,
  BOT_TEMPLATES_STORAGE_KEY,
  BOT_TOKEN_STORAGE_KEY,
  GH_INTERVAL_STORAGE_KEY,
  GH_REPO_STORAGE_KEY,
  GH_TARGET_STORAGE_KEY,
  GH_TOKEN_STORAGE_KEY,
  type BotClipDoc,
  type BotShareTarget,
} from '@/utils/octoShared';
import {
  OCTO_BOT_API_DEFAULT_BASE,
  createDoc,
  listBotGroups,
  listGroupThreads,
  registerBot,
  sendBotMessage,
  CHANNEL_TYPE_DM,
  CHANNEL_TYPE_GROUP,
  CHANNEL_TYPE_THREAD,
  type BotIdentity,
  type OctoGroup,
  type OctoThread,
} from '@/utils/octoBotApi';
import { FeatureSection } from './FeatureSection';
import { fetchRepoStatus, formatRepoStatus, parseRepo } from '@/utils/octoGithub';
import { githubDigestToOcto } from '@/utils/octoBotActions';

/**
 * Bot API connectivity tester. Self-contained (its own state, its own storage
 * reads) so it needs no wiring into the main reducer. Fetches run directly from
 * the side panel — an extension page with host_permissions for the gateway host
 * can call it cross-origin without CORS.
 */
export function BotTestPanel({
  open,
  onToggleOpen,
}: {
  open: boolean;
  onToggleOpen: () => void;
}) {
  const [baseUrl, setBaseUrl] = useState(OCTO_BOT_API_DEFAULT_BASE);
  const [token, setToken] = useState('');
  const [groups, setGroups] = useState<OctoGroup[]>([]);
  const [identity, setIdentity] = useState<BotIdentity | null>(null);
  const [selected, setSelected] = useState('');
  const [threads, setThreads] = useState<OctoThread[]>([]);
  const [selectedThread, setSelectedThread] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<null | 'groups' | 'send' | 'dm' | 'threads' | 'doc' | 'gh'>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [shareTarget, setShareTarget] = useState<BotShareTarget | null>(null);
  const [clipDoc, setClipDoc] = useState<BotClipDoc | null>(null);
  const [templates, setTemplates] = useState<string[]>([]);
  const [newTemplate, setNewTemplate] = useState('');
  const [ghRepo, setGhRepo] = useState('');
  const [ghToken, setGhToken] = useState('');
  const [ghInterval, setGhInterval] = useState(0);
  const [ghPreview, setGhPreview] = useState('');
  const [ghTarget, setGhTarget] = useState<BotShareTarget | null>(null);

  useEffect(() => {
    browser.storage.local
      .get([
        BOT_TOKEN_STORAGE_KEY,
        BOT_BASE_URL_STORAGE_KEY,
        BOT_SHARE_TARGET_STORAGE_KEY,
        BOT_CLIP_DOC_STORAGE_KEY,
        BOT_TEMPLATES_STORAGE_KEY,
        GH_REPO_STORAGE_KEY,
        GH_TOKEN_STORAGE_KEY,
        GH_INTERVAL_STORAGE_KEY,
        GH_TARGET_STORAGE_KEY,
      ])
      .then((res) => {
        if (typeof res[BOT_TOKEN_STORAGE_KEY] === 'string') setToken(res[BOT_TOKEN_STORAGE_KEY]);
        if (typeof res[BOT_BASE_URL_STORAGE_KEY] === 'string' && res[BOT_BASE_URL_STORAGE_KEY]) {
          setBaseUrl(res[BOT_BASE_URL_STORAGE_KEY]);
        }
        if (res[BOT_SHARE_TARGET_STORAGE_KEY]) setShareTarget(res[BOT_SHARE_TARGET_STORAGE_KEY] as BotShareTarget);
        if (res[BOT_CLIP_DOC_STORAGE_KEY]) setClipDoc(res[BOT_CLIP_DOC_STORAGE_KEY] as BotClipDoc);
        if (Array.isArray(res[BOT_TEMPLATES_STORAGE_KEY])) setTemplates(res[BOT_TEMPLATES_STORAGE_KEY] as string[]);
        if (typeof res[GH_REPO_STORAGE_KEY] === 'string') setGhRepo(res[GH_REPO_STORAGE_KEY]);
        if (typeof res[GH_TOKEN_STORAGE_KEY] === 'string') setGhToken(res[GH_TOKEN_STORAGE_KEY]);
        if (typeof res[GH_INTERVAL_STORAGE_KEY] === 'number') setGhInterval(res[GH_INTERVAL_STORAGE_KEY]);
        if (res[GH_TARGET_STORAGE_KEY]) setGhTarget(res[GH_TARGET_STORAGE_KEY] as BotShareTarget);
      })
      .catch(() => {});
  }, []);

  const persist = (nextToken: string, nextBase: string) => {
    void browser.storage.local.set({
      [BOT_TOKEN_STORAGE_KEY]: nextToken,
      [BOT_BASE_URL_STORAGE_KEY]: nextBase,
    });
  };

  const loadGroups = async () => {
    setError('');
    setStatus('');
    if (!token.trim()) {
      setError('请先填写 Bot Token');
      return;
    }
    persist(token.trim(), baseUrl.trim());
    setBusy('groups');
    try {
      const [id, list] = await Promise.all([
        registerBot(baseUrl.trim(), token.trim()).catch(() => null),
        listBotGroups(baseUrl.trim(), token.trim()),
      ]);
      setIdentity(id);
      setGroups(list);
      setSelected(list[0]?.group_no ?? '');
      if (list[0]) void loadThreads(list[0].group_no);
      setStatus(
        list.length
          ? `${id ? id.name + ' · ' : ''}拿到 ${list.length} 个群`
          : `${id ? id.name + '：' : ''}未加入任何群，先把 Bot 拉进群才能群发；可用下方「发私聊给 Owner」自测`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '拉取群列表失败');
    } finally {
      setBusy(null);
    }
  };

  const sendDmToOwner = async () => {
    setError('');
    setStatus('');
    if (!identity?.owner_channel_id) {
      setError('缺少 Owner 频道，请先点「拉取群列表」');
      return;
    }
    if (!text.trim()) {
      setError('消息内容不能为空');
      return;
    }
    setBusy('dm');
    try {
      const res = await sendBotMessage(
        baseUrl.trim(),
        token.trim(),
        identity.owner_channel_id,
        CHANNEL_TYPE_DM,
        text.trim(),
      );
      setStatus(`已私聊 Owner ✓ message_id=${res.message_id ?? '-'}`);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setBusy(null);
    }
  };

  const loadThreads = async (groupNo: string) => {
    setThreads([]);
    setSelectedThread('');
    if (!groupNo) return;
    setError('');
    setBusy('threads');
    try {
      const list = await listGroupThreads(baseUrl.trim(), token.trim(), groupNo);
      setThreads(list);
      setStatus(list.length ? `该群有 ${list.length} 个子区` : '该群没有子区');
    } catch (err) {
      setError(err instanceof Error ? err.message : '拉取子区失败');
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setError('');
    setStatus('');
    if (!selected) {
      setError('请先选择一个群');
      return;
    }
    if (!text.trim()) {
      setError('消息内容不能为空');
      return;
    }
    const thread = threads.find((t) => t.channel_id === selectedThread);
    setBusy('send');
    try {
      const res = thread
        ? await sendBotMessage(baseUrl.trim(), token.trim(), thread.channel_id, CHANNEL_TYPE_THREAD, text.trim())
        : await sendBotMessage(baseUrl.trim(), token.trim(), selected, CHANNEL_TYPE_GROUP, text.trim());
      setStatus(`已发送到${thread ? '子区「' + thread.name + '」' : '群'} ✓ message_id=${res.message_id ?? '-'}`);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setBusy(null);
    }
  };

  const currentTarget = (): BotShareTarget | null => {
    if (!selected) return null;
    const thread = threads.find((t) => t.channel_id === selectedThread);
    const group = groups.find((g) => g.group_no === selected);
    return thread
      ? { channelId: thread.channel_id, channelType: CHANNEL_TYPE_THREAD, label: `${group?.name ?? selected} / ${thread.name}` }
      : { channelId: selected, channelType: CHANNEL_TYPE_GROUP, label: group?.name ?? selected };
  };

  const saveShareTarget = () => {
    const t = currentTarget();
    if (!t) {
      setError('先选择群或子区');
      return;
    }
    setShareTarget(t);
    void browser.storage.local.set({ [BOT_SHARE_TARGET_STORAGE_KEY]: t });
    setStatus(`默认分享目标已设为「${t.label}」`);
  };

  const createClipDoc = async () => {
    setError('');
    if (!token.trim()) {
      setError('请先填写 Bot Token');
      return;
    }
    setBusy('doc');
    try {
      const meta = await createDoc(baseUrl.trim(), token.trim(), '网页剪存');
      const doc: BotClipDoc = { docId: meta.docId, title: meta.title || '网页剪存' };
      setClipDoc(doc);
      await browser.storage.local.set({ [BOT_CLIP_DOC_STORAGE_KEY]: doc });
      setStatus(`剪存文档已创建：${doc.title}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建文档失败');
    } finally {
      setBusy(null);
    }
  };

  const saveTemplates = (next: string[]) => {
    setTemplates(next);
    void browser.storage.local.set({ [BOT_TEMPLATES_STORAGE_KEY]: next });
  };
  const addTemplate = () => {
    const t = newTemplate.trim();
    if (!t) return;
    saveTemplates([...templates, t]);
    setNewTemplate('');
  };

  const persistGh = (patch: Record<string, unknown>) => browser.storage.local.set(patch);

  const ghPreviewNow = async () => {
    setError('');
    setStatus('');
    const ref = parseRepo(ghRepo);
    if (!ref) {
      setError('仓库格式应为 owner/repo 或 GitHub 链接');
      return;
    }
    setBusy('gh');
    try {
      const text = formatRepoStatus(await fetchRepoStatus(ref, { token: ghToken.trim() || undefined }));
      setGhPreview(text);
      setStatus('已获取仓库状态（未发送）');
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取失败');
    } finally {
      setBusy(null);
    }
  };

  const ghSendNow = async () => {
    setError('');
    setStatus('');
    setBusy('gh');
    try {
      const text = await githubDigestToOcto();
      setGhPreview(text);
      setStatus('已汇总并发送到默认分享目标 ✓');
    } catch (err) {
      setError(err instanceof Error ? err.message : '汇总发送失败');
    } finally {
      setBusy(null);
    }
  };

  const setGhIntervalPersist = async (min: number) => {
    setGhInterval(min);
    await persistGh({ [GH_INTERVAL_STORAGE_KEY]: min });
    try {
      await browser.alarms.clear('octo-gh-digest');
      if (min > 0) await browser.alarms.create('octo-gh-digest', { periodInMinutes: min });
      setStatus(min > 0 ? `已开启定期汇总，每 ${min} 分钟` : '已关闭定期汇总');
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置定时失败');
    }
  };

  const saveGhTarget = () => {
    const t = currentTarget();
    if (!t) {
      setError('先在上方拉取群列表并选群/子区');
      return;
    }
    setGhTarget(t);
    void persistGh({ [GH_TARGET_STORAGE_KEY]: t });
    setStatus(`GitHub 汇总目标已设为「${t.label}」`);
  };

  const summary = identity
    ? `${identity.name} · ${groups.length ? groups.length + ' 个群' : '未加入群'}`
    : token
      ? '已填 Token'
      : '填 Bot Token 测试收发';

  return (
    <FeatureSection icon="🤖" title="Bot API 测试" summary={summary} open={open} onToggleOpen={onToggleOpen}>
      <div className="bot-panel">
      <div className="config-row is-stacked">
        <div className="config-copy">
          <span>网关地址</span>
          <small>默认生产环境，自建部署可改</small>
        </div>
        <input
          className="bot-input"
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.currentTarget.value)}
          placeholder={OCTO_BOT_API_DEFAULT_BASE}
        />
      </div>
      <div className="config-row is-stacked">
        <div className="config-copy">
          <span>Bot Token</span>
          <small>群发需 User Bot（bf_）；保存在本机扩展存储</small>
        </div>
        <input
          className="bot-input"
          type="password"
          value={token}
          onChange={(e) => setToken(e.currentTarget.value)}
          placeholder="bf_..."
          autoComplete="off"
        />
      </div>

      <button type="button" className="secondary-button" disabled={busy !== null} onClick={loadGroups}>
        {busy === 'groups' ? '拉取中…' : '拉取群列表'}
      </button>

      <div className="config-row is-stacked">
        <div className="config-copy">
          <span>剪存文档</span>
          <small>{clipDoc ? `当前：${clipDoc.title}` : '划词右键「剪存到 Octo 文档」的目标'}</small>
        </div>
        <button type="button" className="secondary-button" disabled={busy !== null} onClick={createClipDoc}>
          {busy === 'doc' ? '创建中…' : clipDoc ? '新建另一个剪存文档' : '新建剪存文档'}
        </button>
      </div>

      {templates.length > 0 && (
        <div className="config-row is-stacked">
          <div className="config-copy">
            <span>模板</span>
            <small>点按填入消息框</small>
          </div>
          <div className="tpl-chips">
            {templates.map((t, i) => (
              <span key={i} className="tpl-chip">
                <button type="button" className="tpl-fill" title={t} onClick={() => setText(t)}>
                  {t.length > 18 ? t.slice(0, 18) + '…' : t}
                </button>
                <button
                  type="button"
                  className="tpl-del"
                  aria-label="删除模板"
                  onClick={() => saveTemplates(templates.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="config-row is-stacked">
        <div className="config-copy">
          <span>新增模板</span>
          <small>常用话术，保存后一键填入</small>
        </div>
        <div className="tpl-add">
          <input
            className="bot-input"
            value={newTemplate}
            onChange={(e) => setNewTemplate(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTemplate();
              }
            }}
            placeholder="输入常用消息…"
          />
          <button type="button" className="secondary-button" onClick={addTemplate}>保存模板</button>
        </div>
      </div>

      {identity && groups.length === 0 && (
        <>
          <p className="feature-note">
            {identity.name}（{identity.robot_id}）未加入任何群。把它拉进一个群后再点「拉取群列表」即可群发；
            下面可以先给 Owner 发条私聊验证链路。
          </p>
          <div className="config-row is-stacked">
            <div className="config-copy">
              <span>消息内容</span>
              <small>以 Bot 身份私聊 Owner（自测）·回车发送，Shift+Enter 换行</small>
            </div>
            <textarea
              className="bot-input"
              rows={3}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void sendDmToOwner();
                }
              }}
              placeholder="要让 Bot 说的话…"
            />
          </div>
          <button type="button" className="primary-button" disabled={busy !== null} onClick={sendDmToOwner}>
            {busy === 'dm' ? '发送中…' : '发私聊给 Owner'}
          </button>
        </>
      )}

      {groups.length > 0 && (
        <>
          <div className="config-row is-stacked">
            <div className="config-copy">
              <span>目标群</span>
              <small>Bot 已加入的群</small>
            </div>
            <label className="select-wrap">
              <span className="sr-only">目标群</span>
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.currentTarget.value);
                  void loadThreads(e.currentTarget.value);
                }}
              >
                {groups.map((g) => (
                  <option key={g.group_no} value={g.group_no}>
                    {g.name || g.group_no}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="config-row is-stacked">
            <div className="config-copy">
              <span>子区（可选）</span>
              <small>{busy === 'threads' ? '拉取中…' : threads.length ? '选子区则发到子区，否则发到整个群' : '该群无子区'}</small>
            </div>
            <label className="select-wrap">
              <span className="sr-only">子区</span>
              <select
                value={selectedThread}
                disabled={threads.length === 0}
                onChange={(e) => setSelectedThread(e.currentTarget.value)}
              >
                <option value="">— 整个群 —</option>
                {threads.map((t) => (
                  <option key={t.channel_id} value={t.channel_id}>
                    {t.name || t.short_id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="config-row is-stacked">
            <div className="config-copy">
              <span>消息内容</span>
              <small>以 Bot 身份在群里发送·回车发送，Shift+Enter 换行</small>
            </div>
            <textarea
              className="bot-input"
              rows={3}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="要让 Bot 说的话…"
            />
          </div>
          <button type="button" className="primary-button" disabled={busy !== null} onClick={send}>
            {busy === 'send' ? '发送中…' : '发送到群'}
          </button>
          <button type="button" className="secondary-button" disabled={busy !== null} onClick={saveShareTarget}>
            设为默认分享目标{shareTarget ? `（当前：${shareTarget.label}）` : ''}
          </button>
        </>
      )}

      <div className="config-row is-stacked">
        <div className="config-copy">
          <span>GitHub 仓库状态汇总</span>
          <small>定期把 issue/PR 情况发到默认分享目标·公开仓库无需 token</small>
        </div>
        <input
          className="bot-input"
          value={ghRepo}
          onChange={(e) => setGhRepo(e.currentTarget.value)}
          onBlur={() => void persistGh({ [GH_REPO_STORAGE_KEY]: ghRepo.trim() })}
          placeholder="owner/repo 或 https://github.com/owner/repo"
        />
      </div>
      <div className="config-row is-stacked">
        <div className="config-copy">
          <span>GitHub Token（可选）</span>
          <small>私有仓库必填；公开仓库只为提高限额（60→5000/小时）</small>
        </div>
        <input
          className="bot-input"
          type="password"
          value={ghToken}
          onChange={(e) => setGhToken(e.currentTarget.value)}
          onBlur={() => void persistGh({ [GH_TOKEN_STORAGE_KEY]: ghToken.trim() })}
          placeholder="ghp_...（可留空）"
          autoComplete="off"
        />
      </div>
      <div className="config-row is-stacked">
        <div className="config-copy">
          <span>定期频率</span>
          <small>到点自动汇总并发送到下方目标（需保持浏览器运行）</small>
        </div>
        <label className="select-wrap">
          <span className="sr-only">定期频率</span>
          <select value={ghInterval} onChange={(e) => void setGhIntervalPersist(Number(e.currentTarget.value))}>
            <option value={0}>关闭</option>
            <option value={60}>每小时</option>
            <option value={360}>每 6 小时</option>
            <option value={1440}>每天</option>
          </select>
        </label>
      </div>
      <div className="config-row is-stacked">
        <div className="config-copy">
          <span>汇总发送目标</span>
          <small>{ghTarget ? `当前：${ghTarget.label}` : '未设置则发到默认分享目标'}</small>
        </div>
        <button type="button" className="secondary-button" disabled={busy !== null} onClick={saveGhTarget}>
          设为当前群/子区
        </button>
      </div>
      <div className="gh-actions">
        <button type="button" className="secondary-button" disabled={busy !== null} onClick={ghPreviewNow}>
          {busy === 'gh' ? '获取中…' : '仅预览'}
        </button>
        <button type="button" className="primary-button" disabled={busy !== null} onClick={ghSendNow}>
          立即汇总并发送
        </button>
      </div>
      {ghPreview && <pre className="gh-preview">{ghPreview}</pre>}

      {status && <p className="feature-note" role="status">{status}</p>}
      {error && <p className="pet-error bot-error" role="alert">{error}</p>}
      </div>
    </FeatureSection>
  );
}

export default BotTestPanel;
