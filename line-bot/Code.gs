/**
 * 果果日記 LINE 小助手（Google Apps Script）
 * 傳文字或照片給 LINE 官方帳號 → 自動記帳、分類、查詢，也能記餵奶尿布。
 * 資料直接寫進果果日記的 Firebase（guoguo-diary），App 會即時同步。
 *
 * 指令範例：
 *   尿布 699 / 奶粉 2 罐 1580 好市多 / 阿嬤送推車 / 老婆付 掛號 150
 *   （傳發票、收據、網購訂單截圖）
 *   本月 / 上個月 / 今天 / 尿布這個月花多少 / 今天喝多少奶
 *   配方奶 120 / 10 點喝母乳 90 / 便便 黃色 / 睡了 / 起床 / 體溫 37.8
 *   撤銷 / 說明
 *
 * 「專案設定 → 指令碼屬性」需要：LINE_TOKEN（Messaging API 的 Channel access token）
 * 選用：FIREBASE_SA（服務帳戶 JSON；不填就用部署者自己的 Google 帳號權限）
 */
const PROJECT = 'guoguo-diary';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const APP_URL = 'https://leohuang0220.github.io/bulletjournal-web-app/guoguo/index.html';
const TZ = 'Asia/Taipei';

const CATS = {
  milk: '奶粉餵養', diaper: '尿布濕巾', cloth: '衣物鞋襪', bath: '洗沐保養', food: '副食品', med: '醫療保健',
  gear: '大型用品', toy: '玩具書籍', care: '托育保母', event: '紀念慶祝', other: '其他'
};
const KW = [
  ['med', /看診|掛號|診所|醫院|疫苗|藥|益生菌|維他命|維生素|D3|魚肝油|體溫計|吸鼻|健檢|門診|耳溫槍/],
  ['milk', /奶粉|奶瓶|奶嘴|母乳袋|溫奶|消毒鍋|吸乳|擠乳|集乳|奶瓶刷|調乳|哺乳/],
  ['diaper', /尿布|濕紙巾|濕巾|隔尿|尿褲|拉拉褲|尿墊/],
  ['food', /米精|米餅|副食|果泥|食物泥|餐具|餐椅|調理機|米粉|寶寶粥|零食/],
  ['bath', /沐浴|洗髮|乳液|乳霜|護膚|屁屁膏|護臀|洗衣|澡盆|浴|指甲|棉花棒|防蚊|紗布巾|洗碗|奶瓶清潔/],
  ['cloth', /衣|褲|包巾|帽|襪|鞋|連身|兔裝|肚衣|圍兜|口水巾|睡袋|外套|洋裝/],
  ['gear', /推車|汽座|嬰兒床|床墊|背巾|揹巾|腰凳|搖椅|安撫椅|圍欄|遊戲墊|監視器|家具|收納|澡架|尿布台|汽車座椅/],
  ['toy', /玩具|繪本|書|積木|搖鈴|固齒|安撫巾|健力架|布偶|娃娃/],
  ['care', /保母|托嬰|托育|臨托|月嫂|月子/],
  ['event', /滿月|彌月|收涎|抓周|攝影|寫真|禮盒|油飯|蛋糕|紅包|周歲|週歲/],
];
const LOGN = { breast: '親餵母乳', bmilk: '瓶餵母乳', formula: '配方奶', pump: '擠奶', pee: '尿尿', poop: '便便', sleep: '睡覺', temp: '體溫', mood: '寶寶狀態', solid: '副食品', med: '用藥' };
const POOP = { yellow: '黃色', mustard: '芥末黃', green: '綠色', brown: '褐色', pale: '淡黃／灰白', black: '黑色', red: '帶血絲' };
const HELP = '我是果果日記小助手 🍑\n\n【記帳】\n・尿布 699\n・奶粉 2 罐 1580 好市多\n・阿嬤送推車（不算花費）\n・直接傳發票、收據、網購訂單截圖\n\n【查詢】\n・本月、上個月、今年\n・尿布這個月花多少\n・今天（果果今天喝多少、尿布幾次）\n\n【記錄果果】\n・配方奶 120、10 點母乳 90\n・尿尿、便便 黃色、睡了、起床、體溫 37.8\n\n記錯了傳「撤銷」。\n打開 App：' + APP_URL;

/* ───────── 入口 ───────── */
function doGet() { return ContentService.createTextOutput('果果日記 LINE 小助手運作中'); }
function doPost(e) {
  const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  const cache = CacheService.getScriptCache();
  (body.events || []).forEach(function (ev) {
    if (ev.webhookEventId) { if (cache.get('ev' + ev.webhookEventId)) return; cache.put('ev' + ev.webhookEventId, '1', 600); }
    try { handle(ev); } catch (err) {
      console.error(err && err.stack || err);
      try { reply(ev, '小助手出了點問題：' + String(err && err.message || err).slice(0, 120) + '\n請稍後再試，或直接在 App 記錄。'); } catch (_) {}
    }
  });
  return ContentService.createTextOutput('ok');
}

