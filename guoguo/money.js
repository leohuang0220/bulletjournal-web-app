/* 果果日記・花費（寶寶記帳）
   families/{fid}/expenses/{id}  { d:'YYYY-MM-DD', t, amt, cat, item, qty?, shop?, payer?, gift?, giver?, note?, src:'app'|'scan'|'line', grp?, by }
   families/{fid}/meta/money      { budget, ai:{t,month,r} }
   families/{fid}                 { lineCode, lineCodeAt, lineUsers:{ lineUserId:{name,at} } }   ← LINE 小助手綁定
*/
const MCATS = [
  {k:'milk',  n:'奶粉餵養', g:'奶', c:'#F2B23A', eg:'奶粉、奶瓶、奶嘴、母乳袋'},
  {k:'diaper',n:'尿布濕巾', g:'尿', c:'#4FC2A7', eg:'尿布、濕紙巾、隔尿墊'},
  {k:'cloth', n:'衣物鞋襪', g:'衣', c:'#F07E9A', eg:'衣服、包巾、帽襪、圍兜'},
  {k:'bath',  n:'洗沐保養', g:'洗', c:'#5FAEEB', eg:'沐浴乳、乳液、屁屁膏'},
  {k:'food',  n:'副食品',   g:'食', c:'#7DBB5A', eg:'米精、果泥、餐具'},
  {k:'med',   n:'醫療保健', g:'醫', c:'#EF6A6A', eg:'看診、自費疫苗、藥品'},
  {k:'gear',  n:'大型用品', g:'車', c:'#9686E6', eg:'推車、汽座、嬰兒床'},
  {k:'toy',   n:'玩具書籍', g:'玩', c:'#F59E7E', eg:'玩具、繪本、固齒器'},
  {k:'care',  n:'托育保母', g:'托', c:'#C69ADB', eg:'保母、托嬰、月子'},
  {k:'event', n:'紀念慶祝', g:'慶', c:'#E58AC8', eg:'滿月、收涎、攝影'},
  {k:'other', n:'其他',     g:'他', c:'#9C90A6', eg:''},
];
const MC = Object.fromEntries(MCATS.map(c=>[c.k,c]));
const MKW = [ // 關鍵字自動分類（AI 沒開也能用）
  ['med',/看診|掛號|診所|醫院|疫苗|藥|益生菌|維他命|維生素|D3|魚肝油|體溫計|吸鼻|健檢|門診|耳溫槍/],
  ['milk',/奶粉|奶瓶|奶嘴|母乳袋|溫奶|消毒鍋|吸乳|擠乳|集乳|奶瓶刷|調乳|哺乳/],
  ['diaper',/尿布|濕紙巾|濕巾|隔尿|尿褲|拉拉褲|尿墊/],
  ['food',/米精|米餅|副食|果泥|食物泥|餐具|餐椅|調理機|米粉|寶寶粥|零食/],
  ['bath',/沐浴|洗髮|乳液|乳霜|護膚|屁屁膏|護臀|洗衣|澡盆|浴|指甲|棉花棒|防蚊|紗布巾|洗碗|奶瓶清潔/],
  ['cloth',/衣|褲|包巾|帽|襪|鞋|連身|兔裝|肚衣|圍兜|口水巾|睡袋|外套|洋裝/],
  ['gear',/推車|汽座|嬰兒床|床墊|背巾|揹巾|腰凳|搖椅|安撫椅|圍欄|遊戲墊|監視器|家具|收納|澡架|尿布台|汽車座椅/],
  ['toy',/玩具|繪本|書|積木|搖鈴|固齒|安撫巾|健力架|布偶|娃娃/],
  ['care',/保母|托嬰|托育|臨托|月嫂|月子|坐月子/],
  ['event',/滿月|彌月|收涎|抓周|攝影|寫真|禮盒|油飯|蛋糕|紅包|周歲|週歲/],
];
function guessCat(s){s=String(s||'');for(const [k,re] of MKW) if(re.test(s)) return k; return 'other'}
function money(n){n=Math.round(+n||0);return '$'+n.toLocaleString('en-US')}
function ymKey(d){return String(d).slice(0,7)}
function todayYmd(){return ymd(Date.now())}
function addMonth(ym,n){const [y,m]=ym.split('-').map(Number);const d=new Date(y,m-1+n,1);return d.getFullYear()+'-'+pad(d.getMonth()+1)}
function ymLabel(ym){const [y,m]=ym.split('-');return `${y}年${+m}月`}
function mbadge(k,big){const c=MC[k]||MC.other;return `<span class="mb${big?' big':''}" style="--c:${c.c}" aria-hidden="true">${c.g}</span>`}

S.exp=[]; S.mMonth=ymKey(todayYmd()); S.mView='cat'; S.mCat=''; S.mQ=''; S.mMeta={};

/* ───── store ───── */
function moneyAttach(){
  subs.push(db.collection('expenses').orderBy('d','desc').limit(3000).onSnapshot(s=>{
    S.exp=s.docs.map(d=>({id:d.id,...d.data()})); sortExp(); if(S.tab==='money'&&!document.querySelector('.scrim')) render() },e=>console.warn(e)));
  subs.push(db.doc('meta/money').onSnapshot(s=>{ S.mMeta=s.exists?s.data():{}; if(S.tab==='money'&&!document.querySelector('.scrim')) render() },()=>{}));
}
function sortExp(){S.exp.sort((a,b)=>a.d<b.d?1:a.d>b.d?-1:(b.t||0)-(a.t||0))}
function moneyLocal(){ S.exp=ls('bl_exp')||[]; sortExp(); S.mMeta=ls('bl_money')||{} }
async function saveExp(rec){
  const {id,...data}=rec; if(S.uid&&!data.by) data.by=S.uid;
  Object.keys(data).forEach(k=>{if(data[k]===undefined||data[k]==='')delete data[k]});
  if(S.mode==='db'){ try{ id? await db.collection('expenses').doc(id).set(data) : await db.collection('expenses').add(data) }catch(e){writeErr(e);return false} }
  else { if(id) S.exp=S.exp.map(x=>x.id===id?{id,...data}:x); else S.exp.push({id:'e'+Date.now()+Math.random().toString(36).slice(2,6),...data});
    sortExp(); ls('bl_exp',S.exp) }
  return true;
}
async function delExp(id){
  if(S.mode==='db'){ try{ await db.collection('expenses').doc(id).delete() }catch(e){writeErr(e)} }
  else { S.exp=S.exp.filter(x=>x.id!==id); ls('bl_exp',S.exp) }
}
async function saveMoneyMeta(p){
  S.mMeta={...S.mMeta,...p};
  if(S.mode==='db'){ try{ await db.doc('meta/money').set(p,{merge:true}) }catch(e){writeErr(e)} } else ls('bl_money',S.mMeta);
}

