// 果果日記：每天早上檢查疫苗／健檢提醒，寄 Email 並推播 LINE。
// 資料來源：families/{fid}/meta/remind（由 App 自動寫入）。
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import webpush from 'web-push';

const env = process.env;
const TEST = env.TEST_MODE === 'true';
const APP_URL = 'https://leohuang0220.github.io/bulletjournal-web-app/guoguo/index.html?openExternalBrowser=1#care';

if (!env.FIREBASE_SA) { console.error('缺少 FIREBASE_SA'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(env.FIREBASE_SA)) });
const db = admin.firestore();

const twToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const diff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const slash = d => d.replace(/-/g, '/');
const when = n => n === 0 ? '今天' : n === 1 ? '明天' : n > 1 ? `${n} 天後` : `已過 ${-n} 天`;

const mailer = env.GMAIL_USER && env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD.replace(/\s/g, '') } })
  : null;

async function sendLine(text) {
  if (!env.LINE_TOKEN) return 'skip';
  const r = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.LINE_TOKEN },
    body: JSON.stringify({ messages: [{ type: 'text', text: text.slice(0, 4900) }] })
  });
  if (!r.ok) throw new Error('LINE ' + r.status + ' ' + (await r.text()));
  return 'ok';
}
async function sendMail(to, subject, text) {
  if (!mailer || !to.length) return 'skip';
  await mailer.sendMail({ from: `果果日記 <${env.GMAIL_USER}>`, to: to.join(','), subject, text });
  return 'ok';
}

// 每月 1 號附上個月花費月報（families/{fid}/expenses）
const CATS = { milk: '奶粉餵養', diaper: '尿布濕巾', cloth: '衣物鞋襪', bath: '洗沐保養', food: '副食品', med: '醫療保健', gear: '大型用品', toy: '玩具書籍', care: '托育保母', event: '紀念慶祝', other: '其他' };
const money = n => '$' + Math.round(+n || 0).toLocaleString('en-US');
function prevMonth(ym) { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7); }
async function monthReport(famRef, name) {
  const ym = prevMonth(twToday().slice(0, 7)), pym = prevMonth(ym);
  const get = async m => (await famRef.collection('expenses').where('d', '>=', m + '-01').where('d', '<=', m + '-31').get()).docs.map(d => d.data());
  const list = await get(ym), cnt = list.filter(e => !e.gift && +e.amt > 0);
  if (!list.length) return null;
  const tot = cnt.reduce((s, e) => s + +e.amt, 0), prev = (await get(pym)).filter(e => !e.gift && +e.amt > 0).reduce((s, e) => s + +e.amt, 0);
  const by = {}; cnt.forEach(e => { by[e.cat || 'other'] = (by[e.cat || 'other'] || 0) + +e.amt; });
  const meta = (await famRef.collection('meta').doc('money').get()).data() || {}, bud = +meta.budget || 0;
  const label = `${+ym.slice(5)}月`, gifts = list.filter(e => e.gift).length;
  const rows = Object.keys(by).sort((a, b) => by[b] - by[a]).map(k => `・${CATS[k] || '其他'} ${money(by[k])}（${Math.round(by[k] / tot * 100)}%）`);
  const text = `📊 ${name} ${label}花費月報\n共 ${money(tot)}・${cnt.length} 筆` + (prev ? `（上個月 ${money(prev)}，${tot >= prev ? '多' : '少'} ${money(Math.abs(tot - prev))}）` : '') +
    (bud ? `\n預算 ${money(bud)}，${tot > bud ? '超出 ' + money(tot - bud) : '省下 ' + money(bud - tot)}` : '') + (rows.length ? '\n\n' + rows.join('\n') : '') +
    (gifts ? `\n🎁 收到禮物 ${gifts} 件` : '') + `\n\n圖表與 AI 分析：${APP_URL.replace('#care', '#money')}`;
  return { label, text };
}

