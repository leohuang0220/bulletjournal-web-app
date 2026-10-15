// 果果日記離線快取：頁面與圖示先存；資料由 Firebase 自己離線同步
const CACHE = 'guoguo-v16';
const CORE = ['./', './index.html', './config.js', './money.js', './app.webmanifest', './icons/b-icon-192.png', './icons/b-icon-512.png', './icons/b-apple-touch-icon.png', './icons/face.jpg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isStatic = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'].includes(url.hostname);
  if (!sameOrigin && !isStatic) return; // Firebase / Gemini 走網路
  if (req.mode === 'navigate' || url.pathname.endsWith('/config.js') || url.pathname.endsWith('/money.js') || url.pathname.endsWith('.webmanifest')) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(req.mode === 'navigate' ? './index.html' : req, c)); return r; })
      .catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req)));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});

// 背景定期檢查疫苗／健檢提醒（Android Chrome 已安裝的 App；頻率由瀏覽器決定）
function ymd(t){const d=new Date(t+8*3600e3);return d.toISOString().slice(0,10)} // 台灣時間
async function checkRem(){
  const c=await caches.open('guoguo-rem'); const r=await c.match('./__rem.json'); if(!r) return;
  const {name,items}=await r.json(); const lr=await c.match('./__remlog.json'); const log=lr?await lr.json():{};
  const today=ymd(Date.now());
  for(const x of items||[]){
    const left=Math.round((Date.parse(x.date)-Date.parse(today))/864e5); const k=x.id+'@'+x.date;
    if(left<0||left>x.remind||log[k]===today) continue;
    await self.registration.showNotification(`${name}・${left===0?'今天':left===1?'明天':left+' 天後'}：${x.t}`,{body:`預約日期 ${x.date.replace(/-/g,'/')}，打開果果日記查看或標記完成。`,tag:k,icon:'icons/b-icon-192.png',badge:'icons/b-icon-192.png',data:{url:'./index.html#care'}});
    log[k]=today;
  }
  await c.put('./__remlog.json',new Response(JSON.stringify(log)));
}
self.addEventListener('periodicsync',e=>{ if(e.tag==='gg-remind') e.waitUntil(checkRem()) });
self.addEventListener('notificationclick',e=>{
  e.notification.close(); const url=new URL((e.notification.data&&e.notification.data.url)||'./index.html#care',self.registration.scope).href;
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{ for(const w of ws){ if('focus' in w){ w.navigate&&w.navigate(url).catch(()=>{}); return w.focus() } } return clients.openWindow(url) }));
});