/* ───── analytics ───── */
const counted=e=>!e.gift&&(+e.amt||0)>0;
function monthExp(ym){return S.exp.filter(e=>ymKey(e.d)===ym)}
function sumBy(list){const o={};list.filter(counted).forEach(e=>{o[e.cat||'other']=(o[e.cat||'other']||0)+(+e.amt)});return o}
function total(list){return list.filter(counted).reduce((s,e)=>s+(+e.amt),0)}
function itemKey(s){return String(s||'').replace(/[\s　]+/g,'').replace(/[（(【\[].*?[)）】\]]/g,'').toLowerCase()}
function restock(){ // 常買品項：同名品項買 2 次以上，算平均間隔與下次補貨
  const g={};
  S.exp.filter(e=>e.item&&!e.gift).forEach(e=>{const k=itemKey(e.item);if(!k)return;(g[k]=g[k]||{name:e.item,cat:e.cat,list:[]}).list.push(e)});
  const today=todayYmd();
  return Object.values(g).filter(x=>x.list.length>=2).map(x=>{
    const ds=[...new Set(x.list.map(e=>e.d))].sort(); const gaps=[];
    for(let i=1;i<ds.length;i++) gaps.push(dayDiff(ds[i],ds[i-1]));
    const gap=gaps.length?Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length):null;
    const last=ds[ds.length-1], latest=x.list.filter(e=>e.d===last)[0];
    const unit=x.list.map(e=>(+e.amt)/(+e.qty||1)).filter(v=>v>0);
    const next=gap?addD(last,gap):null;
    return {name:latest.item,cat:latest.cat,n:x.list.length,total:x.list.reduce((s,e)=>s+(+e.amt||0),0),gap,last,next,left:next?dayDiff(next,today):null,
      lastPrice:+latest.amt, minUnit:unit.length?Math.min(...unit):null, avgUnit:unit.length?unit.reduce((a,b)=>a+b,0)/unit.length:null, shop:latest.shop};
  }).sort((a,b)=>(a.left??9999)-(b.left??9999));
}
function addD(d,n){const x=new Date(d+'T00:00');x.setDate(x.getDate()+n);return ymd(x.getTime())}
function payers(){const s=new Set();Object.values(S.names||{}).forEach(n=>n&&s.add(String(n).split(' ')[0]));
  Object.values((S.fam&&S.fam.lineUsers)||{}).forEach(u=>u&&u.name&&s.add(u.name));S.exp.slice(0,200).forEach(e=>e.payer&&s.add(e.payer));return [...s].slice(0,6)}
function myName(){const n=me&&(me.displayName||me.email)||'';return n?String(n).split(' ')[0].split('@')[0]:''}