function handle(ev) {
  if (ev.type === 'follow') return reply(ev, '歡迎！請先在果果日記 App「設定 → LINE 小助手」按「產生綁定碼」，再傳「綁定 123456」給我。\n\n' + HELP);
  if (ev.type !== 'message' || !ev.source || !ev.source.userId) return;
  const uid = ev.source.userId, msg = ev.message;
  const text = msg.type === 'text' ? String(msg.text || '').trim() : '';
  const bind = text.match(/^綁定\s*(\d{6})$/);
  if (bind) return doBind(ev, uid, bind[1]);
  const ctx = loadCtx(uid);
  if (!ctx) return reply(ev, '還沒綁定喔！請在果果日記 App「設定 → LINE 小助手」按「產生綁定碼」，然後傳「綁定 123456」（換成你的號碼）。');
  if (msg.type === 'image') return doImage(ev, ctx);
  if (msg.type !== 'text') return reply(ev, '目前可以傳文字，或發票、訂單截圖給我喔！');
  if (/^(說明|help|\?|？|怎麼用|指令)$/i.test(text)) return reply(ev, HELP);
  if (/^(撤銷|復原|取消|刪掉剛剛|刪除剛剛|undo)$/i.test(text)) return doUndo(ev, ctx);
  const q = quickQuery(text);
  if (q) return doQuery(ev, ctx, q);
  const p = parseText(text, ctx);
  if (p.kind === 'query' && p.query) return doQuery(ev, ctx, p.query);
  const out = [];
  let ids = { expenses: [], logs: [] };
  if (p.expenses && p.expenses.length) { const r = saveExpenses(ctx, p.expenses, 'line'); ids.expenses = r.ids; out.push(r.text); }
  if (p.logs && p.logs.length) { const r = saveLogs(ctx, p.logs); ids.logs = r.ids; if (r.text) out.push(r.text); }
  if (!out.length) return reply(ev, (p.reply ? p.reply + '\n\n' : '我看不太懂這句 🙈\n') + '記帳可以傳「尿布 699」，記錄果果可以傳「配方奶 120」，傳「說明」看全部用法。');
  remember(uid, ids);
  reply(ev, out.join('\n\n') + '\n\n記錯了傳「撤銷」');
}

/* ───────── 綁定 ───────── */
function doBind(ev, uid, code) {
  const fams = fsQuery('', 'families', [['lineCode', 'EQUAL', code]], null, 2);
  const f = fams[0];
  if (!f || Date.now() - (+f.data.lineCodeAt || 0) > 30 * 60e3) return reply(ev, '綁定碼不對或已過期（30 分鐘有效）。請在 App 重新產生一組。');
  const name = lineName(uid) || 'LINE 使用者';
  fsPatch('families/' + f.id, { lineUsers: { [uid]: { name: name, at: Date.now() } } }, ['lineUsers.' + uid]);
  fsPatch('lineUsers/' + uid, { fid: f.id, name: name, at: Date.now() });
  reply(ev, '綁定成功！' + name + ' 之後記的帳都會進果果日記 🎉\n\n' + HELP);
}
function loadCtx(uid) {
  const lu = fsGet('lineUsers/' + uid);
  if (!lu || !lu.fid) return null;
  const fam = fsGet('families/' + lu.fid);
  if (!fam || !fam.lineUsers || !fam.lineUsers[uid]) return null; // 在 App 被解除了
  const baby = fsGet('families/' + lu.fid + '/meta/baby') || {};
  const money = fsGet('families/' + lu.fid + '/meta/money') || {};
  return { uid: uid, fid: lu.fid, fam: fam, baby: baby, money: money, name: (fam.lineUsers[uid].name || lu.name || 'LINE'), base: 'families/' + lu.fid };
}
function remember(uid, ids) { fsPatch('lineUsers/' + uid, { last: { expenses: ids.expenses || [], logs: ids.logs || [], at: Date.now() } }, ['last']); }
function doUndo(ev, ctx) {
  const lu = fsGet('lineUsers/' + ctx.uid) || {}, l = lu.last;
  if (!l || Date.now() - (+l.at || 0) > 24 * 3600e3 || !((l.expenses || []).length + (l.logs || []).length)) return reply(ev, '沒有可以撤銷的記錄（只能撤銷 24 小時內、你在 LINE 記的最後一次）。其他的請到 App 修改。');
  (l.expenses || []).forEach(function (id) { fsDelete(ctx.base + '/expenses/' + id); });
  (l.logs || []).forEach(function (id) { fsDelete(ctx.base + '/logs/' + id); });
  fsPatch('lineUsers/' + ctx.uid, { last: { expenses: [], logs: [], at: 0 } }, ['last']);
  reply(ev, '已撤銷剛剛的 ' + ((l.expenses || []).length + (l.logs || []).length) + ' 筆記錄 ↩️');
}

