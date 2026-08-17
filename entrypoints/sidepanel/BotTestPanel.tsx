import { browser } from '#imports';
import { useEffect, useState } from 'react';
import {
  BOT_BASE_URL_STORAGE_KEY,
  BOT_TOKEN_STORAGE_KEY,
} from '@/utils/octoShared';
import {
  OCTO_BOT_API_DEFAULT_BASE,
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
  const [busy, setBusy] = useState<null | 'groups' | 'send' | 'dm' | 'threads'>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    browser.storage.local
      .get([BOT_TOKEN_STORAGE_KEY, BOT_BASE_URL_STORAGE_KEY])
      .then((res) => {
        if (typeof res[BOT_TOKEN_STORAGE_KEY] === 'string') setToken(res[BOT_TOKEN_STORAGE_KEY]);
        if (typeof res[BOT_BASE_URL_STORAGE_KEY] === 'string' && res[BOT_BASE_URL_STORAGE_KEY]) {
          setBaseUrl(res[BOT_BASE_URL_STORAGE_KEY]);
        }
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
        </>
      )}

      {status && <p className="feature-note" role="status">{status}</p>}
      {error && <p className="pet-error bot-error" role="alert">{error}</p>}
      </div>
    </FeatureSection>
  );
}

export default BotTestPanel;