// ── 每日摘要推播（Web Push）：金鑰存在 Firestore server/vapid（App 讀不到），公鑰發到各家 meta/push ──
const ONLY_PUSH = env.ONLY_PUSH === 'true';
async function vapidKeys() {
  const ref = db.collection('server').doc('vapid'), s = await ref.get();
  if (s.exists) return s.data();
  const k = webpush.generateVAPIDKeys(); await ref.set({ ...k, created: Date.now() }); console.log('已產生推播金鑰'); return k;
}
const V = await vapidKeys();
webpush.setVapidDetails('mailto:' + (env.GMAIL_USER || 'guoguo.diary@gmail.com'), V.publicKey, V.privateKey);
const H = 3600e3, D = 24 * H;
const dur = ms => { const m = Math.round(ms / 6e4); return m >= 60 ? `${Math.floor(m / 60)}小時${m % 60 ? (m % 60) + '分' : ''}` : `${m}分`; };
async function daySummary(famRef, name) {
  const t0 = Date.parse(twToday() + 'T00:00:00+08:00') - D, t1 = t0 + D;   // 台灣時間「昨天」
  const logs = (await famRef.collection('logs').where('t', '>=', t0 - D).where('t', '<', t1).get()).docs.map(d => d.data());
  const inD = logs.filter(l => l.t >= t0 && l.t < t1), of = t => inD.filter(l => l.type === t);
  const sum = (a, f) => a.reduce((s, l) => s + (+f(l) || 0), 0);
  const bm = sum(of('bmilk'), l => l.ml), fm = sum(of('formula'), l => l.ml), bottles = of('bmilk').length + of('formula').length;
  const pump = sum(of('pump'), l => (+l.ml || 0) + (+l.left || 0) + (+l.right || 0)), pumpN = of('pump').length;
  const pee = of('pee').length, poop = of('poop').length, breast = of('breast').length;
  // 尿布片數：尿尿和便便相隔 20 分鐘內算同一片（和 App 相同規則）
  const ev = inD.filter(l => l.type === 'pee' || l.type === 'poop').sort((a, b) => a.t - b.t), used = new Set(); let both = 0;
  ev.filter(l => l.type === 'poop').forEach(p => { const m = ev.find(x => x.type === 'pee' && !used.has(x) && Math.abs(x.t - p.t) <= 20 * 60e3); if (m) { used.add(m); both++ } });
  const diapers = ev.length - both;
  const sleep = logs.filter(l => l.type === 'sleep').reduce((s, l) => s + Math.max(0, Math.min(l.end || t1, t1) - Math.max(l.t, t0)), 0);
  if (!inD.length && !sleep) return null;
  const md = new Date(t0 + 8 * H), label = `${md.getUTCMonth() + 1}/${md.getUTCDate()}`;
  const lines = [
    `🍼 奶量 ${bm + fm} ml（瓶餵母乳 ${bm}・配方 ${fm}，${bottles} 次${breast ? `，親餵 ${breast} 次` : ''}）`,
    pumpN ? `🤱 擠奶 ${pump} ml（${pumpN} 次）` : null,
    `🧷 尿布 ${diapers} 片（尿 ${pee}・便 ${poop}）`,
    sleep ? `😴 睡眠 ${dur(sleep)}` : null,
    of('sick').length ? `🤒 不舒服 ${of('sick').length} 筆` : null,
  ].filter(Boolean);
  return { title: `${name} 昨天（${label}）摘要`, body: lines.join('\n'), short: `奶量 ${bm + fm}ml・擠奶 ${pump}ml・尿布 ${diapers}片・睡 ${dur(sleep)}` };
}
async function pushSummary(f, name) {
  await f.ref.collection('meta').doc('push').set({ publicKey: V.publicKey }, { merge: true });
  const subs = await f.ref.collection('push').get();
  if (subs.empty) return 'no-subs';
  const sm = await daySummary(f.ref, name);
  const msg = sm || { title: `${name} 昨天沒有記錄`, body: '記得在果果日記記下餵奶、尿布和睡眠，明天就會收到摘要。' };
  const payload = JSON.stringify({ title: msg.title, body: msg.body, tag: 'gg-daily', url: './index.html#sum' });
  let ok = 0, gone = 0;
  for (const d of subs.docs) {
    try { await webpush.sendNotification(d.data().sub, payload, { TTL: 12 * 3600 }); ok++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { await d.ref.delete(); gone++; } else console.error('推播失敗', e.statusCode, e.body || e.message); }
  }
  await f.ref.collection('meta').doc('push').set({ lastSummary: { t: Date.now(), ok, gone, text: msg.title } }, { merge: true });
  return `sent ${ok}${gone ? `, removed ${gone}` : ''}`;
}

const today = twToday();
const fams = await db.collection('families').get();
let lineParts = [];
for (const f of fams.docs) {
  const fam = f.data();
  const rs = await f.ref.collection('meta').doc('remind').get();
  const baby = (await f.ref.collection('meta').doc('baby').get()).data() || {};
  try { console.log(f.id, '每日摘要推播:', await pushSummary(f, baby.name || (rs.exists && rs.data().name) || '寶寶')); } catch (e) { console.error(f.id, '推播錯誤', e.message); }
  if (ONLY_PUSH) continue;
  if (!rs.exists) { console.log(f.id, '沒有提醒資料（請打開一次 App）'); continue; }
  const { name = '寶寶', items = [] } = rs.data();
  const due = items.map(x => ({ ...x, left: diff(x.date, today) }))
    .filter(x => (x.left >= 0 && x.left <= (x.remind ?? 3)) || (x.left < 0 && x.left >= -3))
    .sort((a, b) => a.left - b.left);
  const report = (today.slice(8) === '01' || env.MONTH_REPORT === 'true') ? await monthReport(f.ref, name) : null;
  if (!due.length && !report && !TEST) { console.log(f.id, '今天沒有要提醒的'); await rs.ref.set({ lastRun: Date.now(), lastSent: '' }, { merge: true }); continue; }
  const lines = due.map(x => `・${when(x.left)}（${slash(x.date)}）${x.t}${x.left < 0 ? '　→ 打過記得在 App 打勾' : ''}`);
  const parts = [];
  if (due.length) parts.push(`${name} 的疫苗／健檢提醒（${slash(today)}）\n\n${lines.join('\n')}\n\n打開果果日記查看或標記完成：\n${APP_URL}`);
  if (report) parts.push(report.text);
  if (!parts.length) parts.push(`【測試】果果日記雲端提醒設定成功！\n之後有要提醒的項目，每天早上會自動通知。\n${APP_URL}`);
  const body = parts.join('\n\n────────\n\n');
  const subject = due.length ? `【果果日記】${name}・${when(due[0].left)}：${due[0].t}${due.length > 1 ? ` 等 ${due.length} 項` : ''}${report ? '＋花費月報' : ''}`
    : report ? `【果果日記】${name} ${report.label}花費月報` : '【果果日記】雲端提醒測試';
  const to = (fam.emails || []).filter(Boolean);
  let mail = 'fail';
  try { mail = await sendMail(to, subject, body); } catch (e) { console.error('Email 失敗', e.message); }
  lineParts.push(body);
  await rs.ref.set({ lastRun: Date.now(), lastSent: subject, lastMail: mail }, { merge: true });
  console.log(f.id, '寄出', subject, 'mail:', mail, 'to', to.length, '人');
}
// LINE 官方帳號是你們專用的，所以用群發（只有加好友的人會收到）
if (lineParts.length) {
  try { console.log('LINE:', await sendLine(lineParts.join('\n\n────────\n\n'))); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
