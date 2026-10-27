// Markdown.tsx — AI 回复的 Markdown 渲染（marked + highlight.js + DOMPurify）
//
// 安全策略（渲染的是模型输出，不可信内容）：
// 1. marked renderer 覆写 html token → 直接丢弃 markdown 里的原始 HTML
// 2. 代码块经 hljs.highlight/highlightAuto 转义后输出
// 3. 整体再过 DOMPurify 消毒（剥 script/on* 属性/javascript: 链接）
// 4. 代码复制按钮用事件委托 + encodeURIComponent 的 data-code，避免引号断裂
import { useMemo, useCallback } from 'react';
import { marked } from 'marked';
// hljs 按需注册（全量 import 会让 bundle 多 ~600KB）；覆盖常见语言，
// 未命中时 highlightAuto 只在已注册语言里猜
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdownLang from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import diff from 'highlight.js/lib/languages/diff';
import DOMPurify from 'dompurify';
import 'highlight.js/styles/github.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('vue', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdownLang);
hljs.registerLanguage('md', markdownLang);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('java', java);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('diff', diff);

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    // markdown 里的原始 HTML 一律丢弃（模型输出不可信；要展示的结构用 markdown 语法写）
    html() { return ''; },

    code({ text, lang }: { text: string; lang?: string }) {
      const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
      let highlighted: string;
      let label = language || 'text';
      try {
        if (language && hljs.getLanguage(language)) {
          highlighted = hljs.highlight(text, { language }).value;
        } else {
          const auto = hljs.highlightAuto(text);
          highlighted = auto.value;
          if (auto.language) label = `auto · ${auto.language}`;
        }
      } catch {
        highlighted = esc(text);
      }
      return (
        `<div class="md-code">` +
        `<div class="md-code-bar">` +
        `<span class="md-code-lang">${esc(label)}</span>` +
        `<button class="md-code-copy" type="button" data-code="${encodeURIComponent(text)}">复制</button>` +
        `</div>` +
        `<pre><code class="hljs">${highlighted}</code></pre>` +
        `</div>`
      );
    },

    // 行内 code 加类名（与 hljs 的 .hljs 区分，单独配色）
    codespan({ text }: { text: string }) {
      return `<code class="md-ic">${esc(text)}</code>`;
    },

    // 外链统一新窗口 + noopener
    link({ href, title, text }: { href: string; title?: string | null; text: string }) {
      const t = title ? ` title="${esc(title)}"` : '';
      return `<a href="${esc(href)}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

function renderMarkdown(src: string): string {
  const raw = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

export default function Markdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);

  // 代码块复制按钮：事件委托（注入的 HTML 无法直接绑 React 事件）
  const onClick = useCallback((e: React.MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.md-code-copy');
    if (!btn) return;
    const code = decodeURIComponent(btn.dataset.code || '');
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = '已复制 ✓';
      setTimeout(() => { btn.textContent = '复制'; }, 1500);
    }).catch(() => {
      btn.textContent = '复制失败';
      setTimeout(() => { btn.textContent = '复制'; }, 1500);
    });
  }, []);

  return (
    <div
      className="md"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
