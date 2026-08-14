import { afterEach, describe, expect, it } from 'vitest';
import {
  renderMessageMath,
  repairMarkdownMath,
  teardownBeautify,
  wholeMessageFormula,
} from './octoBeautify';

function message(html: string, className = 'wk-markdown'): HTMLElement {
  const host = document.createElement('div');
  host.className = className;
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

function expectRendered(host: Element, display = true): void {
  expect(host.querySelector('.katex')).not.toBeNull();
  expect(host.querySelector(`math${display ? '[display="block"]' : ':not([display])'}`)).not.toBeNull();
  // We intentionally ship native MathML, not KaTeX's font-heavy HTML output.
  expect(host.querySelector('.katex-html')).toBeNull();
}

afterEach(() => {
  teardownBeautify();
  document.body.replaceChildren();
});

describe('repairMarkdownMath', () => {
  it.each([
    [String.raw`\left{ x \right}`, String.raw`\left\{ x \right\}`],
    [String.raw`\left {x\right }`, String.raw`\left\{x\right\}`],
    [String.raw`\left{ a + \left{b\right} \right}`, String.raw`\left\{ a + \left\{b\right\} \right\}`],
  ])('restores brace escapes in %s', (source, expected) => {
    expect(repairMarkdownMath(source)).toBe(expected);
  });

  it.each([
    String.raw`\left\{x\right\}`,
    String.raw`\left(x\right)`,
    String.raw`\left[x\right]`,
    String.raw`\leftarrow x \rightarrow y`,
    String.raw`plain { braces }`,
  ])('leaves valid or unrelated source unchanged: %s', (source) => {
    expect(repairMarkdownMath(source)).toBe(source);
  });
});

describe('wholeMessageFormula', () => {
  it.each([
    ['$$x^2$$', { source: 'x^2', display: true }],
    ['  $$\n\\frac{1}{2}\n$$  ', { source: '\\frac{1}{2}', display: true }],
    [String.raw`\[x+y\]`, { source: 'x+y', display: true }],
    [String.raw`\(x+y\)`, { source: 'x+y', display: false }],
    ['$x+y$', { source: 'x+y', display: false }],
  ])('recognizes a whole delimited formula: %s', (source, expected) => {
    expect(wholeMessageFormula(source)).toEqual(expected);
  });

  it.each([
    'a^2+b^2=c^2',
    'E=mc^2',
    'x_i',
    String.raw`\frac{1}{2}`,
    String.raw`\text{hello world}`,
    String.raw`\begin{matrix}a&b\\c&d\end{matrix}`,
    String.raw`f(x)=\sin(x)` ,
  ])('recognizes an unambiguous bare formula: %s', (source) => {
    expect(wholeMessageFormula(source)).toEqual({ source, display: true });
  });

  it('recognizes and repairs the real path-integral message', () => {
    const source = String.raw`\int \mathcal{D}\phi \exp\left{ i \int d^4x \sqrt{-g} \left[ \frac{1}{2}\partial_\mu \phi \partial^\mu \phi - \frac{1}{2}m^2 \phi^2 - \frac{\lambda}{4!}\phi^4 + \xi R \phi^2 \right] \right}`;
    const parsed = wholeMessageFormula(source);

    expect(parsed?.display).toBe(true);
    expect(parsed?.source).toContain(String.raw`\left\{`);
    expect(parsed?.source).toContain(String.raw`\right\}`);
  });

  it.each([
    '',
    '   ',
    '普通聊天消息',
    'const type=1',
    'foo_bar',
    'user_id=42',
    '{680}',
    '结果是 a^2+b^2=c^2',
    String.raw`C:\Users\alice`,
    String.raw`Use \frac{1}{2} in prose`,
    String.raw`\notACommand{x}`,
    '$$',
    '$x',
    '$x$$',
    '$$x$',
    String.raw`\(x\]`,
  ])('rejects prose, code, invalid TeX, and broken delimiter pairs: %s', (source) => {
    expect(wholeMessageFormula(source)).toBeNull();
  });
});

describe('renderMessageMath', () => {
  it('renders mixed inline/display TeX while leaving code and escaped dollars alone', () => {
    const host = message(
      String.raw`Energy: $E=mc^2$; cost: \$5.<br>$$\frac{a}{b}$$<code>$raw$</code>`,
    );

    renderMessageMath();

    expect(host.querySelectorAll('.katex')).toHaveLength(2);
    expect(host.querySelector('math[display="block"]')).not.toBeNull();
    expect(host.querySelector('math:not([display])')).not.toBeNull();
    expect(host.querySelector('code')?.textContent).toBe('$raw$');
    expect(host.textContent).toContain('$5');
  });

  it.each([
    [String.raw`before \(x^2\) after`, false],
    [String.raw`before \[x^2\] after`, true],
    ['before $x^2$ after', false],
    ['before $$x^2$$ after', true],
  ])('renders a formula embedded in prose: %s', (source, display) => {
    const host = message(source);
    renderMessageMath();
    expectRendered(host, display);
  });

  it('renders delimiters split into sibling Markdown paragraphs', () => {
    const host = message('<p>$$</p><p>E=mc^2</p><p>$$</p>');
    renderMessageMath();
    expectRendered(host);
  });

  it('renders formula-only Markdown code blocks but ignores code in mixed prose', () => {
    const formulaBlock = message('<pre><code>\\mathcal{Z}=\\int \\exp(x) dx</code></pre>');
    const mixed = message('Example: <code>$x^2$</code> is source.');

    renderMessageMath();

    expectRendered(formulaBlock);
    expect(mixed.querySelector('.katex')).toBeNull();
    expect(mixed.querySelector('code')?.textContent).toBe('$x^2$');
  });

  it('renders the path integral after repairing Markdown-consumed brace escapes', () => {
    const source = String.raw`\int \mathcal{D}\phi \exp\left{ i \int d^4x \sqrt{-g} \left[ \frac{1}{2}\partial_\mu \phi \partial^\mu \phi - \frac{1}{2}m^2 \phi^2 - \frac{\lambda}{4!}\phi^4 + \xi R \phi^2 \right] \right}`;
    const host = message(source);

    renderMessageMath();

    expect(host.querySelector('.katex-error')).toBeNull();
    expectRendered(host);
    expect(host.querySelector('annotation')?.textContent).toContain(String.raw`\right\}`);
  });

  it('repairs brace escapes inside a formula embedded in prose', () => {
    const host = message(String.raw`Result: $\left{ x + 1 \right}$ done.`);
    renderMessageMath();
    expect(host.querySelector('.katex-error')).toBeNull();
    expectRendered(host, false);
  });

  it.each([
    'const type=1',
    'foo_bar',
    '{680}',
    '普通聊天消息',
    String.raw`C:\Users\alice`,
    String.raw`\notACommand{x}`,
  ])('leaves non-formula messages untouched: %s', (source) => {
    const host = message(source);
    const before = host.innerHTML;
    renderMessageMath();
    expect(host.innerHTML).toBe(before);
    expect(host.querySelector('.katex')).toBeNull();
  });

  it('renders folded-session message bodies too', () => {
    const host = message('$$x^2$$', 'wk-fold-msg-text');
    renderMessageMath();
    expectRendered(host);
  });

  it('ignores matching-looking text outside Octo message bodies', () => {
    const host = message('$$x^2$$', 'some-other-element');
    renderMessageMath();
    expect(host.querySelector('.katex')).toBeNull();
  });

  it('limits a scoped pass to the supplied subtree', () => {
    const first = message('$$x^2$$');
    const wrapper = document.createElement('section');
    const second = document.createElement('div');
    second.className = 'wk-markdown';
    second.textContent = '$$y^2$$';
    wrapper.appendChild(second);
    document.body.appendChild(wrapper);

    renderMessageMath([wrapper]);

    expect(first.querySelector('.katex')).toBeNull();
    expectRendered(second);
  });

  it('is idempotent when the same message is scanned repeatedly', () => {
    const host = message('$$x^2$$');
    renderMessageMath();
    const rendered = host.innerHTML;

    renderMessageMath();

    expect(host.innerHTML).toBe(rendered);
    expect(host.querySelectorAll('.katex')).toHaveLength(1);
  });

  it('keeps malformed delimited source visible without throwing', () => {
    const host = message('broken: $\\frac{$');
    expect(() => renderMessageMath()).not.toThrow();
    expect(host.textContent).toContain('\\frac{');
  });

  it('does not enable trusted KaTeX links or HTML commands', () => {
    const host = message(String.raw`$$\href{https://example.com}{click}$$`);
    renderMessageMath();
    expect(host.querySelector('a[href]')).toBeNull();
  });
});