/* ───────── 文字理解 ───────── */
function quickQuery(t) {
  t = t.replace(/[？?！!。\s]/g, '');
  if (/^(本月|這個月|這月|本月花費|這個月花多少|這個月花了多少|月報)$/.test(t)) return { what: 'spend', range: 'month' };
  if (/^(上個月|上月|上個月花費)$/.test(t)) return { what: 'spend', range: 'lastmonth' };
  if (/^(今年|今年花費)$/.test(t)) return { what: 'spend', range: 'year' };
  if (/^(本週|這週|這禮拜)$/.test(t)) return { what: 'spend', range: 'week' };
  if (/^(今天|今日|今天狀況|今天果果)$/.test(t)) return { what: 'baby', range: 'today' };
  if (/^(昨天)$/.test(t)) return { what: 'baby', range: 'yesterday' };
  return null;
}
function parseText(text, ctx) {
  const now = new Date();
  const prompt = '你是「果果日記」LINE 小助手，幫台灣新手爸媽把一句話轉成資料。現在是 ' + Utilities.formatDate(now, TZ, 'yyyy-MM-dd HH:mm（EEE）') +
    '，傳訊息的人叫「' + ctx.name + '」，寶寶叫「' + (ctx.baby.name || '寶寶') + '」。\n' +
    '判斷這句話是哪一種：\n' +
    '1. expense 記帳：買東西、付錢（有金額，或「某某送的」禮物）。像「尿布 699」「奶粉兩罐1580好市多」「阿嬤送推車」「老婆付 掛號150」。\n' +
    '   每個品項一筆：item 簡短品名、amt 金額整數（禮物給 0）、qty 數量（沒寫就 1）、cat 分類代碼（milk 奶粉餵養／diaper 尿布濕巾／cloth 衣物鞋襪／bath 洗沐保養／food 副食品／med 醫療保健／gear 大型用品／toy 玩具書籍／care 托育保母／event 紀念慶祝／other 其他）、shop 店家、date YYYY-MM-DD（「昨天」等要換算，沒說就今天）、gift 是否別人送的、giver 送的人、payer 付錢的人（「老婆付」「媽媽付的」照寫，沒說留空）。\n' +
    '2. log 記錄寶寶：喝奶、尿布、睡覺、體溫、吃副食品、吃藥、狀態。注意「配方奶 120」「喝了 90」是喝奶量（ml），「奶粉 899」才是買東西。\n' +
    '   type 只能是 breast(親餵，用 leftMin/rightMin 或 min 分鐘) bmilk(瓶餵母乳 ml) formula(配方奶 ml) pump(擠奶 ml) pee poop sleep(開始睡) wake(醒來，結束最近一次睡眠) temp(體溫 c) solid(副食品 food/qty) med(用藥 drug/dose) mood(狀態 tags)。\n' +
    '   poop 的 color 只能是 yellow mustard green brown pale black red，tex 只能是 水狀 稀糊 軟糊 條狀 硬粒；pee/poop 的 amt 只能是 少 中 多。「換尿布 有尿有便」要拆成 pee 和 poop 兩筆。\n' +
    '   mood 的 tags 從這些選：開心 安穩 哭鬧 難安撫 吐奶 溢奶 打嗝 脹氣 紅屁屁 鼻塞 咳嗽 黃疸。\n' +
    '   time 為 HH:MM（「10點」→10:00，「半小時前」換算），沒說就留空；date 沒說留空。其他補充放 note。\n' +
    '3. query 查詢：問花多少錢（what=spend）或寶寶喝多少、尿布幾次、睡多久（what=baby）。range 只能是 today yesterday week month lastmonth year all；cat 是要查的分類代碼（沒有就空）。\n' +
    '4. other：都不是，用 reply 回一句簡短友善的話。\n' +
    '只回覆 JSON：{"kind":"expense|log|query|other","expenses":[],"logs":[],"query":{"what":"","range":"","cat":""},"reply":""}\n' +
    '這句話：' + text;
  const r = gemini(ctx.fam, [{ text: prompt }]);
  if (r && r.kind) return r;
  return fallbackParse(text);
}
function fallbackParse(t) { // 沒有 Gemini 金鑰或 AI 失敗時的簡單規則
  let m;
  if ((m = t.match(/^(配方奶?|母乳|瓶餵母乳?|瓶餵)\s*(\d{2,3})\s*(ml|cc|毫升)?$/i))) return { kind: 'log', logs: [{ type: /配方/.test(m[1]) ? 'formula' : 'bmilk', ml: +m[2] }] };
  if (/^(尿尿|小便|濕尿布|換尿布)$/.test(t)) return { kind: 'log', logs: [{ type: 'pee' }] };
  if (/^(便便|大便|拉屎)$/.test(t)) return { kind: 'log', logs: [{ type: 'poop' }] };
  if (/^(睡了|睡著了|入睡)$/.test(t)) return { kind: 'log', logs: [{ type: 'sleep' }] };
  if (/^(起床|醒了|睡醒)$/.test(t)) return { kind: 'log', logs: [{ type: 'wake' }] };
  if ((m = t.match(/^體溫\s*(3\d(?:\.\d)?)$/))) return { kind: 'log', logs: [{ type: 'temp', c: +m[1] }] };
  if ((m = t.match(/^(.+?)\s*[\$＄]?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(元|塊)?(?:\s+(.+))?$/))) return { kind: 'expense', expenses: [{ item: m[1].trim(), amt: +m[2].replace(/,/g, ''), shop: m[4] || '' }] };
  return { kind: 'other' };
}

