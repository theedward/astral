const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function page(message, home = false) {
  const success = message === 'You’re connected. Welcome home.';
  const title = home ? 'Your world. In order.' : success ? 'You’re signed in.' : message;
  const detail = home
    ? 'Your addons, keybindings and familiar interface. Ready when you are.'
    : success
      ? 'Return to Astral to continue with your setup.'
      : 'Return to Astral and choose Continue with Battle.net to try again.';
  return new Response(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(title)} · Astral</title>
<style>
:root{color-scheme:light dark;--bg:#fdfcf9;--text:#101114;--muted:#666970;--line:#10111425;--accent:#0057ff;--surface:#f2f1ed}
@media(prefers-color-scheme:dark){:root{--bg:#101114;--text:#f2f1ed;--muted:#a0a3ac;--line:#ffffff26;--accent:#527dff;--surface:#191b20}}
*{box-sizing:border-box}body{margin:0;min-height:100svh;background:var(--bg);color:var(--text);font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;padding:38px clamp(24px,7vw,110px);-webkit-font-smoothing:antialiased}.brand{display:flex;align-items:center;gap:14px;font-size:29px;font-weight:750;letter-spacing:-1.5px;padding-bottom:28px;border-bottom:1px solid var(--line)}.mark{position:relative;width:36px;height:36px;border-radius:50%;background:var(--accent);margin-left:8px}.mark:before{content:'';position:absolute;width:31px;height:31px;left:-9px;top:2px;border-radius:50%;background:var(--text);box-shadow:4px 0 var(--bg)}main{flex:1;display:flex;flex-direction:column;justify-content:center;max-width:1050px;padding:70px 0}.eyebrow{font-size:11px;letter-spacing:1.3px;color:var(--accent);margin:0 0 23px;font-weight:650}h1{font-size:clamp(58px,9vw,126px);letter-spacing:-.075em;line-height:.98;font-weight:780;margin:0 0 30px;max-width:1000px;text-wrap:balance}p.detail{color:var(--muted);max-width:540px;font-size:clamp(16px,2vw,20px);line-height:1.7;margin:0}.status{display:flex;align-items:center;gap:11px;margin-top:40px;font-size:13px;color:var(--text)}.status span{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;background:var(--accent);color:#fff;border-radius:50%;font-size:13px}.footnote{border-top:1px solid var(--line);padding-top:22px;margin:40px 0 0;color:var(--muted);font-size:12px;max-width:620px}footer{display:flex;justify-content:space-between;gap:20px;border-top:1px solid var(--line);padding-top:24px;color:var(--muted);font-size:11px}footer strong{color:var(--text);font-weight:550}@media(max-width:520px){body{padding:25px}.brand{font-size:25px}main{padding:65px 0}h1{font-size:59px}.eyebrow{font-size:10px}.status{font-size:12px}footer{font-size:10px}}
</style></head><body><header class="brand"><span class="mark" aria-hidden="true"></span>Astral</header><main><p class="eyebrow">${home ? 'YOUR ADDONS. YOUR SETUP.' : success ? 'BATTLE.NET CONNECTED' : 'CONNECTION NEEDS ATTENTION'}</p><h1 id="status-title">${escape(title)}</h1><p class="detail">${escape(detail)}</p><div class="status"><span aria-hidden="true">${success ? '✓' : '↗'}</span>${home ? 'Connect through the Astral desktop app' : success ? 'You can close this tab and return to Astral' : 'Your local setup is unchanged'}</div><p class="footnote">${home ? 'Manage your addons and carry your supported UI settings between computers.' : 'Signing in confirms your identity. Settings sync and restoration happen in the desktop app.'}</p></main><footer><strong>Astral</strong><span>Your world. In order.</span></footer></body></html>`,
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
