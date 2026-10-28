// 讀出目前雲端上線中的 Firestore 規則（只輸出摘要，不含任何個人資料）
import admin from 'firebase-admin'; import fs from 'fs'; import crypto from 'crypto';
const sa = JSON.parse(process.env.FIREBASE_SA); const P = sa.project_id;
const tok = (await admin.credential.cert(sa).getAccessToken()).access_token;
const api = async u => { const r = await fetch('https://firebaserules.googleapis.com/v1/' + u, { headers: { Authorization: 'Bearer ' + tok } }); const j = await r.json(); if (!r.ok) throw new Error(r.status + ' ' + JSON.stringify(j).slice(0, 200)); return j; };
const rel = await api(`projects/${P}/releases/cloud.firestore`);
const rs = await api(rel.rulesetName);
const src = (rs.source.files || []).map(f => f.content).join('\n');
const mine = fs.readFileSync('../../public/guoguo/firestore.rules', 'utf8');
const h = s => crypto.createHash('sha256').update(s.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 10);
const allows = src.split('\n').map(l => l.trim()).filter(l => /^allow /.test(l));
console.log(src);
console.log(`::notice::live rules updated ${rel.updateTime} lines=${src.split('\n').length} hash=${h(src)} repo-hash=${h(mine)} same=${h(src) === h(mine)}`);
console.log(`::notice::live allow lines: ${allows.join(' ¦ ').slice(0, 900)}`);