/* ───────── 寫入 ───────── */
function guessCat(s) { s = String(s || ''); for (var i = 0; i < KW.length; i++) if (KW[i][1].test(s)) return KW[i][0]; return 'other'; }
function today() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function money(n) { return '$' + Math.round(+n || 0).toLocaleString('en-US'); }
function saveExpenses(ctx, list, src, shopAll, dateAll) {
  const grp = 'g' + Date.now(), ids = [], lines = [], td = today();
  let sum = 0;
  list.forEach(function (x) {
    if (!x || (!x.item && !x.amt)) return;
    const gift = !!x.gift, amt = gift ? 0 : Math.max(0, Math.round(+x.amt || 0));
    if (!gift && !amt) return;
    let d = /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : (dateAll || td); if (d > td) d = td;
    const cat = CATS[x.cat] ? x.cat : guessCat(x.item);
    const rec = { d: d, t: Date.now(), amt: amt, cat: cat, item: String(x.item || CATS[cat]).slice(0, 60), src: src, grp: grp, by: 'line:' + ctx.uid };
    if (+x.qty > 1) rec.qty = +x.qty;
    const shop = x.shop || shopAll; if (shop) rec.shop = String(shop).slice(0, 30);
    if (gift) { rec.gift = true; if (x.giver) rec.giver = String(x.giver).slice(0, 20); } else rec.payer = String(x.payer || ctx.name).slice(0, 20);
    if (x.note) rec.note = String(x.note).slice(0, 100);
    ids.push(fsCreate(ctx.base + '/expenses', rec));
    sum += amt;
    lines.push('・' + CATS[cat] + '｜' + rec.item + (rec.qty ? ' ×' + rec.qty : '') + ' ' + (gift ? '🎁' + (rec.giver || '別人') + '送的' : money(amt)) + (d !== td ? '（' + d.slice(5).replace('-', '/') + '）' : ''));
  });
  if (!ids.length) return { ids: ids, text: '' };
  const ym = today().slice(0, 7), mt = monthTotal(ctx, ym), bud = +ctx.money.budget || 0;
  return { ids: ids, text: '✅ 已記帳 ' + ids.length + ' 筆' + (sum ? '，共 ' + money(sum) : '') + '\n' + lines.join('\n') +
    '\n本月累計 ' + money(mt) + (bud ? (mt > bud ? '（⚠️ 超出預算 ' + money(mt - bud) + '）' : '（預算剩 ' + money(bud - mt) + '）') : '') };
}
function tpMs(date, hm) { return Date.parse(date + 'T' + hm + ':00+08:00'); }
function saveLogs(ctx, list) {
  const ids = [], lines = [], now = Date.now(), td = today();
  list.forEach(function (x) {
    if (!x || !x.type) return;
    let t = now;
    if (/^\d{1,2}:\d{2}$/.test(x.time || '')) {
      const hm = ('0' + x.time).slice(-5);
      t = tpMs(/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : td, hm);
      if (t > now + 10 * 60e3 && !x.date) t -= 864e5; // 「11 點」在早上講的是昨晚
    }
    const via = 'LINE·' + ctx.name, T = Utilities.formatDate(new Date(t), TZ, 'HH:mm');
    if (x.type === 'wake') {
      const recent = fsQuery(ctx.base, 'logs', [['t', 'GREATER_THAN_OR_EQUAL', now - 36 * 3600e3]], ['t', 'DESCENDING'], 80);
      const s = recent.filter(function (d) { return d.data.type === 'sleep' && !d.data.end; })[0];
      if (!s) { lines.push('找不到正在睡的記錄，請先傳「睡了」'); return; }
      fsPatch(ctx.base + '/logs/' + s.id, { end: t }, ['end']);
      lines.push('☀️ 起床 ' + T + '，睡了 ' + dur(t - s.data.t)); return;
    }
    if (!LOGN[x.type]) return;
    const rec = { type: x.type, t: t, via: via };
    if (x.type === 'bmilk' || x.type === 'formula') { rec.ml = Math.round(+x.ml || 0); if (!rec.ml) { lines.push('請告訴我喝了幾 ml，例如「配方奶 120」'); return; } }
    if (x.type === 'pump') { rec.left = Math.round(+x.ml || 0); rec.right = 0; }
    if (x.type === 'breast') { const L = +x.leftMin || 0, R = +x.rightMin || 0, M = +x.min || 0; rec.left = Math.round((L || (!R ? M : 0)) * 60); rec.right = Math.round(R * 60); }
    if ((x.type === 'pee' || x.type === 'poop') && /^[少中多]$/.test(x.amt || '')) rec.amt = x.amt;
    if (x.type === 'poop') { if (POOP[x.color]) rec.color = x.color; if (/^(水狀|稀糊|軟糊|條狀|硬粒)$/.test(x.tex || '')) rec.tex = x.tex; }
    if (x.type === 'sleep') rec.end = null;
    if (x.type === 'temp') { rec.c = +x.c || 0; if (!rec.c) return; }
    if (x.type === 'solid') { rec.food = String(x.food || '副食品').slice(0, 40); if (x.qty) rec.qty = String(x.qty).slice(0, 20); }
    if (x.type === 'med') { rec.drug = String(x.drug || '藥').slice(0, 40); if (x.dose) rec.dose = String(x.dose).slice(0, 20); }
    if (x.type === 'mood') rec.tags = (x.tags || []).slice(0, 6);
    if (x.note) rec.note = String(x.note).slice(0, 100);
    ids.push(fsCreate(ctx.base + '/logs', rec));
    let v = '';
    if (rec.ml) v = rec.ml + 'ml';
    if (x.type === 'breast') v = '左' + Math.round(rec.left / 60) + '分 右' + Math.round(rec.right / 60) + '分';
    if (x.type === 'pump') v = rec.left + 'ml';
    if (x.type === 'poop') v = [POOP[rec.color], rec.tex, rec.amt].filter(Boolean).join('・');
    if (x.type === 'temp') v = rec.c.toFixed(1) + '°C' + (rec.c >= 38 ? '（發燒，未滿 3 個月請立即就醫）' : '');
    if (x.type === 'solid') v = rec.food + (rec.qty ? ' ' + rec.qty : '');
    if (x.type === 'med') v = rec.drug + (rec.dose ? ' ' + rec.dose : '');
    if (x.type === 'mood') v = rec.tags.join('、');
    lines.push('✅ ' + LOGN[x.type] + (v ? ' ' + v : '') + '（' + T + '）');
    if (x.type === 'poop' && /pale|black|red/.test(rec.color || '')) lines.push('⚠️ 這個顏色要留意，請拍照並諮詢醫師；灰白便請盡快就醫。');
  });
  return { ids: ids, text: lines.join('\n') };
}
function dur(ms) { const m = Math.round(Math.max(0, ms) / 6e4), h = Math.floor(m / 60); return h ? h + '小時' + (m % 60 ? m % 60 + '分' : '') : m + '分'; }

