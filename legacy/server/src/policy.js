// The privacy policy and terms as public pages (/privacy, /terms). The law asks
// for a policy anyone can read, and app stores ask for its address.
//
// The operator's own copy (EOUL_POLICY_DIR/privacy.md, terms.md) wins. Until it
// exists, the repository template is shown under a draft notice. {{NAME}} is
// filled from settings (operator name, contact, …); [[채울 칸: …]] marks what the
// operator still has to write, and keeps the page marked as a draft.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../policy-templates');
export const POLICY_PAGES = { privacy: '개인정보 처리방침', terms: '이용약관' };
const FIELDS = {
  OPERATOR_NAME: '운영자 이름(상호)',
  OPERATOR_EMAIL: '문의 이메일',
  PRIVACY_OFFICER: '개인정보 보호책임자 이름',
  BUSINESS_NUMBER: '사업자등록번호',
  EFFECTIVE_DATE: '시행일',
  COMMUNITY_CONTACT: '회원 코디 신고 연락처',
};
const BLANK = /\[\[채울 칸: ([^\]\n]+)\]\]/g;

export function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Inline marks on text that is already escaped. Links go only to https or mailto.
function inline(text) {
  return text
    .replace(BLANK, '<mark>[운영자가 채울 칸: $1]</mark>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(((?:https:\/\/|mailto:)[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
}
const line = (text) => inline(escapeHtml(text));

function list(lines) {
  let html = '', depth = 0;
  for (const row of lines) {
    const level = Math.min(Math.floor(/^ */.exec(row)[0].length / 2) + 1, depth + 1);
    if (level > depth) {
      html += '<ul>';
      depth++;
    } else {
      html += '</li>';
      for (; depth > level; depth--) html += '</ul></li>';
    }
    html += `<li>${line(row.replace(/^\s*[-*]\s+/, ''))}`;
  }
  html += '</li>';
  for (; depth > 1; depth--) html += '</ul></li>';
  return `${html}</ul>`;
}

function table(rows) {
  const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => line(cell.trim()));
  const hasHead = rows.length > 1 && /^\s*\|?\s*:?-{3,}/.test(rows[1]);
  const head = hasHead ? `<thead><tr>${cells(rows[0]).map((c) => `<th>${c}</th>`).join('')}</tr></thead>` : '';
  const body = (hasHead ? rows.slice(2) : rows).map((row) => `<tr>${cells(row).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="table"><table>${head}<tbody>${body}</tbody></table></div>`;
}

/** A small, escaping Markdown subset: headings, paragraphs, nested lists, tables, quotes, bold, code, links. */
export function renderMarkdown(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const starts = /^(#{1,4}\s|\s*\||\s*[-*]\s+|>)/;
  for (let i = 0; i < lines.length; ) {
    const text = lines[i];
    let heading;
    if (!text.trim()) i++;
    else if ((heading = /^(#{1,4})\s+(.*)$/.exec(text))) {
      out.push(`<h${heading[1].length}>${line(heading[2].trim())}</h${heading[1].length}>`);
      i++;
    } else if (/^\s*\|/.test(text)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      out.push(table(rows));
    } else if (/^\s*[-*]\s+/.test(text)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++]);
      out.push(list(items));
    } else if (/^>/.test(text)) {
      const quote = [];
      while (i < lines.length && /^>/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`);
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !starts.test(lines[i])) para.push(lines[i++].trim());
      out.push(`<p>${line(para.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

function fill(text, values) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (all, key) => {
    if (values[key] !== undefined && values[key] !== null && values[key] !== '') return String(values[key]).replace(/[[\]{}]/g, '');
    return Object.hasOwn(FIELDS, key) ? `[[채울 칸: ${FIELDS[key]}]]` : all;
  });
}

/** One policy document: its text with settings filled in, and whether the operator still has to finish it. */
export function policyDocument(name, { dir = null, values = {} } = {}) {
  if (!Object.hasOwn(POLICY_PAGES, name)) throw new Error(`unknown policy: ${name}`);
  const own = dir ? path.join(dir, `${name}.md`) : null;
  const fromOperator = !!own && fs.existsSync(own);
  const text = fill(fs.readFileSync(fromOperator ? own : path.join(TEMPLATES, `${name}.md`), 'utf8'), values);
  BLANK.lastIndex = 0;
  return { name, title: POLICY_PAGES[name], text, fromOperator, draft: !fromOperator || BLANK.test(text) };
}

const STYLE = `:root{color-scheme:light dark;--bg:#fff;--fg:#15191e;--muted:#5b6470;--line:#dfe3e8;--mark:#fff1b8}
@media (prefers-color-scheme:dark){:root{--bg:#111418;--fg:#eef1f4;--muted:#a3acb7;--line:#2c333c;--mark:#5a4700}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;word-break:keep-all;overflow-wrap:anywhere}
main{max-width:720px;margin:0 auto;padding:24px 16px 64px}h1{font-size:28px;line-height:1.3;margin:8px 0 16px}h2{font-size:20px;margin:36px 0 8px}h3{font-size:17px;margin:24px 0 4px}
ul{padding-left:1.25em}li{margin:2px 0}.table{overflow-x:auto;margin:12px 0}table{border-collapse:collapse;width:100%;min-width:600px;font-size:14px;line-height:1.55}
th,td{border:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}th{white-space:nowrap}mark{background:var(--mark);color:inherit;padding:0 2px}
blockquote{margin:12px 0;padding:4px 12px;border-left:3px solid var(--line);color:var(--muted)}code{font-size:.9em}a{color:inherit}
.draft{border:1px solid var(--line);background:var(--mark);padding:12px 14px;border-radius:8px}nav{color:var(--muted);font-size:14px;margin-bottom:8px}`;

/** The public HTML page for one document. */
export function policyPage(name, options) {
  const doc = policyDocument(name, options);
  const notice = doc.draft ? '<p class="draft" role="note"><strong>초안</strong> · 운영자가 아직 확정하지 않은 문서예요. 노란 칸은 운영자가 채워야 해요.</p>' : '';
  const nav = '<nav><a href="./">어울로 돌아가기</a> · <a href="privacy">개인정보 처리방침</a> · <a href="terms">이용약관</a></nav>';
  return {
    draft: doc.draft,
    html: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>어울 ${escapeHtml(doc.title)}</title><style>${STYLE}</style></head><body><main>${nav}${notice}${renderMarkdown(doc.text)}</main></body></html>`,
  };
}
