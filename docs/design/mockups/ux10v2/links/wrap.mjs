// 개발용: 링크 페이지(본문 조각)를 실제 게시와 같은 뼈대로 감싸 _dev_<이름>.html로 만든다.
import fs from 'node:fs';
for (const f of process.argv.slice(2)) {
  const body = fs.readFileSync(f, 'utf8');
  const out = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n${body}\n</body></html>`;
  fs.writeFileSync(f.replace(/([^/]+)\.html$/, '_dev_$1.html'), out);
}
