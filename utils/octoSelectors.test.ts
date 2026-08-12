import { describe, expect, it } from 'vitest';
import {
  HEALTHY_COMPAT_REPORT,
  OCTO_SELECTORS,
  checkOctoCompat,
  type CompatProbe,
} from './octoSelectors';

/**
 * The self-check exists to turn "the extension is broken" into "this specific
 * capability broke because Octo changed". That is only useful if it never cries
 * wolf, so the false-positive cases get as much attention as the real ones.
 */

/** Probe backed by a set of selectors that are considered present. */
function probeWith(present: string[]): CompatProbe {
  return { matches: (selector) => present.includes(selector) };
}

const S = OCTO_SELECTORS;

/** Everything the checks care about, i.e. a healthy Octo page. */
const HEALTHY = [
  S.conversation,
  S.messageItem,
  S.messageRow,
  S.messageBody,
  S.composer,
  S.composerEditor,
];

describe('checkOctoCompat', () => {
  it('reports nothing on a healthy page', () => {
    expect(checkOctoCompat(probeWith(HEALTHY))).toEqual(HEALTHY_COMPAT_REPORT);
  });

  it('is inconclusive before the app shell exists', () => {
    // Still booting, or a route without a conversation. Every selector would
    // look missing here, so warning would be pure noise.
    const report = checkOctoCompat(probeWith([]));
    expect(report.conclusive).toBe(false);
    expect(report.brokenFeatures).toEqual([]);
  });

  it('does not warn when only the shell has rendered so far', () => {
    // The conversation host is up but no conversation/messages are painted yet.
    // Missing message rows and composer are all legitimate in this state.
    const report = checkOctoCompat(probeWith([S.conversation]));
    expect(report.conclusive).toBe(true);
    expect(report.brokenKeys).toEqual([]);
    expect(report.brokenFeatures).toEqual([]);
  });

  it('names the feature behind a renamed message row', () => {
    const present = HEALTHY.filter((s) => s !== S.messageRow && s !== S.messageBody);
    const report = checkOctoCompat(probeWith(present));
    expect(report.brokenKeys).toEqual(['messageRow']);
    expect(report.brokenFeatures).toEqual(['消息美化与主题']);
  });

  it('names the composer feature independently of the message ones', () => {
    const report = checkOctoCompat(probeWith(HEALTHY.filter((s) => s !== S.composer)));
    expect(report.brokenKeys).toEqual(['composer']);
    expect(report.brokenFeatures).toEqual(['舒适输入框、输入框宠物']);
  });

  it('names the feature behind a renamed message item', () => {
    const report = checkOctoCompat(probeWith(HEALTHY.filter((s) => s !== S.messageItem)));
    expect(report.brokenFeatures).toEqual(['新消息气泡']);
  });

  it('reports several broken features at once without duplicates', () => {
    const report = checkOctoCompat(probeWith([S.conversation, S.messageRow]));
    expect(report.brokenKeys).toEqual(['messageItem', 'messageBody']);
    expect(new Set(report.brokenFeatures).size).toBe(report.brokenFeatures.length);
  });
});

describe('OCTO_SELECTORS', () => {
  it('is the single source of truth: no selector string is empty', () => {
    for (const [key, selector] of Object.entries(OCTO_SELECTORS)) {
      expect(selector, key).toBeTruthy();
    }
  });

  it('keeps the combined body selector consistent with its parts', () => {
    // Several modules rely on anyMessageBody covering both contexts; drifting
    // apart would silently skip folded messages.
    expect(S.anyMessageBody).toContain(S.messageBody);
    expect(S.anyMessageBody).toContain(S.foldMessageBody);
  });
});