/* ───────── 照片：發票／收據／訂單截圖 ───────── */
function doImage(ev, ctx) {
  if (!ctx.fam.geminiKey) return reply(ev, '辨識照片需要 Gemini 金鑰，請到果果日記 App「設定 → AI 設定」貼上。');
  const res = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + ev.message.id + '/content', { headers: { Authorization: 'Bearer ' + lineToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return reply(ev, '照片下載失敗，請再傳一次。');
  const blob = res.getBlob(), mime = blob.getContentType() || 'image/jpeg';
  const prompt = '這是一張台灣的購物憑證：可能是電子發票、收據、明細，或蝦皮／momo／PChome／酷澎等網購訂單截圖，也可能根本不是購物憑證。今天是 ' + today() + '。\n' +
    '請列出「實際購買的每一個品項」：item 簡短品名（去掉廣告詞，保留品牌與規格）、amt 這個品項實付金額（新台幣整數，有折扣算進去，同品項多件合計）、qty 數量（沒寫就 1）、cat 分類代碼（milk diaper cloth bath food med gear toy care event other）。\n' +
    '運費、手續費列成一個品項放 other；折價券、點數折抵那一行不要列。\n' +
    '只回覆 JSON：{"ok":true,"shop":"店家或平台","date":"YYYY-MM-DD","total":實付總額,"items":[{"item":"","amt":0,"qty":1,"cat":""}]}\n' +
    '如果看不出是購物憑證，回覆 {"ok":false,"why":"一句話說明"}';
  const r = gemini(ctx.fam, [{ text: prompt }, { inline_data: { mime_type: mime, data: Utilities.base64Encode(blob.getBytes()) } }]);
  if (!r) return reply(ev, 'AI 辨識失敗，請稍後再傳一次，或手動打字記帳（例如「尿布 699」）。');
  if (r.ok === false || !(r.items || []).length) return reply(ev, '這張看不出是發票或訂單' + (r.why ? '：' + r.why : '') + '。\n如果是收據，請拍清楚、整張入鏡再試一次。');
  const d = /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : today();
  const s = saveExpenses(ctx, r.items, 'line', r.shop, d);
  const got = r.items.reduce(function (a, x) { return a + (Math.round(+x.amt) || 0); }, 0);
  remember(ctx.uid, { expenses: s.ids, logs: [] });
  reply(ev, '🧾 ' + (r.shop || '收據') + '\n' + s.text + (r.total && Math.abs(r.total - got) > 1 ? '\n\n發票總額是 ' + money(r.total) + '，和品項加總不同，請到 App 檢查一下。' : '') + '\n\n分類或金額不對，可以到 App「花費 → 明細」點一下修改；整張記錯傳「撤銷」。');
}

/* ───────── 查詢 ───────── */
function rangeOf(range) {
  const td = today(), d = new Date(td + 'T00:00:00+08:00'), f = function (x) { return Utilities.formatDate(x, TZ, 'yyyy-MM-dd'); };
  const ym = td.slice(0, 7);
  if (range === 'today') return { from: td, to: td, label: '今天' };
  if (range === 'yesterday') { const y = f(new Date(d.getTime() - 864e5)); return { from: y, to: y, label: '昨天' }; }
  if (range === 'week') return { from: f(new Date(d.getTime() - 6 * 864e5)), to: td, label: '最近 7 天' };
  if (range === 'lastmonth') { const p = new Date(+ym.slice(0, 4), +ym.slice(5) - 2, 1); const pm = p.getFullYear() + '-' + ('0' + (p.getMonth() + 1)).slice(-2); return { from: pm + '-01', to: pm + '-31', label: (p.getMonth() + 1) + '月', ym: pm }; }
  if (range === 'year') return { from: td.slice(0, 4) + '-01-01', to: td, label: td.slice(0, 4) + '年' };
  if (range === 'all') return { from: '2000-01-01', to: td, label: '全部' };
  return { from: ym + '-01', to: td, label: (+ym.slice(5)) + '月', ym: ym };
}
function expensesIn(ctx, from, to) {
  return fsQuery(ctx.base, 'expenses', [['d', 'GREATER_THAN_OR_EQUAL', from], ['d', 'LESS_THAN_OR_EQUAL', to]], null, 3000).map(function (x) { return x.data; });
}
function monthTotal(ctx, ym) { return expensesIn(ctx, ym + '-01', ym + '-31').filter(counted).reduce(function (s, e) { return s + (+e.amt || 0); }, 0); }
function counted(e) { return !e.gift && (+e.amt || 0) > 0; }
function doQuery(ev, ctx, q) {
  if (q.what === 'baby') return reply(ev, babyReport(ctx, q.range === 'yesterday' ? 'yesterday' : 'today'));
  const r = rangeOf(q.range || 'month');
  let list = expensesIn(ctx, r.from, r.to);
  const gifts = list.filter(function (e) { return e.gift; });
  list = list.filter(counted);
  if (q.cat && CATS[q.cat]) {
    const l = list.filter(function (e) { return e.cat === q.cat; });
    const tot = l.reduce(function (s, e) { return s + (+e.amt); }, 0);
    return reply(ev, '🔎 ' + r.label + ' ' + CATS[q.cat] + '：' + money(tot) + '（' + l.length + ' 筆）' + (l.length ? '\n' + l.slice(0, 12).map(function (e) { return '・' + e.d.slice(5).replace('-', '/') + ' ' + e.item + ' ' + money(e.amt); }).join('\n') : ''));
  }
  const tot = list.reduce(function (s, e) { return s + (+e.amt); }, 0), by = {};
  list.forEach(function (e) { by[e.cat || 'other'] = (by[e.cat || 'other'] || 0) + (+e.amt); });
  const rows = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).map(function (k) { return (CATS[k] || '其他') + ' ' + money(by[k]) + '（' + Math.round(by[k] / tot * 100) + '%）'; });
  const big = list.slice().sort(function (a, b) { return b.amt - a.amt; })[0];
  let txt = '📊 ' + (ctx.baby.name || '寶寶') + ' ' + r.label + '花費\n共 ' + money(tot) + '・' + list.length + ' 筆';
  const bud = +ctx.money.budget || 0;
  if (r.ym && bud) txt += '\n預算 ' + money(bud) + (tot > bud ? '，⚠️ 超出 ' + money(tot - bud) : '，還剩 ' + money(bud - tot));
  if (rows.length) txt += '\n━━━━━━\n' + rows.join('\n');
  if (big) txt += '\n━━━━━━\n最大筆：' + big.item + ' ' + money(big.amt);
  if (r.ym && q.range !== 'lastmonth') {
    const p = rangeOf('lastmonth'), sameDay = p.ym + '-' + today().slice(8);
    const prev = expensesIn(ctx, p.from, sameDay).filter(counted).reduce(function (s, e) { return s + (+e.amt); }, 0);
    if (prev) txt += '\n比上個月同期' + (tot >= prev ? '多 ' : '少 ') + money(Math.abs(tot - prev));
  }
  if (gifts.length) txt += '\n🎁 收到禮物 ' + gifts.length + ' 件（不算花費）';
  if (!list.length && !gifts.length) txt = r.label + '還沒有花費記錄。傳「尿布 699」就能記一筆。';
  reply(ev, txt + '\n\n詳細圖表：' + APP_URL + '#money');
}
function babyReport(ctx, which) {
  const td = today(), start = tpMs(which === 'yesterday' ? Utilities.formatDate(new Date(Date.now() - 864e5), TZ, 'yyyy-MM-dd') : td, '00:00'), end = start + 864e5;
  const logs = fsQuery(ctx.base, 'logs', [['t', 'GREATER_THAN_OR_EQUAL', start - 864e5]], ['t', 'DESCENDING'], 400).map(function (x) { return x.data; });
  const inD = logs.filter(function (l) { return l.t >= start && l.t < end; }), of = function (t) { return inD.filter(function (l) { return l.type === t; }); };
  const sumMl = function (t) { return of(t).reduce(function (s, l) { return s + (+l.ml || 0); }, 0); };
  const bm = sumMl('bmilk'), fm = sumMl('formula'), br = of('breast');
  const brMin = Math.round(br.reduce(function (s, l) { return s + (+l.left || 0) + (+l.right || 0); }, 0) / 60);
  const sleep = logs.filter(function (l) { return l.type === 'sleep'; }).reduce(function (s, l) { return s + Math.max(0, Math.min(l.end || Date.now(), end) - Math.max(l.t, start)); }, 0);
  const temps = of('temp').map(function (l) { return +l.c; });
  const lastFeed = logs.filter(function (l) { return /^(breast|bmilk|formula)$/.test(l.type); })[0];
  const name = ctx.baby.name || '寶寶', label = which === 'yesterday' ? '昨天' : '今天（到 ' + Utilities.formatDate(new Date(), TZ, 'HH:mm') + '）';
  if (!inD.length && !sleep) return name + label + '還沒有記錄。可以傳「配方奶 120」「尿尿」開始記。';
  const L = ['👶 ' + name + ' ' + label];
  if (bm + fm) L.push('🍼 瓶餵 ' + (of('bmilk').length + of('formula').length) + ' 次，共 ' + (bm + fm) + 'ml' + (bm && fm ? '（母乳 ' + bm + '、配方 ' + fm + '）' : ''));
  if (br.length) L.push('🤱 親餵 ' + br.length + ' 次，共 ' + brMin + ' 分');
  L.push('💧 尿尿 ' + of('pee').length + ' 次・💩 便便 ' + of('poop').length + ' 次');
  if (sleep) L.push('😴 睡了 ' + dur(sleep));
  if (temps.length) L.push('🌡️ 最高體溫 ' + Math.max.apply(null, temps).toFixed(1) + '°C');
  if (of('solid').length) L.push('🥣 副食品：' + of('solid').map(function (l) { return l.food; }).join('、'));
  if (which !== 'yesterday' && lastFeed) L.push('上次餵奶 ' + Utilities.formatDate(new Date(lastFeed.t), TZ, 'HH:mm') + '（' + dur(Date.now() - lastFeed.t) + '前）');
  return L.join('\n');
}

/* ───────── Gemini ───────── */
function gemini(fam, parts) {
  const key = fam && fam.geminiKey; if (!key) return null;
  const cache = CacheService.getScriptCache();
  const body = JSON.stringify({ contents: [{ role: 'user', parts: parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } });
  const call = function (m) { return UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(key), { method: 'post', contentType: 'application/json', payload: body, muteHttpExceptions: true }); };
  let model = cache.get('gmodel') || fam.geminiModel || 'gemini-flash-latest', res = call(model);
  if (res.getResponseCode() !== 200 && res.getResponseCode() !== 429) {
    const alt = pickModel(key, model);
    if (alt && alt !== model) { model = alt; res = call(model); }
  }
  if (res.getResponseCode() !== 200) { console.warn('Gemini', res.getResponseCode(), res.getContentText().slice(0, 300)); return null; }
  cache.put('gmodel', model, 21600);
  try {
    const j = JSON.parse(res.getContentText());
    const txt = j.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
    return JSON.parse(txt.replace(/^```json|```$/g, '').trim());
  } catch (e) { console.warn('Gemini parse', e); return null; }
}
function pickModel(key, bad) {
  try {
    const j = JSON.parse(UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(key), { muteHttpExceptions: true }).getContentText());
    const ok = (j.models || []).filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; }).map(function (m) { return m.name.replace('models/', ''); })
      .filter(function (n) { return /flash/.test(n) && !/(lite|image|tts|live|audio|thinking|exp|embedding|8b)/.test(n) && n !== bad; });
    if (ok.indexOf('gemini-flash-latest') >= 0) return 'gemini-flash-latest';
    const ver = function (n) { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    ok.sort(function (a, b) { return ver(b) - ver(a) || (/preview/.test(a) - /preview/.test(b)) || a.length - b.length; });
    return ok[0] || null;
  } catch (e) { return null; }
}

