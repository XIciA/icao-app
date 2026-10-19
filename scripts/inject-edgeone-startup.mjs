import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve(process.env.ICAO_WEB_BOOT_OUTPUT ?? 'dist');
await mkdir(`${directory}/startup`, { recursive: true });
await copyFile('assets/images/startup-brand.png', `${directory}/startup/brand.png`);
let html = (await readFile(`${directory}/index.html`, 'utf8')).replace(/<html lang="[^"]*">/u, '<html lang="zh-CN">');
const css = `html,body{background:#FBFAF7}#icao-startup{position:fixed;inset:0;z-index:2147483646;overflow:hidden;background:#FBFAF7;display:flex;align-items:center;justify-content:center}#icao-startup img{width:320px;height:320px;max-width:none;flex-shrink:0;object-fit:contain}#icao-startup-hint{position:absolute;top:calc(50% + 163px);display:flex;flex-direction:column;align-items:center;gap:16px;color:#5D636F;font:12px/19px system-ui;opacity:0;animation:hint 0s 1.5s forwards}#icao-startup-hint i{width:19px;height:19px;border:2px solid #1F5ED933;border-top-color:#1F5ED9;border-radius:50%;animation:spin .9s linear infinite}@keyframes hint{to{opacity:1}}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#icao-startup-hint i{animation:none}}`;
const shell = '<div id="icao-startup" role="status" aria-label="正在打开"><img src="/startup/brand.png" alt="听你五个"><div id="icao-startup-hint"><i aria-hidden="true"></i><span>正在打开…</span></div></div>';
// Keep the HTML surface until the actual routed screen is mounted. React's own
// identical loading surface never gets exposed as a second page.
const js = `(function(){var s=document.getElementById('icao-startup'),r=document.getElementById('root'),done=false;function check(){if(done||!r.children.length||r.querySelector('[data-testid="global-loading-screen"]'))return;requestAnimationFrame(function(){if(done||r.querySelector('[data-testid="global-loading-screen"]'))return;done=true;o.disconnect();s.remove()})}window.addEventListener('error',function(e){if(done||!e.target||e.target.tagName!=='SCRIPT'||!(e.target.src||'').includes('/_expo/static/js/web/'))return;var h=document.getElementById('icao-startup-hint');h.style.animation='none';h.style.opacity='1';h.innerHTML='<span>暂时无法加载，请检查网络后重试。</span><button type="button" style="border:0;border-radius:13px;padding:12px 32px;background:#1F5ED9;color:white;cursor:pointer">重新尝试</button>';h.querySelector('button').onclick=function(){location.reload()}},true);var o=new MutationObserver(check);o.observe(r,{childList:true,subtree:true,attributes:true});check()})();`;
if (!html.includes('id="icao-startup"')) {
  html = html.replace('</head>', `<link rel="preload" as="image" href="/startup/brand.png"><style>${css}</style></head>`)
    .replace('<div id="root"></div>', `${shell}<div id="root"></div>`)
    .replace('</body>', `<script>${js}</script></body>`);
  await writeFile(`${directory}/index.html`, html);
}
if (!html.includes('id="icao-startup"') || !html.includes('global-loading-screen')) throw Error('startup_handoff_missing');
console.log('EdgeOne B startup shell injected; Vercel shell unchanged.');
