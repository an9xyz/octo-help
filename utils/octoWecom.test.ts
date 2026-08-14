import { describe, expect, it } from 'vitest';
import { parseMeetingCode, wecomKind, wemeetJoinUrl } from './octoBeautify';

const BASE = 'https://im.deepminer.com.cn/';

describe('wecomKind', () => {
  it('recognizes the 企业微信 schedule app', () => {
    expect(wecomKind('https://work.weixin.qq.com/webapp/ts/lMnaPZ0UMccPAyCS', BASE)).toBe(
      'schedule',
    );
  });

  it('keeps recognizing the schedule path with a query string', () => {
    expect(
      wecomKind('https://work.weixin.qq.com/webapp/ts/abc?last_retry_auth=1', BASE),
    ).toBe('schedule');
  });

  it('labels other 企业微信 paths as a generic link', () => {
    expect(wecomKind('https://work.weixin.qq.com/wework_admin/loginpage_wx', BASE)).toBe(
      'link',
    );
    expect(wecomKind('https://work.weixin.qq.com/', BASE)).toBe('link');
  });

  it('matches subdomains of the 企业微信 host', () => {
    expect(wecomKind('https://open.work.weixin.qq.com/webapp/ts/x', BASE)).toBe('schedule');
  });

  it('ignores unrelated hosts, including look-alikes', () => {
    expect(wecomKind('https://example.com/webapp/ts/x', BASE)).toBe('');
    expect(wecomKind('https://weixin.qq.com/webapp/ts/x', BASE)).toBe('');
    // Must not be fooled by the host appearing elsewhere in the URL.
    expect(wecomKind('https://evil.com/?u=work.weixin.qq.com/webapp/ts/x', BASE)).toBe('');
    expect(wecomKind('https://notwork.weixin.qq.com/webapp/ts/x', BASE)).toBe('');
  });

  it('ignores non-http(s) schemes and unparseable values', () => {
    expect(wecomKind('javascript:alert(1)', BASE)).toBe('');
    expect(wecomKind('', BASE)).toBe('');
    expect(wecomKind('   ', BASE)).toBe('');
  });
});

describe('wecomKind: meeting vs schedule', () => {
  it('classifies /webapp/tm/<tm_code> as a meeting', () => {
    // Real invite link; the code equals the tm_code in the app's wxwork://jump.
    expect(wecomKind('https://work.weixin.qq.com/webapp/tm/0m9TcMlGMn1', BASE)).toBe(
      'meeting',
    );
  });

  it('still classifies /webapp/ts/ as a schedule', () => {
    expect(wecomKind('https://work.weixin.qq.com/webapp/ts/lMnaPZ0UMccPAyCS', BASE)).toBe(
      'schedule',
    );
  });
});

describe('parseMeetingCode', () => {
  // Verbatim WeCom invite text.
  const INVITE = [
    '李志伟 邀请您参加企业微信会议',
    '会议主题：李志伟的快速会议',
    '会议时间：2026/08/05 16:21-17:21 (GMT+08:00)',
    '点击链接直接加入会议：',
    'https://work.weixin.qq.com/webapp/tm/0m9TcMlGMn1',
    '#企业微信会议：446-153-273',
  ].join('\n');

  it('extracts the code from a real invite, stripping separators', () => {
    expect(parseMeetingCode(INVITE)).toBe('446153273');
  });

  it('accepts the common label and separator variants', () => {
    expect(parseMeetingCode('会议号：446 153 273')).toBe('446153273');
    expect(parseMeetingCode('腾讯会议: 446153273')).toBe('446153273');
    expect(parseMeetingCode('会议 ID：446-153-273')).toBe('446153273');
  });

  it('ignores unlabelled digit runs, which are usually not meeting codes', () => {
    expect(parseMeetingCode('我的手机是 13800138000')).toBe('');
    expect(parseMeetingCode('订单 446153273 已发货')).toBe('');
    expect(parseMeetingCode('会议时间：2026/08/05 16:21-17:21')).toBe('');
  });

  it('rejects codes of implausible length', () => {
    expect(parseMeetingCode('会议号：12345')).toBe('');
    expect(parseMeetingCode('会议号：4461532731234567')).toBe('');
  });

  it('returns empty for empty input', () => {
    expect(parseMeetingCode('')).toBe('');
  });
});

describe('wemeetJoinUrl', () => {
  it('builds the local-client join deep link', () => {
    // page/inmeeting — premeeting/join only opens the "enter a number" screen.
    expect(wemeetJoinUrl('446153273')).toBe(
      'wemeet://page/inmeeting?meeting_code=446153273',
    );
  });
});