/* ───────── LINE ───────── */
function lineToken() { const t = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN'); if (!t) throw new Error('指令碼屬性還沒設定 LINE_TOKEN'); return t.trim(); }
const QUICK = { items: ['本月', '今天', '撤銷', '說明'].map(function (t) { return { type: 'action', action: { type: 'message', label: t, text: t } }; }) };
function reply(ev, text) {
  const msg = [{ type: 'text', text: String(text).slice(0, 4900), quickReply: QUICK }];
  let res = null;
  if (ev.replyToken) res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + lineToken() }, payload: JSON.stringify({ replyToken: ev.replyToken, messages: msg }), muteHttpExceptions: true });
  if ((!res || res.getResponseCode() !== 200) && ev.source && ev.source.userId) { // 回覆逾時就改用推播
    if (res) console.warn('reply', res.getResponseCode(), res.getContentText());
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + lineToken() }, payload: JSON.stringify({ to: ev.source.userId, messages: msg }), muteHttpExceptions: true });
  }
}
function lineName(uid) {
  try { const r = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + uid, { headers: { Authorization: 'Bearer ' + lineToken() }, muteHttpExceptions: true }); if (r.getResponseCode() === 200) return JSON.parse(r.getContentText()).displayName; } catch (e) {}
  return '';
}