/* ───── view ───── */
function viewMoney(){
  const ym=S.mMonth, cur=ymKey(todayYmd()), list=monthExp(ym), tot=total(list), prev=total(monthExp(addMonth(ym,-1)));
  const budget=+S.mMeta.budget||0, gifts=list.filter(e=>e.gift).length;
  const nav=`<div class="datenav"><button data-ma="mprev" aria-label="上個月">${ic('left')}</button><div class="d">${ymLabel(ym)}<small>寶寶花費</small></div><button data-ma="mnext" aria-label="下個月" ${ym>=cur?'disabled':''}>${ic('right')}</button></div>`;
  let bud='';
  if(budget){const p=tot/budget, day=ym===cur?new Date().getDate():null, dim=new Date(+ym.slice(0,4),+ym.slice(5),0).getDate();
    const pace=day?budget*day/dim:null;
    bud=`<div class="bud"><div class="bud-bar"><i style="width:${Math.min(100,p*100)}%;background:${p>1?'var(--warn)':p>.85?'var(--c-formula)':'var(--ok)'}"></i>${pace?`<em style="left:${Math.min(100,pace/budget*100)}%" title="照進度應花到這裡"></em>`:''}</div>
      <small>${p>1?`<b style="color:var(--warn)">超出預算 ${money(tot-budget)}</b>`:`預算 ${money(budget)}，還剩 <b>${money(budget-tot)}</b>`}${pace&&p<=1?(tot>pace?'・比進度快一點':'・在進度內'):''}</small></div>`}
  else bud=`<button class="link" data-ma="budget">設定每月預算</button>`;
  const delta=prev?Math.round((tot-prev)/prev*100):null;
  const head=`<div class="mtot"><div><small>本月花費${gifts?`（不含 ${gifts} 筆別人送的）`:''}</small><b class="num">${money(tot)}</b>
     <span class="sub">${list.filter(counted).length} 筆${delta!==null?`・比上月${delta>=0?'多':'少'} ${Math.abs(delta)}%`:''}</span></div>
     <button class="mini" data-ma="budget" aria-label="預算設定">${ic('gear')}</button></div>${bud}`;
  const seg=`<div class="seg" role="group" aria-label="花費檢視">${[['cat','分類'],['trend','趨勢'],['buy','常買'],['list','明細']].map(([k,n])=>`<button data-mv="${k}" aria-pressed="${S.mView===k}">${n}</button>`).join('')}</div>`;
  let body='';
  if(S.mView==='cat') body=catView(list,tot);
  else if(S.mView==='trend') body=trendView();
  else if(S.mView==='buy') body=buyView();
  else body=listView(list);
  const bound=Object.keys((S.fam&&S.fam.lineUsers)||{}).length;
  const lineTip=S.noCloud?'':`<div class="card note" style="margin-top:12px">${bound?`在 LINE 傳「尿布 699」「奶粉 2 罐 1580 好市多」，或直接傳發票、訂單截圖，就會自動記到這裡。傳「本月」看統計。`:`想用 LINE 記帳？到 <button class="link" data-ma="goset" style="margin:0">設定 → LINE 小助手</button> 綁定一次就好。`}</div>`;
  return header(nav)+`<div class="wrap"><div class="card mhead">${head}</div>
    ${S.readOnly?'':`<div class="mact"><button class="addbtn" data-ma="add">${ic('plus')}記一筆</button><label class="addbtn ghost2" for="ms-file">${ic('photo')}拍發票／截圖辨識</label><input id="ms-file" type="file" accept="image/*" hidden></div>`}
    ${seg}${body}${S.mView==='cat'?payerCard(list)+moneyAiCard():''}${lineTip}</div>`;
}
function catView(list,tot){
  if(!tot) return `<div class="empty">${ic('coin')}這個月還沒有花費<br>按「記一筆」，或在 LINE 傳「尿布 699」</div>`+recent(list);
  const by=sumBy(list), rows=MCATS.filter(c=>by[c.k]).sort((a,b)=>by[b.k]-by[a.k]);
  let a0=-Math.PI/2, arcs='';
  const R=62,r=40,cx=80,cy=80;
  rows.forEach(c=>{const f=by[c.k]/tot, a1=a0+f*Math.PI*2-(rows.length>1?.015:0);
    if(f>=.9999){arcs+=`<circle cx="${cx}" cy="${cy}" r="${(R+r)/2}" fill="none" stroke="${c.c}" stroke-width="${R-r}"/>`}
    else{const p=(a,rr)=>`${(cx+rr*Math.cos(a)).toFixed(2)},${(cy+rr*Math.sin(a)).toFixed(2)}`, lg=a1-a0>Math.PI?1:0;
      arcs+=`<path d="M${p(a0,R)}A${R},${R} 0 ${lg} 1 ${p(a1,R)}L${p(a1,r)}A${r},${r} 0 ${lg} 0 ${p(a0,r)}Z" fill="${c.c}"/>`}
    a0+=f*Math.PI*2});
  const top=rows[0];
  return `<div class="card donut"><svg viewBox="0 0 160 160" role="img" aria-label="分類占比">${arcs}<text x="80" y="76" text-anchor="middle" font-size="11" fill="var(--muted)">最多</text><text x="80" y="94" text-anchor="middle" font-size="15" fill="var(--ink)">${top.n}</text></svg>
    <ul class="mcl">${rows.map(c=>`<li><button data-mcat="${c.k}">${mbadge(c.k)}<span class="nm">${c.n}<i class="bar2"><i style="width:${by[c.k]/by[top.k]*100}%;background:${c.c}"></i></i></span><span class="v num">${money(by[c.k])}<small>${Math.round(by[c.k]/tot*100)}%</small></span></button></li>`).join('')}</ul></div>`+recent(list);
}
function recent(list){const r=list.slice(0,6);return r.length?`<div class="sect"><h2>最近幾筆</h2><button class="link" data-mv="list" style="margin:0">看全部</button></div><ul class="tl">${r.map(expRow).join('')}</ul>`:''}
function expRow(e){
  const c=MC[e.cat]||MC.other, meta=[];
  if(e.shop) meta.push(esc(e.shop)); if(e.qty&&+e.qty>1) meta.push('× '+e.qty); if(e.payer) meta.push(esc(e.payer)+(e.gift?'':' 付')); if(e.gift) meta.push('🎁 '+esc(e.giver||'別人')+'送的');
  if(e.src==='line') meta.push('LINE'); if(e.note) meta.push(esc(e.note));
  return `<li data-ma="edit" data-id="${e.id}" style="--c:${c.c}"><span class="tm num">${+e.d.slice(5,7)}/${+e.d.slice(8)}</span>${mbadge(e.cat)}<div class="body"><b>${esc(e.item||c.n)}</b><span class="meta">${meta.join('・')||c.n}</span></div><span class="amt num${e.gift?' gift':''}">${e.gift?'送的':money(e.amt)}</span></li>`;
}
function listView(list){
  let l=list; if(S.mCat) l=l.filter(e=>(e.cat||'other')===S.mCat);
  const q=S.mQ.trim().toLowerCase(); if(q) l=S.exp.filter(e=>[e.item,e.shop,e.note,e.payer,e.giver,(MC[e.cat]||{}).n].join(' ').toLowerCase().includes(q)&&(!S.mCat||e.cat===S.mCat));
  const pills=`<div class="pills mpills"><button class="pill" data-mcat="" aria-pressed="${!S.mCat}">全部</button>${MCATS.map(c=>`<button class="pill" style="--c:${c.c}" data-mcat="${c.k}" aria-pressed="${S.mCat===c.k}">${c.n}</button>`).join('')}</div>`;
  const groups={}; l.forEach(e=>(groups[e.d]=groups[e.d]||[]).push(e));
  const html=Object.keys(groups).sort().reverse().map(d=>{const dt=new Date(d+'T00:00');return `<div class="sect"><h2 style="font-size:15px">${dt.getMonth()+1}月${dt.getDate()}日 週${WK[dt.getDay()]}</h2><span class="num">${money(total(groups[d]))}</span></div><ul class="tl">${groups[d].map(expRow).join('')}</ul>`}).join('');
  return `<input class="field" id="m-q" type="search" placeholder="搜尋品項、店家（搜全部月份）" value="${esc(S.mQ)}" style="margin-bottom:8px">${pills}
    ${q?`<p class="hint">找到 ${l.length} 筆，共 ${money(total(l))}</p>`:''}${html||`<div class="empty" style="margin-top:10px">${ic('coin')}沒有符合的記錄</div>`}
    ${l.length?`<button class="btn2" data-ma="csv" style="margin-top:14px">匯出全部花費（CSV）</button>`:''}`;
}
function trendView(){
  const cur=ymKey(todayYmd()), months=[...Array(6)].map((_,i)=>addMonth(S.mMonth>cur?cur:S.mMonth,i-5));
  const data=months.map(m=>({m,by:sumBy(monthExp(m)),tot:total(monthExp(m))}));
  const W=340,H=220,L=40,R=8,T=18,B=28,cw=(W-L-R)/6,bw=Math.min(30,cw*.55);
  let max=Math.max(1,...data.map(d=>d.tot)); const step=niceStep(max); max=Math.ceil(max/step)*step;
  const y=v=>T+(H-T-B)*(1-v/max); let g='';
  for(let v=0;v<=max;v+=step) g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L-5}" y="${y(v)+3.5}" font-size="9" text-anchor="end" fill="var(--muted)">${v>=1000?(v/1000)+'k':v}</text>`;
  data.forEach((d,i)=>{const cx=L+cw*i+cw/2; let acc=0;
    MCATS.forEach(c=>{const v=d.by[c.k]||0;if(!v)return;const y1=y(acc+v),h=Math.max(1,y(acc)-y1);g+=`<rect x="${cx-bw/2}" y="${y1}" width="${bw}" height="${h}" fill="${c.c}"/>`;acc+=v});
    if(d.tot) g+=`<text x="${cx}" y="${y(d.tot)-5}" font-size="9.5" font-weight="600" text-anchor="middle" fill="var(--ink)">${d.tot>=10000?(d.tot/1000).toFixed(1)+'k':d.tot}</text>`;
    g+=`<text x="${cx}" y="${H-10}" font-size="10" text-anchor="middle" fill="${d.m===S.mMonth?'var(--primary-deep)':'var(--muted)'}">${+d.m.slice(5)}月</text>`});
  const used=new Set(); data.forEach(d=>Object.keys(d.by).forEach(k=>used.add(k)));
  const nz=data.filter(d=>d.tot), avg=nz.length?total(nz.flatMap(d=>monthExp(d.m)))/nz.length:0;
  const all=total(S.exp), first=S.exp.length?S.exp[S.exp.length-1].d:null;
  const birth=S.baby.birth, sinceB=birth?total(S.exp.filter(e=>e.d>=birth)):0, a=age(Date.now());
  const yearTot=total(S.exp.filter(e=>e.d.slice(0,4)===S.mMonth.slice(0,4)));
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近 6 個月花費">${g}</svg><div class="legend">${MCATS.filter(c=>used.has(c.k)).map(c=>`<span><i style="background:${c.c}"></i>${c.n}</span>`).join('')}</div></div>
    <div class="avg"><div><b class="num">${money(avg)}</b><small>有記錄月份平均</small></div><div><b class="num">${money(yearTot)}</b><small>${S.mMonth.slice(0,4)} 年累計</small></div><div><b class="num">${money(birth?sinceB:all)}</b><small>${birth?'出生至今':'全部累計'}</small></div></div>
    ${birth&&a&&a.day>20?`<p class="hint">平均每天花 ${money(sinceB/a.day)}。${first&&first>birth?`（記錄從 ${first.replace(/-/g,'/')} 開始，之前的花費沒算到）`:''}</p>`:''}`;
}
function buyView(){
  const r=restock();
  if(!r.length) return `<div class="empty">${ic('coin')}同一個品項記兩次以上，<br>這裡就會算出多久買一次、下次何時補貨、哪裡買最便宜</div>`;
  return `<p class="hint" style="margin-top:0">依你們的購買間隔估算，品項名稱寫一樣才會算在一起。</p><ul class="tl">${r.map(x=>{
    const soon=x.left!==null&&x.left<=3, c=MC[x.cat]||MC.other;
    return `<li style="--c:${c.c}" data-ma="addlike" data-item="${esc(x.name)}">${mbadge(x.cat)}<div class="body"><b>${esc(x.name)}</b><span class="meta">買過 ${x.n} 次・共 ${money(x.total)}${x.gap?`・約每 ${x.gap} 天`:''}${x.minUnit&&x.avgUnit&&x.minUnit<x.avgUnit*.95?`・最低單價 ${money(x.minUnit)}`:''}${x.shop?'・'+esc(x.shop):''}</span></div>
      <span class="amt num" style="${soon?'color:var(--warn)':''}">${x.left===null?'—':x.left<0?`該補了`:x.left===0?'今天':x.left+' 天後'}<small>${x.next?'預計補貨':''}</small></span></li>`}).join('')}</ul>
    <p class="hint">點一下品項，可以照上次的價格快速再記一筆。</p>`;
}
function payerCard(list){
  const o={}; list.filter(counted).forEach(e=>{const p=e.payer||'未填';o[p]=(o[p]||0)+(+e.amt)});
  const ks=Object.keys(o); if(ks.length<2&&!(ks.length===1&&ks[0]!=='未填')) return '';
  const tot=Object.values(o).reduce((a,b)=>a+b,0);
  return `<div class="sect"><h2>誰付的</h2><span>本月</span></div><div class="card">${ks.sort((a,b)=>o[b]-o[a]).map(k=>`<div class="mem"><span>${esc(k)}</span><span class="num"><b>${money(o[k])}</b> <small style="color:var(--muted)">${Math.round(o[k]/tot*100)}%</small></span></div>`).join('')}</div>`;
}

/* ───── AI 月度分析 ───── */
function moneyAiCard(){
  const ai=S.mMeta.ai, mine=ai&&ai.month===S.mMonth?ai:null, r=mine&&mine.r||{};
  const li=(t,a,c)=>a&&a.length?`<div style="margin-top:8px"><span class="lbl" style="color:${c}">${t}</span><ul style="margin:0;padding-left:18px;line-height:1.7;font-size:14px">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'';
  return `<div class="sect"><h2>AI 花費分析</h2><span>${ymLabel(S.mMonth)}</span></div><div class="card">
   <button class="addbtn" style="margin-top:0" data-ma="ai" ${S.mAiBusy||!total(monthExp(S.mMonth))?'disabled':''}>${ic('check')}${S.mAiBusy?'分析中…':mine?'重新分析':'分析這個月的花費'}</button>
   ${mine?`<p style="margin:10px 0 0;line-height:1.7;font-size:14.5px">${esc(r.summary||'')}</p>${li('花得值得的',r.good,'var(--ok)')}${li('可以省的地方',r.save,'var(--c-formula)')}${li('接下來可能要買',r.next,'var(--primary-deep)')}`:'<p class="hint">會對照寶寶月齡，看哪些錢花得剛好、哪些可以省，以及接下來幾個月常見要準備的東西。</p>'}</div>`;
}
function gemKey(){return (S.fam&&S.fam.geminiKey)||ls('bl_gemini')||''}
async function gemini(parts,temp){
  const key=gemKey(); if(!key) throw {code:'nokey'};
  const body=JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',temperature:temp??.2}});
  const call=m=>fetch('https://generativelanguage.googleapis.com/v1beta/models/'+m+':generateContent?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body});
  let model=(S.fam&&S.fam.geminiModel)||lsGet('gg_model')||'gemini-flash-latest', res=await call(model), j=await res.json();
  if(!res.ok&&res.status!==429){const alt=await pickGeminiModel(key,model); if(alt&&alt!==model){model=alt;res=await call(model);j=await res.json()}}
  if(!res.ok) throw {code:res.status===429?'rate_limited':'api',message:j.error&&j.error.message};
  try{localStorage.setItem('gg_model',model)}catch(_){}
  const c=j.candidates&&j.candidates[0];
  if(!c){ throw {code:'blocked',message:(j.promptFeedback&&j.promptFeedback.blockReason)||'沒有回覆'} }
  const txt=((c.content&&c.content.parts)||[]).filter(p=>!p.thought).map(p=>p.text||'').join('');
  const a=txt.indexOf('{'), b=txt.lastIndexOf('}');
  try{ return JSON.parse(a>=0&&b>a?txt.slice(a,b+1):txt) }
  catch(_){ throw {code:'parse',message:c.finishReason||'格式錯誤',raw:txt.slice(0,200)} }
}
function gemErr(e){ console.warn('gemini',e); const c=e&&(e.code||e.message)||'', m=String(e&&e.message||'');
  toast(c==='nokey'?'請先到「設定」貼上 Gemini API 金鑰'
   :c==='rate_limited'?'Gemini 免費額度用得太頻繁，等 1 分鐘再試'
   :c==='api'?'Gemini 回覆錯誤：'+m.slice(0,60)
   :c==='blocked'?'Gemini 拒絕處理這張圖（'+m.slice(0,30)+'），請裁切後再試'
   :c==='parse'?(m==='MAX_TOKENS'?'品項太多，AI 回覆被截斷，請分兩張截圖再試':'AI 回覆格式不完整（'+m.slice(0,20)+'），請再試一次')
   :c==='decode'?'這張圖片格式讀不出來，請改用截圖或 JPG'
   :/Failed to fetch|NetworkError|Load failed/i.test(m)?'網路連不上 Gemini，請確認網路後再試'
   :'辨識失敗：'+String(c).slice(0,60)) }
async function runMoneyAI(){
  const ym=S.mMonth, list=monthExp(ym), a=age(new Date(ym+'-15T12:00').getTime());
  const data={month:ym,babyAge:a?a.txt:'未填生日',feeding:S.baby.feedMode||'',budget:+S.mMeta.budget||null,total:total(list),byCategory:Object.fromEntries(Object.entries(sumBy(list)).map(([k,v])=>[MC[k].n,v])),
    lastMonthTotal:total(monthExp(addMonth(ym,-1))),items:list.slice(0,120).map(e=>({d:e.d.slice(5),item:e.item,amt:e.amt,qty:e.qty,cat:(MC[e.cat]||MC.other).n,shop:e.shop,gift:!!e.gift})),
    repeatBuys:restock().slice(0,15).map(x=>({item:x.name,times:x.n,everyDays:x.gap,lastPrice:x.lastPrice,minUnit:x.minUnit}))};
  S.mAiBusy=true; render();
  try{
    const r=await gemini([{text:`你是台灣新手爸媽的理財兼育兒顧問。以下是寶寶一個月的花費記錄（JSON，金額為新台幣）。請用繁體中文、台灣用語、親切具體地分析。
規則：引用具體金額；對照寶寶月齡判斷哪些花費是這個階段正常的；找出重複購買、價差、可以改買大包裝或換通路省錢的地方；預告接下來 1–3 個月依月齡常見要準備的東西（例如副食品、學步用品、換尺寸的尿布），不要推銷特定品牌。每項一句話。
只回覆 JSON：{"summary":"2-3句總結","good":["…"],"save":["…"],"next":["…"]}
資料：${JSON.stringify(data)}`}],.4);
    if(!r||!r.summary) throw {code:'bad'};
    await saveMoneyMeta({ai:{t:Date.now(),month:ym,r:{summary:String(r.summary),good:arr(r.good),save:arr(r.save),next:arr(r.next)}}});
  }catch(e){gemErr(e)}
  S.mAiBusy=false; render();
}

/* ───── 拍發票／截圖辨識 ───── */
const SCAN_PROMPT=today=>`這是一張台灣的購物憑證：可能是電子發票、收據、明細，或蝦皮／momo／PChome／酷澎等網購訂單截圖，也可能根本不是購物憑證。今天是 ${today}。
請列出「實際購買的每一個品項」：
- item：簡短品名（去掉廣告詞，保留品牌與規格，例如「幫寶適 一級幫 M 號 尿布」）
- amt：這個品項實付金額（新台幣整數；有折扣請算進去；同品項多件要合計）
- qty：數量（箱／包／罐／件，沒寫就 1）
- cat：分類代碼，只能是 milk(奶粉餵養) diaper(尿布濕巾) cloth(衣物鞋襪) bath(洗沐保養) food(副食品) med(醫療保健) gear(大型用品) toy(玩具書籍) care(托育保母) event(紀念慶祝) other(其他)
運費、手續費列成一個品項放 other；不要列出折價券、點數折抵那一行，直接把折扣攤到品項或忽略。
只回覆 JSON：{"ok":true,"shop":"店家或平台","date":"YYYY-MM-DD","total":實付總額,"items":[{"item":"","amt":0,"qty":1,"cat":""}]}
如果看不出是購物憑證，回覆 {"ok":false,"why":"一句話說明"}`;
let scan=null;
async function startScan(file){
  if(!gemKey()){toast('拍照辨識要用 Gemini，請先到「設定 → AI 設定」貼上金鑰');S.tab='set';render();return}
  scan={busy:true,items:[],msg:'辨識中，約 5–15 秒…'}; drawScan();
  try{
    const blob=await shrink(file,2048), data=await blobToData(blob);
    const parts=[{text:SCAN_PROMPT(todayYmd())},{inline_data:{mime_type:'image/jpeg',data:data.split(',')[1]}}];
    let r; try{ r=await gemini(parts) }catch(e){ if(e&&e.code==='parse'){ scan.msg='第一次沒讀好，再試一次…'; drawScan(); r=await gemini(parts) } else throw e }
    if(!r||r.ok===false){scan={busy:false,items:[],msg:'看不出是發票或訂單：'+(r&&r.why||'請拍清楚一點再試')};drawScan();return}
    const d=/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')&&r.date<=todayYmd()?r.date:todayYmd();
    scan={busy:false,shop:String(r.shop||''),d,total:+r.total||0,items:(r.items||[]).filter(x=>x&&x.item).map(x=>({on:true,item:String(x.item).slice(0,60),amt:Math.round(+x.amt||0),qty:+x.qty||1,cat:MC[x.cat]?x.cat:guessCat(x.item)})),payer:myName()};
    if(!scan.items.length) scan.msg='沒有讀到品項，請再拍一次或手動記帳';
  }catch(e){gemErr(e);scan=null;document.getElementById('modal').innerHTML='';return}
  drawScan();
}
function syncScan(){if(!scan||scan.busy)return; scan.shop=grab('sc-shop').trim(); scan.d=grab('sc-d')||scan.d;
  scan.items.forEach((x,i)=>{x.item=grab('sc-i'+i).trim();x.amt=Math.round(+grab('sc-a'+i)||0);x.cat=grab('sc-c'+i)||x.cat;const ck=document.getElementById('sc-on'+i);if(ck)x.on=ck.checked})}
function drawScan(){
  const s=scan, sum=s.items.filter(x=>x.on).reduce((a,x)=>a+x.amt,0);
  const pay=payers();
  document.getElementById('modal').innerHTML=`<div class="scrim" data-ma="sclose"><div class="sheet" role="dialog" aria-modal="true" aria-label="辨識結果">
   <div class="grab"></div><div class="sh-hd"><span class="badge" style="--c:var(--c-formula)">${ic('photo')}</span><h3>發票／訂單辨識</h3><button class="x" data-ma="sclose" aria-label="關閉">${ic('x')}</button></div>
   ${s.busy||!s.items.length?`<div class="card"><p class="hint" style="margin:0">${esc(s.msg||'')}</p></div>`:`
   <div class="card"><div class="row"><div style="flex:1.2"><label class="lbl" for="sc-shop">店家</label><input class="field" id="sc-shop" value="${esc(s.shop)}"></div><div style="flex:1"><label class="lbl" for="sc-d">日期</label><input class="field num" id="sc-d" type="date" value="${s.d}"></div></div>
    ${pay.length?`<span class="lbl" style="margin-top:10px">誰付的</span><div class="pills">${pay.map(p=>`<button class="pill" data-scp="${esc(p)}" aria-pressed="${s.payer===p}">${esc(p)}</button>`).join('')}</div>`:''}</div>
   ${s.items.map((x,i)=>`<div class="card scrow"><div class="row"><input type="checkbox" id="sc-on${i}" ${x.on?'checked':''} aria-label="要記這一項"><input class="field" id="sc-i${i}" value="${esc(x.item)}" aria-label="品項"></div>
     <div class="row" style="margin-top:8px"><select class="field" id="sc-c${i}" aria-label="分類">${MCATS.map(c=>`<option value="${c.k}" ${x.cat===c.k?'selected':''}>${c.n}</option>`).join('')}</select><input class="field num" id="sc-a${i}" type="number" inputmode="numeric" value="${x.amt}" aria-label="金額" style="max-width:120px"></div></div>`).join('')}
   <p class="hint">勾選的 ${s.items.filter(x=>x.on).length} 項合計 <b>${money(sum)}</b>${s.total&&Math.abs(s.total-sum)>1?`，發票總額 ${money(s.total)}（不一樣的話請檢查金額）`:''}</p>
   <button class="save" data-ma="scsave">${ic('check')}存入花費</button>`}</div></div>`;
}

/* ───── 新增／編輯 ───── */
let ecur=null;
function openExp(e){
  ecur=e?{...e}:{d:todayYmd(),cat:'',amt:'',item:'',payer:myName()}; drawExp();
}
function drawExp(confirming){
  const r=ecur, isNew=!r.id, pay=payers();
  const items=[...new Map(S.exp.filter(x=>x.item).map(x=>[itemKey(x.item),x])).values()].slice(0,8);
  const shops=[...new Set(S.exp.map(x=>x.shop).filter(Boolean))].slice(0,6);
  document.getElementById('modal').innerHTML=`<div class="scrim" data-ma="close"><div class="sheet" role="dialog" aria-modal="true" aria-label="花費">
   <div class="grab"></div><div class="sh-hd">${mbadge(r.cat||'other',1)}<h3>${isNew?'記一筆花費':'修改花費'}</h3><button class="x" data-ma="close" aria-label="關閉">${ic('x')}</button></div>
   <div class="card"><label class="lbl" for="e-item">買了什麼</label><input class="field" id="e-item" value="${esc(r.item||'')}" maxlength="60" placeholder="例如：幫寶適 M 號尿布">
     ${isNew&&items.length?`<div class="pills" style="margin-top:8px">${items.map(x=>`<button class="pill" data-eitem="${esc(x.id)}">${esc(x.item)}</button>`).join('')}</div>`:''}</div>
   <div class="card"><div class="row"><div style="flex:1.4"><label class="lbl" for="e-amt">金額（元）</label><input class="field num big" id="e-amt" type="number" inputmode="numeric" min="0" value="${r.amt??''}" ${r.gift?'disabled':''}></div>
     <div style="flex:1"><label class="lbl" for="e-qty">數量</label><input class="field num" id="e-qty" type="number" inputmode="numeric" min="1" value="${r.qty??''}" placeholder="1"></div></div>
     <div class="timer-opts" style="margin:12px 0 0"><span>別人送的（不算進花費）</span><button class="toggle" data-ma="gift" aria-pressed="${!!r.gift}" aria-label="別人送的"></button></div>
     ${r.gift?`<input class="field" id="e-giver" value="${esc(r.giver||'')}" placeholder="誰送的？例如：阿嬤" maxlength="20">`:''}</div>
   <div class="card"><span class="lbl">分類 <small>${r.cat?'':'（不選會依品名自動判斷）'}</small></span><div class="pills">${MCATS.map(c=>`<button class="pill" style="--c:${c.c}" data-ecat="${c.k}" aria-pressed="${r.cat===c.k}">${c.n}</button>`).join('')}</div></div>
   <div class="card"><div class="row"><div style="flex:1"><label class="lbl" for="e-d">日期</label><input class="field num" id="e-d" type="date" value="${r.d}"></div>
     <div style="flex:1"><label class="lbl" for="e-shop">店家</label><input class="field" id="e-shop" value="${esc(r.shop||'')}" maxlength="30" placeholder="選填"></div></div>
     ${shops.length?`<div class="pills" style="margin-top:8px">${shops.map(s=>`<button class="pill" data-eshop="${esc(s)}">${esc(s)}</button>`).join('')}</div>`:''}
     ${r.gift?'':`<span class="lbl" style="margin-top:12px">誰付的</span><div class="pills">${pay.map(p=>`<button class="pill" data-epay="${esc(p)}" aria-pressed="${r.payer===p}">${esc(p)}</button>`).join('')}</div>
     <input class="field" id="e-payer" value="${esc(pay.includes(r.payer)?'':r.payer||'')}" placeholder="其他付款人（選填）" maxlength="20" style="margin-top:8px">`}</div>
   <div class="card"><label class="lbl" for="e-note">備註</label><input class="field" id="e-note" value="${esc(r.note||'')}" maxlength="100" placeholder="例如：週年慶、買一送一"></div>
   ${S.readOnly?'':`<button class="save" data-ma="save">${ic('check')}${isNew?'記帳':'儲存修改'}</button>`+(!isNew?(confirming?`<div class="confirm"><button data-ma="cdel">取消</button><button class="yes" data-ma="dodel">確定刪除</button></div>`:`<button class="del" data-ma="askdel">刪除這筆</button>`):'')}
   ${!isNew&&r.src==='line'?'<p class="hint" style="text-align:center">這筆是從 LINE 記的</p>':''}</div></div>`;
}
function syncExp(){if(!ecur)return; const v=id=>grab(id);
  ecur.item=v('e-item').trim(); if(!ecur.gift) ecur.amt=v('e-amt'); ecur.qty=v('e-qty'); ecur.d=v('e-d')||todayYmd(); ecur.shop=v('e-shop').trim(); ecur.note=v('e-note').trim();
  if(ecur.gift) ecur.giver=v('e-giver').trim(); else { const o=v('e-payer').trim(); if(o) ecur.payer=o } }
async function expSave(){
  syncExp(); const r=ecur;
  if(!r.item&&!r.cat){toast('請填買了什麼或選分類');return}
  if(!r.gift&&!(+r.amt>0)){toast('請填金額');return}
  const out={d:r.d,t:r.t||Date.now(),amt:r.gift?0:Math.round(+r.amt),cat:r.cat||guessCat(r.item),item:r.item,qty:+r.qty>1?+r.qty:null,shop:r.shop,note:r.note,src:r.src||'app'};
  if(r.gift){out.gift=true;out.giver=r.giver} else out.payer=r.payer;
  if(r.id){out.id=r.id; if(r.by) out.by=r.by; if(r.grp) out.grp=r.grp}
  if(!await saveExp(out)) return;
  ecur=null; document.getElementById('modal').innerHTML=''; S.mMonth=ymKey(out.d);
  toast(`已記帳 ${out.gift?'（別人送的）':money(out.amt)}・${MC[out.cat].n}`); render();
}
function exportExpCsv(){
  const rows=[['日期','品項','分類','金額','數量','店家','誰付的','別人送的','備註','來源']];
  S.exp.slice().sort((a,b)=>a.d<b.d?-1:1).forEach(e=>rows.push([e.d.replace(/-/g,'/'),e.item||'',(MC[e.cat]||MC.other).n,e.gift?0:e.amt,e.qty||'',e.shop||'',e.payer||'',e.gift?(e.giver||'是'):'',e.note||'',e.src==='line'?'LINE':e.src==='scan'?'拍照辨識':'App']));
  const csv='﻿'+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=`${S.baby.name||'寶寶'}-花費-${todayYmd()}.csv`; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
}
function openBudget(){
  document.getElementById('modal').innerHTML=`<div class="scrim" data-ma="close"><div class="sheet" role="dialog" aria-modal="true" aria-label="每月預算">
   <div class="grab"></div><div class="sh-hd"><span class="badge" style="--c:var(--primary)">${ic('coin')}</span><h3>每月預算</h3><button class="x" data-ma="close" aria-label="關閉">${ic('x')}</button></div>
   <div class="card"><label class="lbl" for="b-amt">每月寶寶花費上限（元，0 = 不設）</label><input class="field num big" id="b-amt" type="number" inputmode="numeric" min="0" step="500" value="${+S.mMeta.budget||''}" placeholder="例如：8000">
   <p class="hint">花費頁會顯示剩多少、照日期進度有沒有超前。LINE 傳「本月」也會告訴你。</p></div>
   <button class="save" data-ma="bsave">${ic('check')}儲存</button></div></div>`;
}

/* ───── 設定：LINE 小助手綁定 ───── */
function lineCard(){
  if(S.noCloud||!famRef) return '';
  const f=S.fam||{}, users=Object.entries(f.lineUsers||{}), live=f.lineCode&&Date.now()-(f.lineCodeAt||0)<30*6e4;
  return `<div class="sect" id="line-card"><h2>LINE 小助手</h2><span>${users.length} 人已綁定</span></div><div class="card">
   ${users.map(([id,u])=>`<div class="mem"><span>${esc(u.name||'LINE 使用者')}</span><button data-ma="unline" data-id="${esc(id)}">解除</button></div>`).join('')}
   ${live?`<p style="margin:${users.length?'12px':'0'} 0 0;font-size:15px">在 LINE「果果日記」官方帳號傳：</p><div class="code num">綁定 ${esc(f.lineCode)}</div><p class="hint">30 分鐘內有效，你和太太都可以用同一組。</p>`
     :`<button class="btn2" data-ma="lcode" style="margin-top:${users.length?'10px':'0'}">產生綁定碼</button>`}
   <p class="hint">綁定後在 LINE 可以：<br>・記帳：「尿布 699」「奶粉 2 罐 1580 好市多」「阿嬤送推車」<br>・傳發票、收據、網購訂單截圖，自動拆品項記帳<br>・查詢：「本月」「上個月」「今天喝多少奶」「尿布這個月花多少」<br>・記錄果果：「配方奶 120」「10 點喝母乳 90」「便便 黃色」「睡了」「起床」<br>・記錯了傳「撤銷」</p>
   <p class="hint">需要先在 Google Apps Script 裝好小助手（一次就好）。AI 理解文字與照片會用「AI 設定」裡的 Gemini 金鑰。</p></div>`;
}

/* ───── events ───── */
document.addEventListener('click',async ev=>{
  const mv=ev.target.closest('[data-mv]'); if(mv){S.mView=mv.dataset.mv;render();return}
  const mc=ev.target.closest('[data-mcat]'); if(mc){S.mCat=mc.dataset.mcat;S.mView='list';render();return}
  const ei=ev.target.closest('[data-eitem]'); if(ei&&ecur){const x=S.exp.find(e=>e.id===ei.dataset.eitem); if(x){syncExp();Object.assign(ecur,{item:x.item,cat:x.cat,amt:x.amt,qty:x.qty||'',shop:x.shop||ecur.shop});drawExp()} return}
  const ec=ev.target.closest('[data-ecat]'); if(ec&&ecur){syncExp();ecur.cat=ecur.cat===ec.dataset.ecat?'':ec.dataset.ecat;drawExp();return}
  const es=ev.target.closest('[data-eshop]'); if(es){document.getElementById('e-shop').value=es.dataset.eshop;return}
  const ep=ev.target.closest('[data-epay]'); if(ep&&ecur){syncExp();ecur.payer=ep.dataset.epay;const o=document.getElementById('e-payer');if(o)o.value='';drawExp();return}
  const sp=ev.target.closest('[data-scp]'); if(sp&&scan){syncScan();scan.payer=sp.dataset.scp;drawScan();return}
  const a=ev.target.closest('[data-ma]'); if(!a) return;
  const act=a.dataset.ma;
  if((act==='close'||act==='sclose')&&ev.target!==a&&a.classList.contains('scrim')) return;
  switch(act){
    case 'mprev': S.mMonth=addMonth(S.mMonth,-1); render(); break;
    case 'mnext': S.mMonth=addMonth(S.mMonth,1); render(); break;
    case 'add': openExp(); break;
    case 'addlike': { const x=S.exp.find(e=>itemKey(e.item)===itemKey(a.dataset.item)); openExp(); if(x) Object.assign(ecur,{item:x.item,cat:x.cat,amt:x.amt,qty:x.qty||'',shop:x.shop||''}); drawExp(); break }
    case 'edit': { if(S.readOnly) break; const x=S.exp.find(e=>e.id===a.dataset.id); if(x) openExp(x); break }
    case 'close': ecur=null; scan=null; document.getElementById('modal').innerHTML=''; render(); break;
    case 'sclose': scan=null; document.getElementById('modal').innerHTML=''; render(); break;
    case 'gift': syncExp(); ecur.gift=!ecur.gift; drawExp(); break;
    case 'save': await expSave(); break;
    case 'askdel': syncExp(); drawExp(true); break;
    case 'cdel': drawExp(false); break;
    case 'dodel': await delExp(ecur.id); ecur=null; document.getElementById('modal').innerHTML=''; toast('已刪除'); render(); break;
    case 'budget': openBudget(); break;
    case 'bsave': await saveMoneyMeta({budget:Math.max(0,Math.round(+grab('b-amt')||0))}); document.getElementById('modal').innerHTML=''; toast('預算已儲存'); render(); break;
    case 'csv': exportExpCsv(); break;
    case 'ai': runMoneyAI(); break;
    case 'goset': S.tab='set'; render(); setTimeout(()=>document.getElementById('line-card')?.scrollIntoView({behavior:'smooth'}),50); break;
    case 'scsave': { syncScan(); const pick=scan.items.filter(x=>x.on&&x.item); if(!pick.length){toast('請至少勾選一項');return}
      const grp='g'+Date.now(); let n=0;
      for(const x of pick){ if(await saveExp({d:scan.d,t:Date.now(),amt:x.amt,cat:x.cat,item:x.item,qty:x.qty>1?x.qty:null,shop:scan.shop,payer:scan.payer,src:'scan',grp})) n++ }
      const d=scan.d; scan=null; document.getElementById('modal').innerHTML=''; S.mMonth=ymKey(d); toast(`已存入 ${n} 筆`); render(); break }
    case 'lcode': { const code=String(Math.floor(100000+Math.random()*900000)); try{ await famRef.update({lineCode:code,lineCodeAt:Date.now()}) }catch(e){writeErr(e)} break }
    case 'unline': { if(a.dataset.sure!=='1'){a.dataset.sure='1';a.textContent='確定解除？';return}
      try{ await famRef.update({['lineUsers.'+a.dataset.id]:firebase.firestore.FieldValue.delete()}); toast('已解除，對方在 LINE 要重新綁定') }catch(e){writeErr(e)} break }
  }
});
document.addEventListener('input',ev=>{ if(ev.target.id==='m-q'){ S.mQ=ev.target.value; clearTimeout(window._mq); window._mq=setTimeout(()=>{render(); const el=document.getElementById('m-q'); if(el){el.focus(); el.setSelectionRange(el.value.length,el.value.length)}},250) } });
document.addEventListener('change',ev=>{
  if(ev.target.id==='ms-file'){ const f=ev.target.files[0]; ev.target.value=''; if(f) startScan(f) }
  if(scan&&ev.target.id&&/^sc-(on|c)\d/.test(ev.target.id)){ syncScan(); drawScan() }
});
