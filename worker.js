const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});

const html = (title, body, script = "") => new Response(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title><style>
:root{--navy:#081a33;--blue:#0b4fa3;--gold:#d6a93b;--bg:#eef3f8;--card:#fff;--text:#0d1b2a;--muted:#667085;--line:#dbe3ec;--danger:#c62828;--ok:#147d43;--warn:#a15c00}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif}
a{color:inherit;text-decoration:none}.wrap{max-width:900px;margin:auto;padding:18px 14px 96px}.header{background:linear-gradient(135deg,var(--navy),#102f58);color:#fff;padding:18px;border-radius:18px;box-shadow:0 8px 24px #0b234033;margin-bottom:14px}
.header .brand{font-size:24px;font-weight:900;letter-spacing:.03em}.badge{display:inline-block;background:var(--gold);color:#111;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:900;margin-bottom:8px}
.sub{color:var(--muted);font-size:13px}.header .sub{color:#d6e3f2}.top,.between,.row{display:flex;gap:10px;align-items:center}.between{justify-content:space-between}.row{flex-wrap:wrap}
.btn{border:1px solid var(--line);background:#fff;color:var(--text);padding:11px 14px;border-radius:12px;font-weight:800;cursor:pointer}.btn.primary{background:var(--blue);color:#fff;border-color:var(--blue)}.btn.dark{background:var(--navy);color:#fff;border-color:var(--navy)}.btn.danger{color:var(--danger);border-color:#f0b8b8;background:#fff5f5}.btn.small{padding:8px 10px;font-size:12px}
.card,.stat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:15px;box-shadow:0 2px 10px #132d4a0a}.card{margin:12px 0}.title{font-size:18px;font-weight:900}.meta{display:flex;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:13px;margin:8px 0}.pill{display:inline-flex;border-radius:999px;background:#eaf1f8;padding:5px 9px;font-size:12px;font-weight:800}.pill.pending{background:#fff3d6;color:var(--warn)}.pill.reserved{background:#e8f2ff;color:var(--blue)}.pill.completed{background:#e6f6ed;color:var(--ok)}.pill.cancelled,.pill.absent{background:#fdeaea;color:var(--danger)}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stat b{display:block;font-size:25px;margin-top:5px}.section{font-weight:900;font-size:17px;margin:22px 2px 8px}.empty{text-align:center;color:var(--muted);padding:38px 10px}
input,textarea,select{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:12px 13px;font:inherit;background:#fff}textarea{min-height:90px}.field{margin:12px 0}.field label{display:block;font-size:12px;color:var(--muted);font-weight:800;margin-bottom:6px}.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.notice{padding:11px 12px;border-radius:12px;background:#eaf3ff;color:#0b4fa3;font-size:13px;margin:10px 0}.notice.error{background:#fff0f0;color:#b42318}.notice.success{background:#eaf8ef;color:#147d43}
.modal{position:fixed;inset:0;background:#06152799;display:none;align-items:flex-end;justify-content:center;z-index:30}.modal.open{display:flex}.sheet{background:#fff;width:100%;max-width:640px;max-height:92vh;overflow:auto;border-radius:22px 22px 0 0;padding:18px;padding-bottom:calc(20px + env(safe-area-inset-bottom))}
.login{max-width:430px;margin:60px auto 0}.footerNav{position:fixed;left:0;right:0;bottom:0;background:#fffffffa;border-top:1px solid var(--line);display:flex;gap:10px;padding:8px 14px calc(8px + env(safe-area-inset-bottom));z-index:20}.footerNav a{flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:900}.footerNav .active{background:var(--navy);color:#fff}
.res{border-top:1px solid var(--line);padding:13px 0}.res:first-child{border-top:0}.statusButtons{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
@media(max-width:700px){.grid{grid-template-columns:1fr 1fr}.formgrid{grid-template-columns:1fr}.header .between{align-items:flex-start}.top{align-items:flex-start}}
</style></head><body>${body}<script>${script}</script></body></html>`, {headers:{"content-type":"text/html; charset=utf-8"}});

const PUBLIC_BODY = `
<div class="wrap">
  <div class="header">
    <div class="between">
      <div><span class="badge">LOMITA POLICE</span><div class="brand">警察研修予約</div><div class="sub">研修日程を確認して参加申請してください</div></div>
      <a class="btn small" href="/admin">管理</a>
    </div>
  </div>
  <div id="msg"></div><div id="list"><div class="empty">読み込み中...</div></div>
</div>
<div id="booking" class="modal"><div class="sheet">
  <button class="btn small" style="float:right" onclick="closeBooking()">閉じる</button>
  <div class="title" id="bookTitle">研修予約</div>
  <div class="sub" style="margin-top:4px">申請後、管理者の承認で予約確定になります。</div>
  <div class="field"><label>プレイヤー名 *</label><input id="playerName" maxlength="40"></div>
  <div class="field"><label>Discord ID / ユーザー名 *</label><input id="discordId" maxlength="60" placeholder="例：mattsu / 123456789"></div>
  <div class="field"><label>所属・階級</label><input id="affiliation" maxlength="60" placeholder="例：Lomita Police / Officer"></div>
  <div class="field"><label>備考</label><textarea id="note" maxlength="250"></textarea></div>
  <button class="btn primary" style="width:100%" onclick="submitBooking()">参加申請する</button>
</div></div>`;

const PUBLIC_SCRIPT = String.raw`
let selectedTraining=null;
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmt(d){return new Date(d+'T00:00:00').toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'})}
async function load(){
 const r=await fetch('/api/trainings'); const data=await r.json(); const el=document.getElementById('list');
 if(!data.length){el.innerHTML='<div class="empty">現在、受付中の研修はありません。</div>';return}
 el.innerHTML=data.map(t=>{
   const remain=Math.max(0,Number(t.capacity)-Number(t.active_count));
   const cat=t.category||'一般研修'; const disabled=remain<=0?'disabled style="opacity:.45"':'';
   return '<div class="card"><div class="between"><div><span class="pill">'+esc(cat)+'</span><div class="title" style="margin-top:8px">'+esc(t.title)+'</div><div class="meta"><span>📅 '+fmt(t.training_date)+'</span><span>🕒 '+esc(t.start_time)+(t.end_time?'〜'+esc(t.end_time):'')+'</span>'+(t.location?'<span>📍 '+esc(t.location)+'</span>':'')+'</div></div><span class="pill">残り '+remain+'名</span></div>'+(t.description?'<div class="sub" style="margin:8px 0 12px">'+esc(t.description)+'</div>':'')+'<div class="between"><span class="sub">担当：'+esc(t.instructor||'未設定')+'　申請/予約 '+t.active_count+'/'+t.capacity+'</span><button class="btn primary" '+disabled+' onclick="openBooking('+t.id+',\\''+esc(t.title).replace(/'/g,"\\'")+'\\')">'+(remain?'申請する':'満員')+'</button></div></div>'
 }).join('')
}
function openBooking(id,title){selectedTraining={id,title};document.getElementById('bookTitle').textContent=title+' 参加申請';document.getElementById('booking').classList.add('open')}
function closeBooking(){document.getElementById('booking').classList.remove('open')}
function show(t,c){const e=document.getElementById('msg');e.innerHTML='<div class="notice '+c+'">'+esc(t)+'</div>';setTimeout(()=>e.innerHTML='',4200)}
async function submitBooking(){
 const player_name=document.getElementById('playerName').value.trim(), discord_id=document.getElementById('discordId').value.trim();
 if(!player_name)return show('プレイヤー名を入力してください','error');
 if(!discord_id)return show('Discord IDを入力してください','error');
 const body={training_id:selectedTraining.id,player_name,discord_id,affiliation:document.getElementById('affiliation').value.trim(),note:document.getElementById('note').value.trim()};
 const r=await fetch('/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const d=await r.json();
 if(!r.ok)return show(d.error||'申請できませんでした','error');
 closeBooking(); ['playerName','discordId','affiliation','note'].forEach(id=>document.getElementById(id).value=''); show('参加申請を送信しました。承認をお待ちください。','success'); load();
}
load();`;

const ADMIN_BODY = `
<div id="loginView" class="wrap login"><div class="card">
 <span class="badge">LOMITA POLICE</span><div class="title" style="font-size:24px">研修管理</div><div class="sub" style="margin:5px 0 16px">共通パスワードを入力してください</div>
 <div id="loginMsg"></div><input id="password" type="password" placeholder="パスワード" onkeydown="if(event.key==='Enter')login()">
 <button class="btn dark" style="width:100%;margin-top:10px" onclick="login()">管理画面を開く</button>
 <a href="/" class="btn" style="display:block;text-align:center;margin-top:8px">予約ページへ戻る</a>
</div></div>
<div id="adminView" style="display:none"><div class="wrap">
 <div class="header"><div class="between"><div><span class="badge">LOMITA POLICE</span><div class="brand">研修管理本部</div><div class="sub">研修・参加申請・受講状況を一括管理</div></div><div class="row"><button class="btn small" onclick="logout()">ログアウト</button><button class="btn primary small" onclick="openTraining()">＋研修追加</button></div></div></div>
 <div id="msg"></div>
 <div class="grid"><div class="stat"><span class="sub">今後の研修</span><b id="sTrain">0</b></div><div class="stat"><span class="sub">承認待ち</span><b id="sPending">0</b></div><div class="stat"><span class="sub">予約確定</span><b id="sReserved">0</b></div><div class="stat"><span class="sub">受講済み</span><b id="sCompleted">0</b></div></div>
 <div class="section">研修一覧</div><div id="adminList"></div>
</div><div class="footerNav"><a href="/">予約ページ</a><a class="active" href="/admin">管理画面</a></div></div>
<div id="trainingModal" class="modal"><div class="sheet">
 <button class="btn small" style="float:right" onclick="closeTraining()">閉じる</button><div class="title" id="trainingModalTitle">研修を追加</div>
 <input type="hidden" id="trainingId">
 <div class="field"><label>研修種別 *</label><select id="category"><option>基礎研修</option><option>射撃研修</option><option>運転研修</option><option>逮捕・制圧研修</option><option>無線・指令研修</option><option>幹部研修</option><option>特殊部隊研修</option><option>その他</option></select></div>
 <div class="field"><label>研修名 *</label><input id="title" maxlength="60"></div>
 <div class="field"><label>説明</label><textarea id="description" maxlength="300"></textarea></div>
 <div class="formgrid"><div class="field"><label>日付 *</label><input id="trainingDate" type="date"></div><div class="field"><label>定員 *</label><input id="capacity" type="number" min="1" max="999" value="10"></div><div class="field"><label>開始 *</label><input id="startTime" type="time"></div><div class="field"><label>終了</label><input id="endTime" type="time"></div><div class="field"><label>担当者</label><input id="instructor" maxlength="50"></div><div class="field"><label>場所</label><input id="location" maxlength="60"></div></div>
 <button class="btn primary" style="width:100%" onclick="saveTraining()">保存する</button>
</div></div>
<div id="resModal" class="modal"><div class="sheet"><button class="btn small" style="float:right" onclick="closeReservations()">閉じる</button><div class="title" id="resTitle">参加者管理</div><div id="resList"></div></div></div>`;

const ADMIN_SCRIPT = String.raw`
let adminPassword=localStorage.getItem('trainingAdminPassword')||'', trainings=[], activeTrainingId=null;
const labels={pending:'承認待ち',reserved:'予約確定',completed:'受講済み',absent:'欠席',cancelled:'キャンセル'};
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function auth(){return {'content-type':'application/json','x-admin-password':adminPassword}}
function msg(t,c){const e=document.getElementById('msg');e.innerHTML='<div class="notice '+c+'">'+esc(t)+'</div>';setTimeout(()=>e.innerHTML='',3500)}
async function login(){adminPassword=document.getElementById('password').value;const r=await fetch('/api/admin/check',{headers:{'x-admin-password':adminPassword}});if(!r.ok){document.getElementById('loginMsg').innerHTML='<div class="notice error">パスワードが違います</div>';return}localStorage.setItem('trainingAdminPassword',adminPassword);showAdmin();loadAdmin()}
function logout(){localStorage.removeItem('trainingAdminPassword');location.reload()}
function showAdmin(){document.getElementById('loginView').style.display='none';document.getElementById('adminView').style.display='block'}
async function verify(){if(!adminPassword)return;const r=await fetch('/api/admin/check',{headers:{'x-admin-password':adminPassword}});if(r.ok){showAdmin();loadAdmin()}}
function fmt(d){return new Date(d+'T00:00:00').toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'})}
async function loadAdmin(){
 const r=await fetch('/api/admin/trainings',{headers:auth()}); if(r.status===401)return logout(); trainings=await r.json(); render();
 const s=await fetch('/api/admin/stats',{headers:auth()}); const st=await s.json();
 sTrain.textContent=st.trainings;sPending.textContent=st.pending;sReserved.textContent=st.reserved;sCompleted.textContent=st.completed;
}
function render(){const e=document.getElementById('adminList');if(!trainings.length){e.innerHTML='<div class="empty">研修がありません。「＋研修追加」から作成してください。</div>';return}
 e.innerHTML=trainings.map(t=>'<div class="card"><div class="between"><div><span class="pill">'+esc(t.category||'一般研修')+'</span><div class="title" style="margin-top:7px">'+esc(t.title)+'</div><div class="meta"><span>📅 '+fmt(t.training_date)+'</span><span>🕒 '+esc(t.start_time)+(t.end_time?'〜'+esc(t.end_time):'')+'</span>'+(t.location?'<span>📍 '+esc(t.location)+'</span>':'')+'</div></div><span class="pill">'+t.active_count+'/'+t.capacity+'名</span></div><div class="row" style="margin-top:12px"><button class="btn small" onclick="openReservations('+t.id+',\\''+esc(t.title).replace(/'/g,"\\'")+'\\')">参加者管理</button><button class="btn small" onclick="openTraining('+t.id+')">編集</button><button class="btn danger small" onclick="deleteTraining('+t.id+')">削除</button></div></div>').join('')
}
function openTraining(id){const t=id?trainings.find(x=>x.id===id):null;trainingModal.classList.add('open');trainingModalTitle.textContent=t?'研修を編集':'研修を追加';trainingId.value=t?t.id:'';category.value=t?(t.category||'基礎研修'):'基礎研修';title.value=t?t.title:'';description.value=t?t.description:'';trainingDate.value=t?t.training_date:new Date().toISOString().slice(0,10);capacity.value=t?t.capacity:10;startTime.value=t?t.start_time:'';endTime.value=t?t.end_time:'';instructor.value=t?t.instructor:'';location.value=t?t.location:''}
function closeTraining(){trainingModal.classList.remove('open')}
async function saveTraining(){const body={category:category.value,title:title.value.trim(),description:description.value.trim(),training_date:trainingDate.value,capacity:Number(capacity.value),start_time:startTime.value,end_time:endTime.value,instructor:instructor.value.trim(),location:location.value.trim()};if(!body.title||!body.training_date||!body.start_time)return msg('必須項目を入力してください','error');const id=trainingId.value;const r=await fetch(id?'/api/admin/trainings/'+id:'/api/admin/trainings',{method:id?'PUT':'POST',headers:auth(),body:JSON.stringify(body)});if(!r.ok)return msg('保存できませんでした','error');closeTraining();msg('保存しました','success');loadAdmin()}
async function deleteTraining(id){if(!confirm('この研修と関連予約を削除しますか？'))return;const r=await fetch('/api/admin/trainings/'+id,{method:'DELETE',headers:auth()});if(r.ok){msg('削除しました','success');loadAdmin()}}
async function openReservations(id,title){activeTrainingId=id;resTitle.textContent=title+' / 参加者管理';resModal.classList.add('open');await loadReservations()}
function closeReservations(){resModal.classList.remove('open')}
async function loadReservations(){const r=await fetch('/api/admin/trainings/'+activeTrainingId+'/reservations',{headers:auth()});const data=await r.json();const e=resList;if(!data.length){e.innerHTML='<div class="empty">申請者はいません。</div>';return}
 e.innerHTML=data.map(x=>'<div class="res"><div class="between"><div><b>'+esc(x.player_name)+'</b> <span class="pill '+esc(x.status)+'">'+esc(labels[x.status]||x.status)+'</span><div class="sub">Discord：'+esc(x.discord_id||'未登録')+'</div><div class="sub">'+esc(x.affiliation||'所属未入力')+'</div></div></div>'+(x.note?'<div class="sub" style="margin-top:6px">備考：'+esc(x.note)+'</div>':'')+'<div class="statusButtons">'+(x.status==='pending'?'<button class="btn primary small" onclick="setStatus('+x.id+',\\'reserved\\')">承認</button>':'')+'<button class="btn small" onclick="setStatus('+x.id+',\\'completed\\')">受講済み</button><button class="btn small" onclick="setStatus('+x.id+',\\'absent\\')">欠席</button><button class="btn danger small" onclick="setStatus('+x.id+',\\'cancelled\\')">取消</button></div></div>').join('')
}
async function setStatus(id,status){const r=await fetch('/api/admin/reservations/'+id,{method:'PATCH',headers:auth(),body:JSON.stringify({status})});if(r.ok){await loadReservations();loadAdmin()}}
verify();`;

async function handle(request, env) {
 const url=new URL(request.url), path=url.pathname, method=request.method;
 const adminPass=env.ADMIN_PASSWORD || "game1234";
 const isAdmin=()=>request.headers.get("x-admin-password")===adminPass;

 if(path==="/" && method==="GET") return html("警察研修予約",PUBLIC_BODY,PUBLIC_SCRIPT);
 if(path==="/admin" && method==="GET") return html("研修管理",ADMIN_BODY,ADMIN_SCRIPT);

 if(path==="/api/trainings" && method==="GET"){
   const {results}=await env.DB.prepare(`
     SELECT t.*,
       COALESCE(SUM(CASE WHEN r.status IN ('pending','reserved') THEN 1 ELSE 0 END),0) active_count
     FROM trainings t LEFT JOIN reservations r ON r.training_id=t.id
     WHERE date(t.training_date) >= date('now')
     GROUP BY t.id ORDER BY t.training_date,t.start_time
   `).all();
   return json(results);
 }

 if(path==="/api/reservations" && method==="POST"){
   const b=await request.json().catch(()=>({}));
   if(!b.training_id||!b.player_name||!b.discord_id) return json({error:"必須項目が不足しています"},400);
   const t=await env.DB.prepare("SELECT capacity FROM trainings WHERE id=?").bind(b.training_id).first();
   if(!t)return json({error:"研修が見つかりません"},404);
   const c=await env.DB.prepare("SELECT COUNT(*) c FROM reservations WHERE training_id=? AND status IN ('pending','reserved')").bind(b.training_id).first();
   if(Number(c.c)>=Number(t.capacity))return json({error:"定員に達しています"},409);
   const dup=await env.DB.prepare("SELECT id FROM reservations WHERE training_id=? AND lower(player_name)=lower(?) AND status IN ('pending','reserved')").bind(b.training_id,b.player_name).first();
   if(dup)return json({error:"同じ名前ですでに申請されています"},409);
   await env.DB.prepare("INSERT INTO reservations(training_id,player_name,discord_id,affiliation,note,status) VALUES(?,?,?,?,?,'pending')")
     .bind(b.training_id,b.player_name,b.discord_id,b.affiliation||"",b.note||"").run();
   return json({ok:true},201);
 }

 if(path==="/api/admin/check") return isAdmin()?json({ok:true}):json({error:"unauthorized"},401);
 if(path.startsWith("/api/admin/") && !isAdmin()) return json({error:"unauthorized"},401);

 if(path==="/api/admin/stats" && method==="GET"){
   const trainings=await env.DB.prepare("SELECT COUNT(*) c FROM trainings WHERE date(training_date)>=date('now')").first();
   const pending=await env.DB.prepare("SELECT COUNT(*) c FROM reservations WHERE status='pending'").first();
   const reserved=await env.DB.prepare("SELECT COUNT(*) c FROM reservations WHERE status='reserved'").first();
   const completed=await env.DB.prepare("SELECT COUNT(*) c FROM reservations WHERE status='completed'").first();
   return json({trainings:trainings.c,pending:pending.c,reserved:reserved.c,completed:completed.c});
 }

 if(path==="/api/admin/trainings" && method==="GET"){
   const {results}=await env.DB.prepare(`
     SELECT t.*,
       COALESCE(SUM(CASE WHEN r.status IN ('pending','reserved') THEN 1 ELSE 0 END),0) active_count
     FROM trainings t LEFT JOIN reservations r ON r.training_id=t.id
     GROUP BY t.id ORDER BY t.training_date DESC,t.start_time DESC
   `).all(); return json(results);
 }

 if(path==="/api/admin/trainings" && method==="POST"){
   const b=await request.json(); await env.DB.prepare("INSERT INTO trainings(category,title,description,training_date,start_time,end_time,capacity,instructor,location) VALUES(?,?,?,?,?,?,?,?,?)")
   .bind(b.category||"基礎研修",b.title,b.description||"",b.training_date,b.start_time,b.end_time||"",b.capacity||10,b.instructor||"",b.location||"").run(); return json({ok:true},201);
 }

 let m=path.match(/^\/api\/admin\/trainings\/(\d+)$/);
 if(m && method==="PUT"){
   const b=await request.json(); await env.DB.prepare("UPDATE trainings SET category=?,title=?,description=?,training_date=?,start_time=?,end_time=?,capacity=?,instructor=?,location=? WHERE id=?")
   .bind(b.category||"基礎研修",b.title,b.description||"",b.training_date,b.start_time,b.end_time||"",b.capacity||10,b.instructor||"",b.location||"",Number(m[1])).run(); return json({ok:true});
 }
 if(m && method==="DELETE"){
   await env.DB.prepare("DELETE FROM reservations WHERE training_id=?").bind(Number(m[1])).run();
   await env.DB.prepare("DELETE FROM trainings WHERE id=?").bind(Number(m[1])).run(); return json({ok:true});
 }

 m=path.match(/^\/api\/admin\/trainings\/(\d+)\/reservations$/);
 if(m && method==="GET"){
   const {results}=await env.DB.prepare("SELECT * FROM reservations WHERE training_id=? ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'reserved' THEN 1 ELSE 2 END, created_at").bind(Number(m[1])).all(); return json(results);
 }

 m=path.match(/^\/api\/admin\/reservations\/(\d+)$/);
 if(m && method==="PATCH"){
   const b=await request.json(); if(!['pending','reserved','completed','absent','cancelled'].includes(b.status))return json({error:"invalid status"},400);
   await env.DB.prepare("UPDATE reservations SET status=? WHERE id=?").bind(b.status,Number(m[1])).run(); return json({ok:true});
 }

 return new Response("Not Found",{status:404});
}

export default { fetch: handle };
