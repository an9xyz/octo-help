import { describe, expect, it } from 'vitest';
import {
  AI_RUN_LABEL,
  isFoldableStaleRow,
  isMergeableParentRow,
  planConvStamps,
  type ConvRowFacts,
} from './octoConvGroup';

/**
 * These tests protect two rules whose failure modes are silent.
 *
 * The merge rule can hide a row the user needed — so the "never hide a row that
 * has an indicator" guard is pinned explicitly, as is the requirement that only
 * parent-group rows (no breadcrumb) are ever candidates.
 *
 * The run rule decides where a synthesised group header goes. Getting it wrong
 * puts a header in the middle of a group or spends a whole line on a single row,
 * and neither shows up as an error anywhere.
 */

function row(over: Partial<ConvRowFacts> = {}): ConvRowFacts {
  return {
    crumb: '',
    preview: '',
    hasIndicator: false,
    mentioned: false,
    mutedUnread: false,
    isAi: false,
    time: '14:29',
    pinned: false,
    ...over,
  };
}

/** 分组档（L4）。 */
const L4 = { groupRuns: true, groupAi: true, foldStale: false };
/** 只归并不分组（L2/L3）。 */
const L2 = { groupRuns: false, groupAi: false, foldStale: false };

describe('merging a parent-group row', () => {
  it.each([
    ['半角括号', '[子区] web ui 回滚'],
    ['全角括号', '［子区］web ui 回滚'],
    ['前导空格', '  [子区] web ui 回滚'],
    ['括号内留白', '[ 子区 ] web ui 回滚'],
  ] as const)('识别 %s 的子区通知', (_label, preview) => {
    expect(isMergeableParentRow(row({ preview }))).toBe(true);
  });

  it('从不归并带未读/@我 的行', () => {
    // 这条是安全阀：宁可留一行重复，也不能把在等人处理的会话藏起来。
    expect(
      isMergeableParentRow(row({ preview: '[子区] web ui 回滚', hasIndicator: true })),
    ).toBe(false);
  });

  it('从不归并子区自己的行', () => {
    // 有面包屑说明它就是子区行，是归并的目标而不是被归并的一方。
    expect(
      isMergeableParentRow(row({ crumb: 'octo - matter v2 产研', preview: '[子区] x' })),
    ).toBe(false);
  });

  it('不把正常消息误判成通知', () => {
    expect(isMergeableParentRow(row({ preview: '沈鑫: 子区那个问题修了' }))).toBe(false);
    expect(isMergeableParentRow(row({ preview: '聊到 [子区] 的时候' }))).toBe(false);
  });

  it('L2 只归并、不分组', () => {
    const rows = [
      row({ crumb: 'A', preview: 'x' }),
      row({ crumb: 'A', preview: 'y' }),
      row({ preview: '[子区] z' }),
    ];
    const plan = planConvStamps(rows, L2);
    expect(plan.map((p) => p.merged)).toEqual([false, false, true]);
    expect(plan.map((p) => p.run)).toEqual([null, null, null]);
  });
});

describe('一周以外的会话', () => {
  const FOLD = { groupRuns: false, groupAi: false, foldStale: true };

  it.each([
    ['刚刚'],
    ['14:29'],
    ['23:05'],
    ['昨天 16:54'],
    ['前天 20:51'],
    ['星期三 16:54'],
    ['星期日 09:02'],
  ] as const)('%s 属于一周内，不折叠', (time) => {
    expect(isFoldableStaleRow(row({ time }))).toBe(false);
  });

  it.each([
    ['zh-CN 斜杠', '2026/8/3 12:09'],
    ['往年', '2025/12/28 18:40'],
    ['en-US', '8/3/2026 12:09'],
    // 判据用「4 位连续数字」而不是斜杠，正是为了覆盖这种 locale。
    ['de-DE 点号', '03.08.2026 12:09'],
    ['ISO 连字符', '2026-08-03 12:09'],
  ] as const)('%s 属于一周外，折叠', (_l, time) => {
    expect(isFoldableStaleRow(row({ time }))).toBe(true);
  });

  it('置顶的一周外会话不折叠', () => {
    // 置顶是用户明确的长期指令，过滤不该越过它。
    expect(isFoldableStaleRow(row({ time: '2026/8/3 12:09', pinned: true }))).toBe(false);
  });

  it('有未读的一周外会话不折叠', () => {
    // 折叠它等于替用户判定「这事不用管了」。
    expect(isFoldableStaleRow(row({ time: '2026/8/3 12:09', hasIndicator: true }))).toBe(false);
  });

  it('@我的一周外会话不折叠，即使它是免打扰的', () => {
    // .wk-mention 跨免打扰存活：群里 @我 和未读私聊都算「有人在等我」。
    expect(
      isFoldableStaleRow(
        row({ time: '2026/8/3 12:09', hasIndicator: true, mentioned: true, mutedUnread: true }),
      ),
    ).toBe(false);
  });

  it('免打扰的未读堆积不买豁免', () => {
    // 真机上这就是过滤开着依然留在列表里的全部：两个三十多天前、只有灰点的子区。
    // 用户已经说过「这里别烦我」，那就不该拿它的未读数来抵消一周过滤。
    expect(
      isFoldableStaleRow(row({ time: '2026/8/3 12:09', hasIndicator: true, mutedUnread: true })),
    ).toBe(true);
  });

  it('关掉开关时一律不折叠', () => {
    const rows = [row({ time: '2026/8/3 12:09' })];
    expect(planConvStamps(rows, L2)[0].stale).toBe(false);
    expect(planConvStamps(rows, FOLD)[0].stale).toBe(true);
  });

  it('被折叠的行不打断分组', () => {
    // 和归并行同理：它是 display:none 的，视觉上不存在。
    const rows = [
      row({ crumb: 'A' }),
      row({ time: '2026/8/3 12:09' }),
      row({ crumb: 'A' }),
    ];
    const plan = planConvStamps(rows, { groupRuns: true, groupAi: true, foldStale: true });
    expect(plan[1].stale).toBe(true);
    expect(plan[0].run).toBe('first');
    expect(plan[2].run).toBe('cont');
    expect(plan[0].runLabel).toBe('A · 2');
  });

  it('时间为空时不折叠', () => {
    // 读不到时间就不猜，宁可多显示一行。
    expect(isFoldableStaleRow(row({ time: '' }))).toBe(false);
  });
});