/* ───────── Firestore REST ───────── */
function fsAuth() {
  const sa = PropertiesService.getScriptProperties().getProperty('FIREBASE_SA');
  if (!sa) return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT };
  const cache = CacheService.getScriptCache(); let tok = cache.get('satoken');
  if (!tok) {
    const k = JSON.parse(sa), now = Math.floor(Date.now() / 1000);
    const b64 = function (x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); };
    const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64(JSON.stringify({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const sig = b64(Utilities.computeRsaSha256Signature(head + '.' + claim, k.private_key));
    const r = JSON.parse(UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig } }).getContentText());
    tok = r.access_token; cache.put('satoken', tok, 3000);
  }
  return { Authorization: 'Bearer ' + tok };
}
function fsFetch(method, url, payload) {
  const opt = { method: method, headers: fsAuth(), muteHttpExceptions: true };
  if (payload) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(payload); }
  const r = UrlFetchApp.fetch(url, opt), code = r.getResponseCode();
  if (code === 404 && method === 'get') return null;
  if (code >= 300) throw new Error('Firestore ' + code + ' ' + r.getContentText().slice(0, 200));
  return r.getContentText() ? JSON.parse(r.getContentText()) : {};
}
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
  return { stringValue: String(v) };
}
function encFields(o) { const f = {}; Object.keys(o).forEach(function (k) { if (o[k] !== undefined) f[k] = enc(o[k]); }); return f; }
function dec(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  return null;
}
function decFields(f) { const o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = dec(f[k]); }); return o; }
function fsGet(path) { const d = fsFetch('get', FS + '/' + path); return d ? decFields(d.fields) : null; }
function fsCreate(col, obj) { const d = fsFetch('post', FS + '/' + col, { fields: encFields(obj) }); return d.name.split('/').pop(); }
function fsDelete(path) { fsFetch('delete', FS + '/' + path); }
function fsPatch(path, obj, mask) { // mask：只更新這些欄位（其他欄位不動）；不給就更新 obj 的頂層欄位
  const fields = mask || Object.keys(obj);
  const q = fields.map(function (p) { return 'updateMask.fieldPaths=' + encodeURIComponent(p.split('.').map(function (s) { return /^[A-Za-z_][A-Za-z_0-9]*$/.test(s) ? s : '`' + s + '`'; }).join('.')); }).join('&');
  fsFetch('patch', FS + '/' + path + '?' + q, { fields: encFields(obj) });
}
function fsQuery(parent, col, where, order, limit) {
  const sq = { from: [{ collectionId: col }], limit: limit || 100 };
  const fl = (where || []).map(function (w) { return { fieldFilter: { field: { fieldPath: w[0] }, op: w[1], value: enc(w[2]) } }; });
  if (fl.length === 1) sq.where = fl[0]; else if (fl.length) sq.where = { compositeFilter: { op: 'AND', filters: fl } };
  if (order) sq.orderBy = [{ field: { fieldPath: order[0] }, direction: order[1] }];
  const res = fsFetch('post', FS + (parent ? '/' + parent : '') + ':runQuery', { structuredQuery: sq });
  return (res || []).filter(function (r) { return r.document; }).map(function (r) { return { id: r.document.name.split('/').pop(), data: decFields(r.document.fields) }; });
}

/* ───────── 第一次設定時，在編輯器選這個函式按「執行」測試 ───────── */
function 測試連線() {
  const fams = fsQuery('', 'families', [], null, 5);
  console.log('Firebase 連線成功，找到 ' + fams.length + ' 本日記');
  const r = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', { headers: { Authorization: 'Bearer ' + lineToken() }, muteHttpExceptions: true });
  console.log(r.getResponseCode() === 200 ? 'LINE 連線成功：' + JSON.parse(r.getContentText()).displayName : 'LINE_TOKEN 有問題：' + r.getContentText());
}
