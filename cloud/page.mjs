const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function page(message, home = false) {
  const success = message === 'You’re connected. Welcome home.';
  const title = home ? 'Astral' : success ? 'You’re signed in.' : message;
  const detail = home
    ? 'Open Astral to connect your Battle.net account.'
    : success
      ? 'Return to Astral. You can close this tab.'
      : 'Return to Astral and select Connect Battle.net to try again.';
  return new Response(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(title)} · Astral</title>
<style>
:root{color-scheme:light dark;--bg:#fdfcf9;--text:#101114;--muted:#666970;--line:#10111428;--accent:#0057ff;--error:#b42318}
@media(prefers-color-scheme:dark){:root{--bg:#101114;--text:#f2f1ed;--muted:#a0a3ac;--line:#ffffff20;--accent:#527dff;--error:#f18e8e}}
*{box-sizing:border-box}
body{margin:0;min-height:100svh;background:var(--bg);color:var(--text);font:16px/1.5 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column}
header{height:78px;padding:0 clamp(24px,4vw,56px);display:flex;align-items:center;gap:11px;border-bottom:1px solid var(--line);flex-shrink:0}
.brand{font-size:27px;font-weight:760;letter-spacing:-1.5px}
.mark{position:relative;display:inline-block;width:35px;height:35px;border-radius:50%;background:var(--accent);flex-shrink:0}
.mark::before{content:'';position:absolute;width:30px;height:30px;left:-8px;top:2px;border-radius:50%;background:var(--text);box-shadow:4px 0 0 var(--bg)}
main{flex:1;display:flex;align-items:center;justify-content:center;padding:64px 24px 120px}
.result{width:100%;max-width:600px}
.symbol{width:44px;height:44px;color:var(--accent);margin-bottom:28px}
.symbol.error{color:var(--error)}
h1{font-size:clamp(36px,6vw,58px);font-weight:750;letter-spacing:-.055em;line-height:1.08;margin:0 0 20px;text-wrap:balance;overflow-wrap:anywhere}
p{margin:0;color:var(--muted);font-size:17px;line-height:1.6;max-width:480px}
@media(max-width:520px){main{justify-content:flex-start;padding:52px 24px 88px}.symbol{margin-bottom:24px}p{font-size:16px}}
</style></head><body><header><span class="mark" aria-hidden="true"></span><span class="brand">Astral</span></header><main><section class="result" aria-labelledby="status-title">${home ? '' : `<svg class="symbol${success ? '' : ' error'}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="20"/>${success ? '<path d="m15 24 6 6 12-12"/>' : '<path d="M24 14v12m0 8h.01"/>'}</svg>`}<h1 id="status-title">${escape(title)}</h1><p>${escape(detail)}</p></section></main></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html;charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
