const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function shell(title, body, script) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title><style>
:root{--bg:#f4f6f8;--card:#fff;--text:#111827;--muted:#6b7280;--line:#e5e7eb;--accent:#111827;--danger:#dc2626}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif}a{color:inherit;text-decoration:none}.wrap{max-width:860px;margin:auto;padding:18px 14px 90px}.top,.between,.row{display:flex;align-items:center;gap:10px}.top,.between{justify-content:space-between}.row{flex-wrap:wrap}.brand{font-size:22px;font-weight:800}.sub{color:var(--muted);font-size:13px}.btn{border:1px solid var(--line);border-radius:12px;padding:11px 14px;font-weight:700;background:#fff;color:var(--text);cursor:pointer}.btn.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.btn.danger{background:#fff1f2;color:var(--danger);border-color:#fecdd3}.btn.small{padding:8px 10px;font-size:12px;border-radius:10px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.stat,.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px}.stat b{font-size:24px;display:block;margin-top:5px}.card{margin:12px 0}.title{font-size:18px;font-weight:800}.meta{display:flex;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:13px;margin:8px 0}.pill{display:inline-flex;border-radius:999px;background:#f3f4f6;padding:5px 9px;font-size:12px;font-weight:700}.empty{text-align:center;color:var(--muted);padding:35px 10px}.section{font-size:16px;font-weight:800;margin:22px 2px 8px}input,textarea,select{width:100%;border:1px solid #d1d5db;border-radius:12px;padding:12px 13px;font:inherit;background:#fff}textarea{min-height:90px;resize:vertical}.field{margin:12px 0}.field label{display:block;font-size:12px;color:var(--muted);font-weight:700;margin-bottom:6px}.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.modal{position:fixed;inset:0;background:rgba(17,24,39,.45);display:none;align-items:flex-end;justify-content:center;z-index:20}.modal.open{display:flex}.sheet{background:#fff;width:100%;max-width:620px;max-height:92vh;overflow:auto;border-radius:22px 22px 0 0;padding:18px;padding-bottom:calc(18px + env(safe-area-inset-bottom))}.close{float:right}.notice{padding:11px 12px;border-radius:12px;background:#eff6ff;color:#1d4ed8;font-size:13px;margin:10px 0}.error{background:#fff1f2;color:#be123c}.success{background:#ecfdf5;color:#15803d}.login{max-width:420px;margin:80px auto 0}.res{border-top:1px solid var(--line);padding:12px 0}.res:first-child{border-top:0}.footerNav{position:fixed;left:0;right:0;bottom:0;background:rgba(255,255,255,.96);border-top:1px solid var(--line);padding:8px 14px calc(8px + env(safe-area-inset-bottom));display:flex;justify-content:center;gap:10px;z-index:10}.footerNav a{flex:1;max-width:240px;text-align:center;padding:11px;border-radius:12px;font-weight:800}.footerNav a.active{background:#111827;color:#fff}@media(max-width:640px){.grid{grid-template-columns:1fr 1fr}.grid .stat:last-child{grid-column:1/-1}.formgrid{grid-template-columns:1fr}.top{align-items:flex-start}}
</style></head><body>${body}<script>${script}</script></body></html>`;
}

const PUBLIC_BODY = `
<div class="wrap"><div class="top"><div><div class="brand">研修予約</div><div class="sub">参加したい研修を選んで予約してください</div></div><a class="btn small" href="/admin">管理</a></div>
<div id="msg"></div><div id="list"><div class="empty">読み込み中...</div></div></div>
<div id="booking" class="modal"><div class="sheet"><button class="btn small close" onclick="closeBooking()">閉じる</button><div class="title" id="bookTitle">研修予約</div><div class="field"><label>プレイヤー名 *</label><input id="playerName" maxlength="40"></div><div class="field"><label>所属・部署</label><input id="affiliation" maxlength="50" placeholder="例：警察 / 医療 / 軍"></div><div class="field"><label>メモ</label><textarea id="note" maxlength="200"></textarea></div><button class="btn primary" style="width:100%" onclick="submitBooking()">この研修を予約する</button></div></div>`;

const PUBLIC_SCRIPT = String.raw`
let selectedTraining=null;
function esc(s){return String(s||'').replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
function fmt(d){return new Date(d+'T00:00:00').toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'})}
async function load(){
  const r=await fetch('/api/trainings'); const data=await r.json(); const el=document.getElementById('list');
  if(!data.length){el.innerHTML='<div class="empty">現在、予約できる研修はありません。</div>';return}
  el.innerHTML=data.map(function(t){
    const remain=Math.max(0,Number(t.capacity)-Number(t.reserved_count));
    const loc=t.location?'<span>📍 '+esc(t.location)+'</span>':'';
    const desc=t.description?'<div class="sub" style="margin:8px 0 12px">'+esc(t.description)+'</div>':'';
    const disabled=remain<=0?'disabled style="opacity:.4"':'';
    const payload=encodeURIComponent(JSON.stringify(t));
    return '<div class="card"><div class="between"><div><div class="title">'+esc(t.title)+'</div><div class="meta"><span>📅 '+fmt(t.training_date)+'</span><span>🕒 '+esc(t.start_time)+(t.end_time?'〜'+esc(t.end_time):'')+'</span>'+loc+'</div></div><span class="pill">残り '+remain+'名</span></div>'+desc+'<div class="between"><span class="sub">担当：'+esc(t.instructor||'未設定')+'　予約 '+t.reserved_count+'/'+t.capacity+'</span><button class="btn primary" '+disabled+' onclick="openBooking(decodeURIComponent(\''+payload+'\'))">'+(remain<=0?'満員':'予約する')+'</button></div></div>';
  }).join('');
}
function openBooking(raw){selectedTraining=JSON.parse(raw);document.getElementById('bookTitle').textContent=selectedTraining.title+' を予約';document.getElementById('booking').classList.add('open')}
function closeBooking(){document.getElementById('booking').classList.remove('open')}
async function submitBooking(){
  const player_name=document.getElementById('playerName').value.trim(); if(!player_name)return show('プレイヤー名を入力してください','error');
  const body={training_id:selectedTraining.id,player_name:player_name,affiliation:document.getElementById('affiliation').value.trim(),note:document.getElementById('note').value.trim()};
  const r=await fetch('/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const d=await r.json();
  if(!r.ok)return show(d.error||'予約できませんでした','error'); closeBooking(); ['playerName','affiliation','note'].forEach(function(id){document.getElementById(id).value=''}); show('予約しました！','success'); load();
}
function show(t,c){const e=document.getElementById('msg');e.innerHTML='<div class="notice '+c+'">'+esc(t)+'</div>';setTimeout(function(){e.innerHTML=''},3500)}
load();`;

const ADMIN_BODY = `
<div id="loginView" class="wrap login"><div class="card"><div class="brand">研修管理</div><div class="sub" style="margin:4px 0 18px">共通パスワードを入力してください</div><div id="loginMsg"></div><input id="password" type="password" placeholder="パスワード" onkeydown="if(event.key==='Enter')login()"><button class="btn primary" style="width:100%;margin-top:10px" onclick="login()">管理画面を開く</button><a href="/" class="btn" style="width:100%;display:block;text-align:center;margin-top:8px">予約ページへ戻る</a></div></div>
<div id="adminView" style="display:none"><div class="wrap"><div class="top"><div><div class="brand">研修管理</div><div class="sub">予約・研修スケジュールをまとめて管理</div></div><div class="row"><button class="btn small" onclick="logout()">ログアウト</button><button class="btn primary small" onclick="openTraining()">＋ 研修追加</button></div></div><div id="msg"></div><div class="grid"><div class="stat"><span class="sub">今後の研修</span><b id="statTrainings">0</b></div><div class="stat"><span class="sub">予約中</span><b id="statReserved">0</b></div><div class="stat"><span class="sub">受講済み</span><b id="statCompleted">0</b></div></div><div class="section">研修一覧</div><div id="adminList"></div></div><div class="footerNav"><a href="/">予約ページ</a><a class="active" href="/admin">管理画面</a></div></div>
<div id="trainingModal" class="modal"><div class="sheet"><button class="btn small close" onclick="closeTraining()">閉じる</button><div class="title" id="trainingModalTitle">研修を追加</div><input type="hidden" id="trainingId"><div class="field"><label>研修名 *</label><input id="title" maxlength="60"></div><div class="field"><label>説明</label><textarea id="description" maxlength="300"></textarea></div><div class="formgrid"><div class="field"><label>日付 *</label><input id="trainingDate" type="date"></div><div class="field"><label>定員 *</label><input id="capacity" type="number" min="1" max="999" value="10"></div><div class="field"><label>開始時間 *</label><input id="startTime" type="time"></div><div class="field"><label>終了時間</label><input id="endTime" type="time"></div><div class="field"><label>担当者</label><input id="instructor" maxlength="50"></div><div class="field"><label>場所</label><input id="location" maxlength="60"></div></div><button class="btn primary" style="width:100%" onclick="saveTraining()">保存する</button></div></div>
<div id="resModal" class="modal"><div class="sheet"><button class="btn small close" onclick="closeReservations()">閉じる</button><div class="title" id="resTitle">予約者一覧</div><div id="resList"></div></div></div>`;

const ADMIN_SCRIPT = String.raw`
let adminPassword=localStorage.getItem('trainingAdminPassword')||''; let trainings=[]; let activeTrainingId=null; let activeTrainingTitle='';
const statusLabel={reserved:'予約済み',completed:'受講済み',absent:'欠席',cancelled:'キャンセル'};
function esc(s){return String(s||'').replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
function auth(){return {'content-type':'application/json','x-admin-password':adminPassword}}
async function login(){adminPassword=document.getElementById('password').value;const r=await fetch('/api/admin/check',{headers:{'x-admin-password':adminPassword}});if(!r.ok){document.getElementById('loginMsg').innerHTML='<div class="notice error">パスワードが違います</div>';return}localStorage.setItem('trainingAdminPassword',adminPassword);showAdmin();loadAdmin()}
function logout(){localStorage.removeItem('trainingAdminPassword');location.reload()}
async function verify(){if(!adminPassword)return;const r=await fetch('/api/admin/check',{headers:{'x-admin-password':adminPassword}});if(r.ok){showAdmin();loadAdmin()}}
function showAdmin(){document.getElementById('loginView').style.display='none';document.getElementById('adminView').style.display='block'}
function fmt(d){return new Date(d+'T00:00:00').toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'})}
async function loadAdmin(){const r=await fetch('/api/admin/trainings',{headers:auth()});if(r.status===401)return logout();trainings=await r.json();render();const s=await fetch('/api/admin/stats',{headers:auth()});const st=await s.json();document.getElementById('statTrainings').textContent=st.trainings;document.getElementById('statReserved').textContent=st.reserved;document.getElementById('statCompleted').textContent=st.completed}
function render(){const e=document.getElementById('adminList');if(!trainings.length){e.innerHTML='<div class="empty">研修がまだありません。右上の「＋研修追加」から作成できます。</div>';return}e.innerHTML=trainings.map(function(t){const payload=encodeURIComponent(JSON.stringify({id:t.id,title:t.title}));return '<div class="card"><div class="between"><div><div class="title">'+esc(t.title)+'</div><div class="meta"><span>📅 '+fmt(t.training_date)+'</span><span>🕒 '+esc(t.start_time)+(t.end_time?'〜'+esc(t.end_time):'')+'</span>'+(t.location?'<span>📍 '+esc(t.location)+'</span>':'')+'</div></div><span class="pill">'+t.reserved_count+'/'+t.capacity+'名</span></div><div class="row" style="margin-top:12px"><button class="btn small" onclick="openReservations(decodeURIComponent(\''+payload+'\'))">予約者を見る</button><button class="btn small" onclick="openTraining('+t.id+')">編集</button><button class="btn danger small" onclick="deleteTraining('+t.id+')">削除</button></div></div>'}).join('')}
function openTraining(id){document.getElementById('trainingModal').classList.add('open');const t=id?trainings.find(function(x){return x.id===id}):null;document.getElementById('trainingModalTitle').textContent=t?'研修を編集':'研修を追加';document.getElementById('trainingId').value=t?t.id:'';document.getElementById('title').value=t?t.title:'';document.getElementById('description').value=t?t.description:'';document.getElementById('trainingDate').value=t?t.training_date:new Date().toISOString().slice(0,10);document.getElementById('capacity').value=t?t.capacity:10;document.getElementById('startTime').value=t?t.start_time:'20:00';document.getElementById('endTime').value=t?t.end_time:'';document.getElementById('instructor').value=t?t.instructor:'';document.getElementById('location').value=t?t.location:''}
function closeTraining(){document.getElementById('trainingModal').classList.remove('open')}
async function saveTraining(){const id=document.getElementById('trainingId').value;const b={title:document.getElementById('title').value.trim(),description:document.getElementById('description').value.trim(),training_date:document.getElementById('trainingDate').value,capacity:Number(document.getElementById('capacity').value),start_time:document.getElementById('startTime').value,end_time:document.getElementById('endTime').value,instructor:document.getElementById('instructor').value.trim(),location:document.getElementById('location').value.trim()};if(!b.title||!b.training_date||!b.start_time)return msg('必須項目を入力してください','error');const r=await fetch(id?'/api/admin/trainings/'+id:'/api/admin/trainings',{method:id?'PUT':'POST',headers:auth(),body:JSON.stringify(b)});const d=await r.json();if(!r.ok)return msg(d.error||'保存できませんでした','error');closeTraining();msg('保存しました','success');loadAdmin()}
async function deleteTraining(id){if(!confirm('この研修と予約データを削除しますか？'))return;const r=await fetch('/api/admin/trainings/'+id,{method:'DELETE',headers:auth()});if(!r.ok)return msg('削除できませんでした','error');msg('削除しました','success');loadAdmin()}
async function openReservations(raw){const info=JSON.parse(raw);activeTrainingId=info.id;activeTrainingTitle=info.title;document.getElementById('resTitle').textContent=info.title+' の予約者';document.getElementById('resModal').classList.add('open');await refreshReservations()}
async function refreshReservations(){const r=await fetch('/api/admin/trainings/'+activeTrainingId+'/reservations',{headers:auth()});const data=await r.json();const e=document.getElementById('resList');if(!data.length){e.innerHTML='<div class="empty">予約者はいません。</div>';return}e.innerHTML=data.map(function(x){return '<div class="res"><div class="between"><div><b>'+esc(x.player_name)+'</b><div class="sub">'+esc(x.affiliation||'所属なし')+'</div></div><span class="pill">'+statusLabel[x.status]+'</span></div>'+(x.note?'<div class="sub" style="margin:7px 0">メモ：'+esc(x.note)+'</div>':'')+'<div class="row" style="margin-top:9px"><select style="width:auto" onchange="updateStatus('+x.id+',this.value)"><option value="reserved" '+(x.status==='reserved'?'selected':'')+'>予約済み</option><option value="completed" '+(x.status==='completed'?'selected':'')+'>受講済み</option><option value="absent" '+(x.status==='absent'?'selected':'')+'>欠席</option><option value="cancelled" '+(x.status==='cancelled'?'selected':'')+'>キャンセル</option></select><button class="btn danger small" onclick="deleteReservation('+x.id+')">削除</button></div></div>'}).join('')}
function closeReservations(){document.getElementById('resModal').classList.remove('open');loadAdmin()}
async function updateStatus(id,status){await fetch('/api/admin/reservations/'+id,{method:'PUT',headers:auth(),body:JSON.stringify({status:status})});await refreshReservations();loadAdmin()}
async function deleteReservation(id){if(!confirm('この予約を削除しますか？'))return;await fetch('/api/admin/reservations/'+id,{method:'DELETE',headers:auth()});await refreshReservations();loadAdmin()}
function msg(t,c){const e=document.getElementById('msg');e.innerHTML='<div class="notice '+c+'">'+esc(t)+'</div>';setTimeout(function(){e.innerHTML=''},3000)}
verify();`;

const PUBLIC_PAGE = shell('研修予約', PUBLIC_BODY, PUBLIC_SCRIPT);
const ADMIN_PAGE = shell('研修管理', ADMIN_BODY, ADMIN_SCRIPT);

function isAdmin(req, env){return req.headers.get('x-admin-password') === (env.ADMIN_PASSWORD || 'game1234')}
async function getBody(req){try{return await req.json()}catch{return null}}

export default {
  async fetch(request, env) {
    const url=new URL(request.url), p=url.pathname, method=request.method;
    if(p==='/'&&method==='GET')return new Response(PUBLIC_PAGE,{headers:{'content-type':'text/html; charset=utf-8'}});
    if(p==='/admin'&&method==='GET')return new Response(ADMIN_PAGE,{headers:{'content-type':'text/html; charset=utf-8'}});

    if(p==='/api/trainings'&&method==='GET'){
      const {results}=await env.DB.prepare("SELECT t.*, COUNT(CASE WHEN r.status='reserved' THEN 1 END) AS reserved_count FROM trainings t LEFT JOIN reservations r ON r.training_id=t.id WHERE t.training_date >= date('now') GROUP BY t.id ORDER BY t.training_date ASC,t.start_time ASC").all();
      return json(results);
    }
    if(p==='/api/reservations'&&method==='POST'){
      const b=await getBody(request); if(!b?.training_id||!String(b.player_name||'').trim())return json({error:'入力内容を確認してください'},400);
      const t=await env.DB.prepare("SELECT t.capacity, COUNT(CASE WHEN r.status='reserved' THEN 1 END) AS reserved_count FROM trainings t LEFT JOIN reservations r ON r.training_id=t.id WHERE t.id=? GROUP BY t.id").bind(b.training_id).first();
      if(!t)return json({error:'研修が見つかりません'},404); if(Number(t.reserved_count)>=Number(t.capacity))return json({error:'この研修は満員です'},409);
      await env.DB.prepare("INSERT INTO reservations(training_id,player_name,affiliation,note,status) VALUES(?,?,?,?, 'reserved')").bind(b.training_id,String(b.player_name).trim(),String(b.affiliation||'').trim(),String(b.note||'').trim()).run(); return json({ok:true},201);
    }
    if(p==='/api/admin/check'&&method==='GET')return isAdmin(request,env)?json({ok:true}):json({error:'unauthorized'},401);
    if(p.startsWith('/api/admin/')&&!isAdmin(request,env))return json({error:'unauthorized'},401);

    if(p==='/api/admin/stats'&&method==='GET'){
      const t=await env.DB.prepare("SELECT COUNT(*) n FROM trainings WHERE training_date >= date('now')").first();
      const r=await env.DB.prepare("SELECT COUNT(*) n FROM reservations WHERE status='reserved'").first();
      const c=await env.DB.prepare("SELECT COUNT(*) n FROM reservations WHERE status='completed'").first(); return json({trainings:t.n,reserved:r.n,completed:c.n});
    }
    if(p==='/api/admin/trainings'&&method==='GET'){
      const {results}=await env.DB.prepare("SELECT t.*, COUNT(CASE WHEN r.status!='cancelled' THEN 1 END) AS reserved_count FROM trainings t LEFT JOIN reservations r ON r.training_id=t.id GROUP BY t.id ORDER BY t.training_date DESC,t.start_time DESC").all(); return json(results);
    }
    if(p==='/api/admin/trainings'&&method==='POST'){
      const b=await getBody(request); if(!b?.title||!b?.training_date||!b?.start_time||!b?.capacity)return json({error:'必須項目が不足しています'},400);
      const r=await env.DB.prepare("INSERT INTO trainings(title,description,training_date,start_time,end_time,capacity,instructor,location) VALUES(?,?,?,?,?,?,?,?)").bind(String(b.title).trim(),String(b.description||'').trim(),b.training_date,b.start_time,b.end_time||'',Math.max(1,Number(b.capacity)||1),String(b.instructor||'').trim(),String(b.location||'').trim()).run(); return json({ok:true,id:r.meta.last_row_id},201);
    }
    let m=p.match(/^\/api\/admin\/trainings\/(\d+)$/);
    if(m&&method==='PUT'){
      const b=await getBody(request); if(!b?.title||!b?.training_date||!b?.start_time||!b?.capacity)return json({error:'必須項目が不足しています'},400);
      await env.DB.prepare("UPDATE trainings SET title=?,description=?,training_date=?,start_time=?,end_time=?,capacity=?,instructor=?,location=? WHERE id=?").bind(String(b.title).trim(),String(b.description||'').trim(),b.training_date,b.start_time,b.end_time||'',Math.max(1,Number(b.capacity)||1),String(b.instructor||'').trim(),String(b.location||'').trim(),m[1]).run(); return json({ok:true});
    }
    if(m&&method==='DELETE'){await env.DB.prepare('DELETE FROM reservations WHERE training_id=?').bind(m[1]).run();await env.DB.prepare('DELETE FROM trainings WHERE id=?').bind(m[1]).run();return json({ok:true})}
    m=p.match(/^\/api\/admin\/trainings\/(\d+)\/reservations$/);
    if(m&&method==='GET'){const {results}=await env.DB.prepare('SELECT * FROM reservations WHERE training_id=? ORDER BY created_at ASC').bind(m[1]).all();return json(results)}
    m=p.match(/^\/api\/admin\/reservations\/(\d+)$/);
    if(m&&method==='PUT'){const b=await getBody(request), allowed=['reserved','completed','absent','cancelled'];if(!allowed.includes(b?.status))return json({error:'invalid status'},400);await env.DB.prepare('UPDATE reservations SET status=? WHERE id=?').bind(b.status,m[1]).run();return json({ok:true})}
    if(m&&method==='DELETE'){await env.DB.prepare('DELETE FROM reservations WHERE id=?').bind(m[1]).run();return json({ok:true})}
    return json({error:'not found'},404);
  }
};
