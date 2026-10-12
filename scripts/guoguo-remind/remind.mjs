// 果果日記：每天早上檢查疫苗／健檢提醒，寄 Email 並推播 LINE。
// 資料來源：families/{fid}/meta/remind（由 App 自動寫入）。
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';

const env = process.env;
const TEST = env.TEST_MODE === 'true';
const APP_URL = 'https://leohuang0220.github.io/bulletjournal-web-app/guoguo/index.html#care';

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

const today = twToday();
const fams = await db.collection('families').get();
let lineParts = [];
for (const f of fams.docs) {
  const fam = f.data();
  const rs = await f.ref.collection('meta').doc('remind').get();
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
