/* ───────── 寶寶狀態辨識（第一版：觀察線索＋記錄情境 → 樸素貝氏模型） ─────────
   資料：families/{fid}/cry  { t, x:{特徵}, p:{餓,抱,尿,氣}, actual, flags, v }
   模型：先用通用育兒經驗當先驗（約等於 20 筆資料的份量），每回報一筆就用果果自己的資料更新；
        累積越多，越以果果的資料為主。出現警訊時不做推測，直接請家長聯絡醫師。 */
(function(){
const CY_C=[['hungry','餓了','--c-formula'],['hold','想抱抱','--c-mood'],['diaper','尿布濕','--c-pee'],['gas','脹氣','--c-sick']];
const CY_CUES=[['suck','吸手／找奶'],['legs','腿往肚子縮'],['arch','弓背扭動'],['hold','抱起來就停'],['shrill','哭聲尖銳']];
const CY_FLAGS=[['fever','發燒（≥38°C）'],['scream','持續尖哭，怎麼哄都停不下來'],['vomit','嘔吐（噴射狀、帶綠色或血）'],['breath','呼吸異常（很喘、胸口凹陷、嘴唇發紫）']];
// 通用先驗：P(特徵值｜原因)，依常見育兒經驗設定
const P0={
  suck:{hungry:.75,hold:.15,diaper:.15,gas:.2}, legs:{hungry:.1,hold:.1,diaper:.15,gas:.7}, arch:{hungry:.25,hold:.15,diaper:.3,gas:.6},
  hold:{hungry:.1,hold:.8,diaper:.15,gas:.2}, shrill:{hungry:.2,hold:.1,diaper:.15,gas:.45},
  feed:{hungry:[.05,.2,.35,.4],hold:[.3,.35,.2,.15],diaper:[.25,.3,.25,.2],gas:[.55,.25,.12,.08]},     // 距上次喝奶／平常間隔：<0.5, 0.5–0.9, 0.9–1.2, >1.2
  dia:{hungry:[.3,.3,.2,.2],hold:[.35,.3,.2,.15],diaper:[.05,.2,.35,.4],gas:[.3,.3,.2,.2]},           // 距上次換尿布：<1h, 1–2h, 2–3h, >3h
  poop:{hungry:[.6,.3,.1],hold:[.6,.3,.1],diaper:[.7,.2,.1],gas:[.35,.35,.3]},                         // 上次排便：<12h, 12–24h, >24h
  awake:{hungry:[.35,.4,.25],hold:[.2,.35,.45],diaper:[.33,.34,.33],gas:[.35,.35,.3]},                 // 醒著多久：<30m, 30–90m, >90m
  hour:{hungry:[.35,.25,.4],hold:[.35,.4,.25],diaper:[.4,.3,.3],gas:[.3,.45,.25]}                      // 白天 7–19、傍晚 19–23、夜間 23–7
};
const PRIOR={hungry:.4,hold:.25,diaper:.15,gas:.2}, K=20, NEED=50;
const BIN_TXT={feed:['剛喝過不久','比平常間隔短一點','差不多到平常的喝奶時間','已超過平常的喝奶間隔'],dia:['1 小時內換過尿布','1–2 小時前換過尿布','2–3 小時沒換尿布','超過 3 小時沒換尿布'],
  poop:['12 小時內有排便','12–24 小時沒排便','超過 24 小時沒排便'],awake:['剛醒不到 30 分','醒了 30–90 分','醒超過 90 分，可能累了'],hour:['白天','傍晚（容易脹氣、討抱的時段）','夜間']};
S.cry=S.cry||[]; let cy=null;

function cyCtx(){
  const now=Date.now(), L=S.logs;
  const lf=L.find(l=>FEEDS.includes(l.type)), ld=L.find(l=>l.type==='pee'||l.type==='poop'), lp=L.find(l=>l.type==='poop');
  const sl=L.find(l=>l.type==='sleep'), gap=avgGap(FEEDS,48)||(+S.baby.interval||3)*36e5;
  const lastTemp=L.find(l=>l.type==='temp'&&now-l.t<12*36e5);
  const c={now,lf,ld,lp,sl,gap,fever:lastTemp&&+lastTemp.c>=38?lastTemp:null};
  const x={};
  if(lf){const r=(now-lf.t)/gap; x.feed=r<.5?0:r<.9?1:r<=1.2?2:3}
  if(ld){const h=(now-ld.t)/36e5; x.dia=h<1?0:h<2?1:h<3?2:3}
  if(lp){const h=(now-lp.t)/36e5; x.poop=h<12?0:h<24?1:2}
  if(sl&&sl.end){const m=(now-sl.end)/6e4; x.awake=m<30?0:m<90?1:2}
  const hr=new Date(now).getHours(); x.hour=hr>=7&&hr<19?0:hr>=19&&hr<23?1:2;
  return {c,x};
}
function cyLabeled(){return S.cry.filter(r=>r.actual&&PRIOR[r.actual]&&r.x)}
function cyPredict(x){
  const D=cyLabeled(), N=D.length, nC={}; CY_C.forEach(([k])=>nC[k]=D.filter(r=>r.actual===k).length);
  const lp={}, why={};
  for(const [c] of CY_C){
    lp[c]=Math.log((nC[c]+K*PRIOR[c])/(N+K)); why[c]=[];
    for(const f in P0){
      let v=x[f]; if(v===undefined) continue;
      if(CY_CUES.some(([k])=>k===f)) v=v?1:0;
      const base=Array.isArray(P0[f][c])?P0[f][c][v]:(v?P0[f][c]:1-P0[f][c]);
      const hit=D.filter(r=>r.actual===c&&r.x[f]!==undefined&&((CY_CUES.some(([k])=>k===f)?(r.x[f]?1:0):r.x[f])===v)).length;
      const seen=D.filter(r=>r.actual===c&&r.x[f]!==undefined).length;
      const p=(hit+K*base)/(seen+K); lp[c]+=Math.log(p); why[c].push([f,v,p]);
    }
  }
  const m=Math.max(...Object.values(lp)), ex={}; let z=0; for(const c in lp){ex[c]=Math.exp(lp[c]-m); z+=ex[c]}
  const prob={}; for(const c in ex) prob[c]=ex[c]/z;
  // 判斷依據：這個原因比其他原因更符合的線索
  const reasons={};
  for(const [c] of CY_C){
    reasons[c]=why[c].map(([f,v,p])=>{const others=CY_C.filter(([o])=>o!==c).map(([o])=>why[o].find(w=>w[0]===f)[2]); const avg=others.reduce((a,b)=>a+b,0)/others.length; return [f,v,p/avg]})
      .filter(w=>w[2]>1.4&&!(CY_CUES.some(([k])=>k===w[0])&&!w[1])).sort((a,b)=>b[2]-a[2]).slice(0,3).map(([f,v])=>cyWhy(f,v));
  }
  return {prob,reasons,N};
}
function cyWhy(f,v){const cue=CY_CUES.find(([k])=>k===f); if(cue) return cue[1]; const {c}=cy?cy.ctx:{c:{}};
  if(f==='feed'&&c.lf) return `距上次喝奶 ${dur(c.now-c.lf.t)}（平常約 ${dur(c.gap)}）`;
  if(f==='dia'&&c.ld) return `距上次換尿布 ${dur(c.now-c.ld.t)}`;
  if(f==='poop'&&c.lp) return `上次排便是 ${dur(c.now-c.lp.t)}前`;
  if(f==='awake'&&c.sl) return `睡醒後 ${dur(c.now-c.sl.end)}`;
  return BIN_TXT[f]?BIN_TXT[f][v]:f;
}
function cyAcc(){const D=cyLabeled().filter(r=>r.p); if(D.length<5) return null; const ok=D.slice(0,30).filter(r=>Object.entries(r.p).sort((a,b)=>b[1]-a[1])[0][0]===r.actual).length; return {ok,n:Math.min(30,D.length)}}

window.cryOpen=function(){ const ctx=cyCtx(); cy={cues:new Set(),flags:new Set(ctx.c.fever?['fever']:[]),ctx,saved:null}; cyDraw() };
function cyDraw(){
  const {c,x}=cy.ctx, flag=cy.flags.size>0;
  const xx={...x}; CY_CUES.forEach(([k])=>xx[k]=cy.cues.has(k)?1:0);
  const pr=flag?null:cyPredict(xx); cy.x=xx; cy.p=pr&&pr.prob;
  const row=(t,v)=>`<div class="cy-ctx"><span>${t}</span><b class="num">${v}</b></div>`;
  const ctxHtml=[row('距上次喝奶',c.lf?dur(c.now-c.lf.t):'沒有記錄'),row('距上次換尿布',c.ld?dur(c.now-c.ld.t):'沒有記錄'),row('上次排便',c.lp?dur(c.now-c.lp.t)+'前':'沒有記錄'),
    row('現在時間',hm(c.now)),row(c.sl&&!c.sl.end?'正在睡':'睡醒後',c.sl?(c.sl.end?dur(c.now-c.sl.end):dur(c.now-c.sl.t)):'沒有記錄')].join('');
  const acc=cyAcc(), N=cyLabeled().length;
  const model=N>=NEED?`已依果果自己的 ${N} 筆回報調整${acc?`・最近 ${acc.n} 筆準確率 ${Math.round(acc.ok/acc.n*100)}%`:''}`:`目前主要依通用育兒經驗判斷・已累積 ${N}／${NEED} 筆回報${acc?`・準確率 ${Math.round(acc.ok/acc.n*100)}%`:''}`;
  let res;
  if(flag) res=`<div class="card cy-alert"><b>請聯絡醫師</b><p>${[...cy.flags].map(k=>CY_FLAGS.find(f=>f[0]===k)[1]).join('、')}${c.fever&&cy.flags.has('fever')?`（${hm(c.fever.t)} 量到 ${(+c.fever.c).toFixed(1)}°C）`:''}，這類情況不適合用辨識推測。</p>
    <p>未滿 3 個月發燒、呼吸困難或嘴唇發紫，請直接就醫或撥 119。</p><button class="mini" data-cy="sick">記一筆不舒服</button></div>`;
  else{
    const ord=CY_C.slice().sort((a,b)=>pr.prob[b[0]]-pr.prob[a[0]]);
    res=`<div class="card"><span class="lbl">辨識結果</span>${ord.map(([k,n,col],i)=>{const v=Math.round(pr.prob[k]*100);return `<div class="cy-r${i===0?' top':''}" style="--c:var(${col})"><div class="cy-rh"><b>${n}</b><span class="num">${v}%</span></div><div class="cy-bar"><i style="width:${v}%"></i></div>${pr.reasons[k].length?`<small>${pr.reasons[k].map(esc).join('・')}</small>`:''}</div>`}).join('')}
      <p class="hint">${model}。結果僅供參考，寶寶看起來不對勁時請相信自己的判斷。</p></div>
     <div class="card"><span class="lbl">處理後，實際是？（回報越多越準）</span>${cy.saved?`<p class="cy-done">已記下：${esc((CY_C.find(z=>z[0]===cy.saved)||[0,'其他／不確定'])[1])}</p>${cyQuick(cy.saved)}`
      :`<div class="pills">${CY_C.map(([k,n,col])=>`<button class="pill" style="--c:var(${col})" data-cylab="${k}">${n}</button>`).join('')}<button class="pill" data-cylab="other">其他／不確定</button></div>`}</div>`;
  }
  document.getElementById('modal').innerHTML=`<div class="scrim" data-cy="close"><div class="sheet" role="dialog" aria-modal="true" aria-label="寶寶狀態辨識">
   <div class="grab"></div><div class="sh-hd"><span class="badge" style="--c:var(--primary)">${ic('baby')}</span><h3>寶寶狀態辨識</h3><button class="x" data-cy="close" aria-label="關閉">${ic('x')}</button></div>
   <div class="card"><span class="lbl">有沒有這些警訊？</span><div class="pills">${CY_FLAGS.map(([k,n])=>`<button class="pill" style="--c:var(--warn)" data-cyflag="${k}" aria-pressed="${cy.flags.has(k)}">${n}</button>`).join('')}</div></div>
   <div class="card"><span class="lbl">觀察到什麼？（可複選）</span><div class="pills">${CY_CUES.map(([k,n])=>`<button class="pill" data-cycue="${k}" aria-pressed="${cy.cues.has(k)}" ${flag?'disabled':''}>${n}</button>`).join('')}</div></div>
   <div class="card"><span class="lbl">從記錄自動帶入</span>${ctxHtml}</div>
   ${res}</div></div>`;
}
function cyQuick(k){
  const b=(t,n)=>`<button class="pill" style="--c:${cvar(t)}" data-cylog="${t}">記一筆${n}</button>`;
  const m=k==='hungry'?b('bmilk','瓶餵母乳')+b('formula','配方奶')+b('breast','母乳'):k==='diaper'?b('pee','尿尿')+b('poop','便便'):'';
  return m?`<div class="pills">${m}</div>`:'';
}
async function cySave(actual){
  const rec={t:cy.ctx.c.now,x:cy.x,p:cy.p,actual,v:1,by:S.uid||null};
  if(S.mode==='db'){ try{ await famRef.collection('cry').add(rec) }catch(e){writeErr(e);return} }
  else { S.cry=[{id:'c'+Date.now(),...rec},...S.cry]; ls('bl_cry',S.cry) }
  cy.saved=actual; toast(cyLabeled().length+1>=NEED&&cyLabeled().length<NEED?'已累積 50 筆，之後會依果果的資料判斷':'已記下，謝謝回報'); cyDraw();
}
window.cryAttach=function(){
  if(S.mode==='db') subs.push(famRef.collection('cry').orderBy('t','desc').limit(500).onSnapshot(s=>{S.cry=s.docs.map(d=>({id:d.id,...d.data()}))},()=>{}));
  else S.cry=ls('bl_cry')||[];
};
document.addEventListener('click',e=>{
  const t=e.target;
  if(cy){
    const q=t.closest('[data-cycue]'); if(q){const k=q.dataset.cycue; cy.cues.has(k)?cy.cues.delete(k):cy.cues.add(k); cy.saved=null; cyDraw(); return}
  const f=t.closest('[data-cyflag]'); if(f){const k=f.dataset.cyflag; cy.flags.has(k)?cy.flags.delete(k):cy.flags.add(k); cyDraw(); return}
  const l=t.closest('[data-cylab]'); if(l){ cySave(l.dataset.cylab); return }
    const g=t.closest('[data-cylog]'); if(g){ const ty=g.dataset.cylog; cy=null; openSheet(ty); return }
  }
  const o=t.closest('[data-cy]'); if(!o) return; const k=o.dataset.cy;
  if(k==='close'){ if(t!==o&&o.classList.contains('scrim')) return; cy=null; document.getElementById('modal').innerHTML=''; render(); return }
  if(k==='open'){ if(S.readOnly){toast('你目前只能查看');return} cryOpen(); return }
  if(k==='sick'){ cy=null; openSheet('sick'); return }
});
})();