describe('runs of the same parent', () => {
  it('把连续同父群折成 first + cont，并在表头带上条数', () => {
    const rows = [
      row({ crumb: 'octo - matter v2 产研', preview: 'a' }),
      row({ crumb: 'octo - matter v2 产研', preview: 'b' }),
      row({ crumb: 'octo - matter v2 产研', preview: 'c' }),
    ];
    const plan = planConvStamps(rows, L4);
    expect(plan.map((p) => p.run)).toEqual(['first', 'cont', 'cont']);
    expect(plan[0].runLabel).toBe('octo - matter v2 产研 · 3');
    expect(plan[1].runLabel).toBe('');
  });

  it('单个子区不折叠 —— 表头要占一行，只为一行不值得', () => {
    const plan = planConvStamps([row({ crumb: 'A', preview: 'a' })], L4);
    expect(plan[0].run).toBeNull();
  });

  it('不同父群各自成组', () => {
    const rows = [
      row({ crumb: 'A' }),
      row({ crumb: 'A' }),
      row({ crumb: 'B' }),
      row({ crumb: 'B' }),
    ];
    const plan = planConvStamps(rows, L4);
    expect(plan.map((p) => p.run)).toEqual(['first', 'cont', 'first', 'cont']);
  });

  it('无面包屑的行打断分组', () => {
    const rows = [row({ crumb: 'A' }), row({ preview: '普通群' }), row({ crumb: 'A' })];
    const plan = planConvStamps(rows, L4);
    // 两个 A 被中间的普通群隔开，各自只剩一个，都不成组。
    expect(plan.map((p) => p.run)).toEqual([null, null, null]);
  });

  it('被归并掉的行不打断分组', () => {
    // 归并行是 display:none 的，视觉上不存在，因此不能把一个组劈成两半。
    const rows = [
      row({ crumb: 'A' }),
      row({ preview: '[子区] 被归并' }),
      row({ crumb: 'A' }),
    ];
    const plan = planConvStamps(rows, L4);
    expect(plan[1].merged).toBe(true);
    expect(plan[0].run).toBe('first');
    expect(plan[2].run).toBe('cont');
    expect(plan[0].runLabel).toBe('A · 2');
  });

  it('连续 AI 助手折成一组，用固定表头', () => {
    const rows = [row({ isAi: true }), row({ isAi: true }), row({ isAi: true })];
    const plan = planConvStamps(rows, L4);
    expect(plan.map((p) => p.run)).toEqual(['first', 'cont', 'cont']);
    expect(plan[0].runLabel).toBe(`${AI_RUN_LABEL} · 3`);
  });

  it('关掉 AI 分组时 AI 行不成组', () => {
    const rows = [row({ isAi: true }), row({ isAi: true })];
    const plan = planConvStamps(rows, { groupRuns: true, groupAi: false, foldStale: false });
    expect(plan.map((p) => p.run)).toEqual([null, null]);
  });

  it('AI 行与子区行不会互相混入同一组', () => {
    const rows = [
      row({ crumb: 'A' }),
      row({ crumb: 'A' }),
      row({ isAi: true }),
      row({ isAi: true }),
    ];
    const plan = planConvStamps(rows, L4);
    expect(plan.map((p) => p.runLabel)).toEqual(['A · 2', '', `${AI_RUN_LABEL} · 2`, '']);
  });

  it('带面包屑的 AI 行按父群分组，不按 AI 分组', () => {
    // 面包屑优先：它是更具体的归属信息。
    const rows = [row({ crumb: 'A', isAi: true }), row({ crumb: 'A', isAi: true })];
    const plan = planConvStamps(rows, L4);
    expect(plan[0].runLabel).toBe('A · 2');
  });

  it('空列表不炸', () => {
    expect(planConvStamps([], L4)).toEqual([]);
  });

  it('输出长度始终等于输入长度', () => {
    const rows = [row({ crumb: 'A' }), row({ preview: '[子区] x' }), row({ isAi: true })];
    expect(planConvStamps(rows, L4)).toHaveLength(3);
  });
});
