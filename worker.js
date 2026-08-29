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


const LANDING_BODY = `
<div class="wrap" style="max-width:620px">
  <div class="header" style="margin-top:35px">
    <span class="badge">LOMITA POLICE</span>
    <div class="brand">研修予約システム</div>
    <div class="sub">利用する画面を選択してください</div>
  </div>

  <div class="card" style="padding:20px">
    <div class="title">研修生用</div>
    <div class="sub" style="margin:7px 0 16px">研修予定の確認・参加申請はこちら</div>
    <a href="/trainee" class="btn primary" style="display:block;text-align:center;width:100%">研修生画面を開く</a>
  </div>

  <div class="card" style="padding:20px">
    <div class="title">管理者用</div>
    <div class="sub" style="margin:7px 0 16px">研修作成・申請承認・受講状況の管理</div>
    <a href="/admin" class="btn dark" style="display:block;text-align:center;width:100%">管理画面を開く</a>
  </div>
</div>`;

const PUBLIC_BODY = `
<div class="wrap">
  <div class="header">
    <div class="between">
      <div><span class="badge">TRAINEE</span><div class="brand">研修生ページ</div><div class="sub">研修日程を確認して参加申請してください</div></div>
      <a class="btn small" href="/">トップへ</a>
    </div>
  </div>
  <div class="card" style="margin-top:0">
    <div class="title" style="font-size:16px">研修生メニュー</div>
    <div class="sub" style="margin-top:6px">受付中の研修から希望する研修を選び、「申請する」から申し込んでください。</div>
  </div>
  <div id="msg"></div><div class="section">受付中の研修</div><div id="list"><div class="empty">読み込み中...</div></div>
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
   return '<div class="card"><div class="between"><div><span class="pill">'+esc(cat)+'</span><div class="title" style="margin-top:8px">'+esc(t.title)+'</div><div class="meta"><span>📅 '+fmt(t.training_date)+'</span><span>🕒 '+esc(t.start_time)+(t.end_time?'〜'+esc(t.end_time):'')+'</span>'+(t.location?'<span>📍 '+esc(t.location)+'</span>':'')+'</div></div><span class="pill">残り '+remain+'名</span></div>'+(t.description?'<div class="sub" style="margin:8px 0 12px">'+esc(t.description)+'</div>':'')+'<div class="between"><span class="sub">担当：'+esc(t.instructor||'未設定')+'　申請/予約 '+t.active_count+'/'+t.capacity+'</span><button class="btn primary bookingBtn" '+disabled+' data-id="'+t.id+'" data-title="'+encodeURIComponent(t.title)+'">'+(remain?'申請する':'満員')+'</button></div></div>'
 }).join('');
 document.querySelectorAll('.bookingBtn').forEach(btn=>btn.addEventListener('click',()=>openBooking(Number(btn.dataset.id),decodeURIComponent(btn.dataset.title))));
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
 <span class="badge">LOMITA POLICE</span><div class="title" style="font-size:24px">研修管理</div><div class="sub" style="margin:5px 0 8px">共通パスワードを入力してください</div><div class="notice" style="margin-bottom:14px">管理者画面を開くたびにパスワード認証が必要です。</div>
 <div id="loginMsg"></div><input id="password" type="password" placeholder="管理パスワード" autocomplete="current-password" autofocus onkeydown="if(event.key==='Enter')login()">
 <button class="btn dark" style="width:100%;margin-top:10px" onclick="login()">管理画面を開く</button>
 <a href="/" class="btn" style="display:block;text-align:center;margin-top:8px">トップへ戻る</a>
</div></div>
<div id="adminView" style="display:none"><div class="wrap">
 <div class="header"><div class="between"><div><span class="badge">LOMITA POLICE</span><div class="brand">研修管理本部</div><div class="sub">研修・参加申請・受講状況を一括管理</div></div><div class="row"><button class="btn small" onclick="logout()">ログアウト</button><button class="btn small" onclick="openManageMenu()">⚙ 管理メニュー</button><button class="btn primary small" onclick="openTraining()">＋研修追加</button></div></div></div>
 <div id="msg"></div>
 <div class="grid"><div class="stat"><span class="sub">今後の研修</span><b id="sTrain">0</b></div><div class="stat"><span class="sub">承認待ち</span><b id="sPending">0</b></div><div class="stat"><span class="sub">予約確定</span><b id="sReserved">0</b></div><div class="stat"><span class="sub">受講済み</span><b id="sCompleted">0</b></div></div>

 <div class="section">研修一覧</div><div id="adminList"></div>
</div><div class="footerNav"><a href="/">トップ</a><a class="active" href="/admin">管理画面</a></div></div>

<div id="manageModal" class="modal"><div class="sheet">
 <button class="btn small" style="float:right" onclick="closeManageMenu()">閉じる</button>
 <span class="badge">ADMIN TOOLS</span><div class="title" style="font-size:24px">管理メニュー</div>
 <div class="sub" style="margin:5px 0 16px">システム更新・ビルド確認などの管理機能</div>
 <div class="section">GitHubアップロード</div>
 <div class="card">
   <div class="title" style="font-size:16px">ファイルをGitHubへ送信</div>
   <div class="sub" style="margin:6px 0 12px">選択したファイルをリポジトリの main ブランチへ直接コミットします。</div>
   <div id="gitMsg"></div>
   <div class="field"><label>アップロードするファイル *（複数選択可）</label><input id="gitFile" type="file" multiple><div class="sub" id="gitFileInfo" style="margin-top:6px">ファイル未選択</div></div>
   <div class="field"><label>GitHub上の保存先フォルダ</label><input id="gitPath" placeholder="例：updates/（空欄ならルート直下）"><div class="sub" style="margin-top:6px">選択した各ファイルは元のファイル名のまま保存します。</div></div>
   <div class="field"><label>コミットメッセージ</label><input id="gitCommit" value="admin upload: update files" maxlength="120"></div>
   <button class="btn primary" id="gitUploadBtn" style="width:100%" onclick="uploadToGitHub()">GitHubへまとめてアップロード</button>
 </div>

 <div class="section">Cloudflareビルド状況</div>
 <div class="card">
   <div class="between"><div><div class="title" style="font-size:16px">最新ビルド</div><div class="sub" id="buildCommit">GitHubの最新コミットを確認します</div></div><button class="btn small" id="buildRefreshBtn" onclick="loadBuildStatus(true)">更新</button></div>
   <div id="buildStatus" class="notice" style="margin-top:12px">未確認</div>
   <div class="sub" id="buildChecks" style="line-height:1.7"></div>
 </div>


</div></div>
<div id="trainingModal" class="modal"><div class="sheet">
 <button class="btn small" style="float:right" onclick="closeTraining()">閉じる</button><div class="title" id="trainingModalTitle">研修を追加</div>
 <div id="trainingMsg"></div>
 <input type="hidden" id="trainingId">
 <div class="field"><label>研修種別 *</label><select id="category"><option>基礎研修</option><option>射撃研修</option><option>運転研修</option><option>逮捕・制圧研修</option><option>無線・指令研修</option><option>幹部研修</option><option>特殊部隊研修</option><option>その他</option></select></div>
 <div class="field"><label>研修名 *</label><input id="title" maxlength="60"></div>
 <div class="field"><label>説明</label><textarea id="description" maxlength="300"></textarea></div>
 <div class="formgrid"><div class="field"><label>日付 *</label><input id="trainingDate" type="date"></div><div class="field"><label>定員 *</label><input id="capacity" type="number" min="1" max="999" value="10"></div><div class="field"><label>開始 *</label><input id="startTime" type="time"></div><div class="field"><label>終了</label><input id="endTime" type="time"></div><div class="field"><label>担当者</label><input id="instructor" maxlength="50"></div><div class="field"><label>場所</label><input id="location" maxlength="60"></div></div>
 <button id="trainingSaveBtn" type="button" class="btn primary" style="width:100%">保存する</button>
</div></div>
<div id="resModal" class="modal"><div class="sheet"><button class="btn small" style="float:right" onclick="closeReservations()">閉じる</button><div class="title" id="resTitle">参加者管理</div><div id="resList"></div></div></div>`;

const ADMIN_SCRIPT = String.raw`
let adminPassword='', trainings=[], activeTrainingId=null;
const labels={pending:'承認待ち',reserved:'予約確定',completed:'受講済み',absent:'欠席',cancelled:'キャンセル'};
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function auth(){return {'content-type':'application/json','x-admin-password':adminPassword}}
function msg(t,c){const e=document.getElementById('msg');e.innerHTML='<div class="notice '+c+'">'+esc(t)+'</div>';setTimeout(()=>e.innerHTML='',3500)}
async function login(){adminPassword=document.getElementById('password').value;const r=await fetch('/api/admin/check',{headers:{'x-admin-password':adminPassword}});if(!r.ok){document.getElementById('loginMsg').innerHTML='<div class="notice error">パスワードが違います</div>';return}showAdmin();loadAdmin()}
function logout(){adminPassword='';location.href='/'}
function showAdmin(){document.getElementById('loginView').style.display='none';document.getElementById('adminView').style.display='block'}
function openManageMenu(){document.getElementById('manageModal').classList.add('open');setTimeout(()=>loadBuildStatus(),150)}
function closeManageMenu(){document.getElementById('manageModal').classList.remove('open')}
function fmt(d){return new Date(d+'T00:00:00').toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'})}
async function loadAdmin(){
 const r=await fetch('/api/admin/trainings',{headers:auth()}); if(r.status===401)return logout(); trainings=await r.json(); render();
 const s=await fetch('/api/admin/stats',{headers:auth()}); const st=await s.json();
 document.getElementById('sTrain').textContent=st.trainings;document.getElementById('sPending').textContent=st.pending;document.getElementById('sReserved').textContent=st.reserved;document.getElementById('sCompleted').textContent=st.completed;
}
function render(){const e=document.getElementById('adminList');if(!trainings.length){e.innerHTML='<div class="empty">研修がありません。「＋研修追加」から作成してください。</div>';return}
 e.innerHTML=trainings.map(t=>'<div class="card"><div class="between"><div><span class="pill">'+esc(t.category||'一般研修')+'</span><div class="title" style="margin-top:7px">'+esc(t.title)+'</div><div class="meta"><span>📅 '+fmt(t.training_date)+'</span><span>🕒 '+esc(t.start_time)+(t.end_time?'〜'+esc(t.end_time):'')+'</span>'+(t.location?'<span>📍 '+esc(t.location)+'</span>':'')+'</div></div><span class="pill">'+t.active_count+'/'+t.capacity+'名</span></div><div class="row" style="margin-top:12px"><button class="btn small resBtn" data-id="'+t.id+'" data-title="'+encodeURIComponent(t.title)+'">参加者管理</button><button class="btn small editBtn" data-id="'+t.id+'">編集</button><button class="btn danger small delBtn" data-id="'+t.id+'">削除</button></div></div>').join('');
 document.querySelectorAll('.resBtn').forEach(btn=>btn.addEventListener('click',()=>openReservations(Number(btn.dataset.id),decodeURIComponent(btn.dataset.title))));
 document.querySelectorAll('.editBtn').forEach(btn=>btn.addEventListener('click',()=>openTraining(Number(btn.dataset.id))));
 document.querySelectorAll('.delBtn').forEach(btn=>btn.addEventListener('click',()=>deleteTraining(Number(btn.dataset.id))));
}
function openTraining(id){const t=id?trainings.find(x=>x.id===id):null;document.getElementById('trainingMsg').innerHTML='';document.getElementById('trainingModal').classList.add('open');document.getElementById('trainingModalTitle').textContent=t?'研修を編集':'研修を追加';document.getElementById('trainingId').value=t?t.id:'';document.getElementById('category').value=t?(t.category||'基礎研修'):'基礎研修';document.getElementById('title').value=t?t.title:'';document.getElementById('description').value=t?t.description:'';document.getElementById('trainingDate').value=t?t.training_date:new Date().toISOString().slice(0,10);document.getElementById('capacity').value=t?t.capacity:10;document.getElementById('startTime').value=t?t.start_time:'';document.getElementById('endTime').value=t?t.end_time:'';document.getElementById('instructor').value=t?t.instructor:'';document.getElementById('location').value=t?t.location:''}
function closeTraining(){document.getElementById('trainingModal').classList.remove('open')}
async function saveTraining(){
 const modalMsg=document.getElementById('trainingMsg');
 const body={
   category:document.getElementById('category').value,
   title:document.getElementById('title').value.trim(),
   description:document.getElementById('description').value.trim(),
   training_date:document.getElementById('trainingDate').value,
   capacity:Number(document.getElementById('capacity').value),
   start_time:document.getElementById('startTime').value,
   end_time:document.getElementById('endTime').value,
   instructor:document.getElementById('instructor').value.trim(),
   location:document.getElementById('location').value.trim()
 };
 const required=[['title','研修名'],['trainingDate','日付'],['startTime','開始時刻']];
 for(const [id,label] of required){
   const el=document.getElementById(id);
   if(!el.value){
     modalMsg.innerHTML='<div class="notice error">'+label+'を入力してください。</div>';
     el.focus();
     el.scrollIntoView({behavior:'smooth',block:'center'});
     return;
   }
 }
 if(!Number.isFinite(body.capacity)||body.capacity<1){
   modalMsg.innerHTML='<div class="notice error">定員は1名以上で入力してください。</div>';
   const el=document.getElementById('capacity');el.focus();el.scrollIntoView({behavior:'smooth',block:'center'});return;
 }
 if(body.end_time && body.end_time<=body.start_time){
   modalMsg.innerHTML='<div class="notice error">終了時刻は開始時刻より後にしてください。</div>';
   const el=document.getElementById('endTime');el.focus();el.scrollIntoView({behavior:'smooth',block:'center'});return;
 }
 const id=document.getElementById('trainingId').value;
 const saveBtn=document.getElementById('trainingSaveBtn');
 const oldText=saveBtn.textContent;
 saveBtn.disabled=true;saveBtn.textContent='保存中...';
 modalMsg.innerHTML='<div class="notice">保存しています...</div>';
 try{
   const r=await fetch(id?'/api/admin/trainings/'+id:'/api/admin/trainings',{
     method:id?'PUT':'POST',
     headers:auth(),
     body:JSON.stringify(body)
   });
   let d={}; try{d=await r.json()}catch(_){}
   if(!r.ok){
     modalMsg.innerHTML='<div class="notice error">'+esc(d.error||('保存できませんでした（HTTP '+r.status+'）'))+'</div>';
     return;
   }
   closeTraining();
   msg('研修を保存しました','success');
   await loadAdmin();
 }catch(e){
   modalMsg.innerHTML='<div class="notice error">通信エラーで保存できませんでした。もう一度お試しください。</div>';
 }finally{
   saveBtn.disabled=false;saveBtn.textContent=oldText;
 }
}
async function deleteTraining(id){if(!confirm('この研修と関連予約を削除しますか？'))return;const r=await fetch('/api/admin/trainings/'+id,{method:'DELETE',headers:auth()});if(r.ok){msg('削除しました','success');loadAdmin()}}
async function openReservations(id,title){activeTrainingId=id;document.getElementById('resTitle').textContent=title+' / 参加者管理';document.getElementById('resModal').classList.add('open');await loadReservations()}
function closeReservations(){document.getElementById('resModal').classList.remove('open')}
async function loadReservations(){const r=await fetch('/api/admin/trainings/'+activeTrainingId+'/reservations',{headers:auth()});const data=await r.json();const e=document.getElementById('resList');if(!data.length){e.innerHTML='<div class="empty">申請者はいません。</div>';return}
 e.innerHTML=data.map(x=>'<div class="res"><div class="between"><div><b>'+esc(x.player_name)+'</b> <span class="pill '+esc(x.status)+'">'+esc(labels[x.status]||x.status)+'</span><div class="sub">Discord：'+esc(x.discord_id||'未登録')+'</div><div class="sub">'+esc(x.affiliation||'所属未入力')+'</div></div></div>'+(x.note?'<div class="sub" style="margin-top:6px">備考：'+esc(x.note)+'</div>':'')+'<div class="statusButtons">'+(x.status==='pending'?'<button class="btn primary small statusBtn" data-id="'+x.id+'" data-status="reserved">承認</button>':'')+'<button class="btn small statusBtn" data-id="'+x.id+'" data-status="completed">受講済み</button><button class="btn small statusBtn" data-id="'+x.id+'" data-status="absent">欠席</button><button class="btn danger small statusBtn" data-id="'+x.id+'" data-status="cancelled">取消</button></div></div>').join('');
 document.querySelectorAll('.statusBtn').forEach(btn=>btn.addEventListener('click',()=>setStatus(Number(btn.dataset.id),btn.dataset.status)));
}
async function setStatus(id,status){const r=await fetch('/api/admin/reservations/'+id,{method:'PATCH',headers:auth(),body:JSON.stringify({status})});if(r.ok){await loadReservations();loadAdmin()}}

let buildTimer=null;
function updateFileInfo(){
  const files=[...document.getElementById('gitFile').files];
  const el=document.getElementById('gitFileInfo');
  if(!files.length){el.textContent='ファイル未選択';return}
  const total=files.reduce((n,f)=>n+f.size,0);
  el.textContent=files.length+'個選択 ・ 合計 '+(total/1024).toFixed(total>1024?0:1)+' KB';
}
document.getElementById('trainingSaveBtn')?.addEventListener('click',saveTraining);
async function uploadToGitHub(){
  const files=[...document.getElementById('gitFile').files];
  const out=document.getElementById('gitMsg');
  const btn=document.getElementById('gitUploadBtn');
  if(!files.length){out.innerHTML='<div class="notice error">ファイルを選択してください</div>';return}
  if(files.some(f=>f.size>5*1024*1024)){out.innerHTML='<div class="notice error">1ファイル5MB以下にしてください</div>';return}
  if(files.reduce((n,f)=>n+f.size,0)>12*1024*1024){out.innerHTML='<div class="notice error">合計12MB以下にしてください</div>';return}
  const form=new FormData();
  files.forEach(file=>form.append('files',file,file.name));
  form.append('path',document.getElementById('gitPath').value.trim());
  form.append('message',document.getElementById('gitCommit').value.trim()||('admin upload: '+files.length+' files'));
  btn.disabled=true; btn.textContent=files.length+'個をアップロード中...';
  out.innerHTML='<div class="notice">'+files.length+'個のファイルを1回のコミットでGitHubへ送信しています...</div>';
  try{
    const r=await fetch('/api/admin/github/upload',{method:'POST',headers:{'x-admin-password':adminPassword},body:form});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||'アップロードに失敗しました');
    out.innerHTML='<div class="notice success">'+d.count+'個のファイルをGitHubへアップロードしました。ビルド状況を自動確認します。</div>';
    document.getElementById('gitFile').value=''; updateFileInfo();
    startBuildWatch();
  }catch(e){
    out.innerHTML='<div class="notice error">'+esc(e.message)+'</div>';
  }finally{
    btn.disabled=false; btn.textContent='GitHubへまとめてアップロード';
  }
}
function buildLabel(s){return {waiting:'⏳ ビルド待機中',building:'🔄 ビルド中',success:'✅ ビルド成功',failure:'❌ ビルド失敗'}[s]||'ℹ️ 状況不明'}
async function loadBuildStatus(manual=false){
  const box=document.getElementById('buildStatus'), details=document.getElementById('buildChecks'), commit=document.getElementById('buildCommit'), btn=document.getElementById('buildRefreshBtn');
  if(!box)return; if(manual){btn.disabled=true;btn.textContent='確認中...'}
  try{
    const r=await fetch('/api/admin/github/build-status',{headers:{'x-admin-password':adminPassword}}); const d=await r.json();
    if(!r.ok)throw new Error(d.error||'取得できませんでした');
    const klass=d.state==='success'?'success':d.state==='failure'?'error':'';
    box.className='notice '+klass; box.textContent=buildLabel(d.state)+(d.summary?' — '+d.summary:'');
    commit.textContent=(d.sha?d.sha.slice(0,7)+' ・ ':'')+(d.message||'')+(d.updated_at?' ・ '+new Date(d.updated_at).toLocaleString('ja-JP'):'');
    details.innerHTML=(d.checks||[]).map(x=>'• '+esc(x.name)+'：'+esc(x.label)).join('<br>') || 'Cloudflareのチェック結果を待っています。';
    if((d.state==='success'||d.state==='failure') && buildTimer){clearInterval(buildTimer);buildTimer=null}
  }catch(e){box.className='notice error';box.textContent='ビルド状況を取得できません：'+e.message}
  finally{if(manual){btn.disabled=false;btn.textContent='更新'}}
}
function startBuildWatch(){
  if(buildTimer)clearInterval(buildTimer); loadBuildStatus();
  buildTimer=setInterval(loadBuildStatus,5000); setTimeout(()=>{if(buildTimer){clearInterval(buildTimer);buildTimer=null}},120000);
}
document.getElementById('gitFile')?.addEventListener('change',updateFileInfo);
`;

async function handle(request, env) {
 const url=new URL(request.url), path=url.pathname, method=request.method;
 const adminPass=env.ADMIN_PASSWORD || "game1234";
 const isAdmin=()=>request.headers.get("x-admin-password")===adminPass;

 if(path==="/" && method==="GET") return html("研修予約システム",LANDING_BODY,"");
 if(path==="/trainee" && method==="GET") return html("研修生ページ",PUBLIC_BODY,PUBLIC_SCRIPT);
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
   try{
     const b=await request.json();
     if(!b.title || !b.training_date || !b.start_time) return json({error:"研修名・日付・開始時刻は必須です"},400);
     try{
       await env.DB.prepare("INSERT INTO trainings(category,title,description,training_date,start_time,end_time,capacity,instructor,location) VALUES(?,?,?,?,?,?,?,?,?)")
       .bind(b.category||"基礎研修",b.title,b.description||"",b.training_date,b.start_time,b.end_time||"",b.capacity||10,b.instructor||"",b.location||"").run();
     }catch(e){
       const em=String(e?.message||e||"");
       if(/no column named category|has no column named category/i.test(em)){
         await env.DB.prepare("INSERT INTO trainings(title,description,training_date,start_time,end_time,capacity,instructor,location) VALUES(?,?,?,?,?,?,?,?)")
         .bind(b.title,b.description||"",b.training_date,b.start_time,b.end_time||"",b.capacity||10,b.instructor||"",b.location||"").run();
       }else throw e;
     }
     return json({ok:true},201);
   }catch(e){
     return json({error:"D1保存エラー: "+String(e?.message||e)},500);
   }
 }

 let m=path.match(/^\/api\/admin\/trainings\/(\d+)$/);
 if(m && method==="PUT"){
   try{
     const b=await request.json();
     if(!b.title || !b.training_date || !b.start_time) return json({error:"研修名・日付・開始時刻は必須です"},400);
     try{
       await env.DB.prepare("UPDATE trainings SET category=?,title=?,description=?,training_date=?,start_time=?,end_time=?,capacity=?,instructor=?,location=? WHERE id=?")
       .bind(b.category||"基礎研修",b.title,b.description||"",b.training_date,b.start_time,b.end_time||"",b.capacity||10,b.instructor||"",b.location||"",Number(m[1])).run();
     }catch(e){
       const em=String(e?.message||e||"");
       if(/no such column: category|no column named category|has no column named category/i.test(em)){
         await env.DB.prepare("UPDATE trainings SET title=?,description=?,training_date=?,start_time=?,end_time=?,capacity=?,instructor=?,location=? WHERE id=?")
         .bind(b.title,b.description||"",b.training_date,b.start_time,b.end_time||"",b.capacity||10,b.instructor||"",b.location||"",Number(m[1])).run();
       }else throw e;
     }
     return json({ok:true});
   }catch(e){
     return json({error:"D1保存エラー: "+String(e?.message||e)},500);
   }
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

 if(path==="/api/admin/github/upload" && method==="POST"){
   if(!env.GITHUB_TOKEN) return json({error:"Cloudflareに GITHUB_TOKEN が設定されていません"},500);
   const form=await request.formData();
   const files=form.getAll("files").filter(f=>f && typeof f.arrayBuffer==="function");
   let folder=String(form.get("path")||"").trim().replace(/^\/+|\/+$/g,"");
   const message=String(form.get("message")||"admin upload").trim();
   if(!files.length) return json({error:"ファイルがありません"},400);
   if(files.length>20) return json({error:"一度に選択できるのは20ファイルまでです"},400);
   if(files.some(f=>f.size>5*1024*1024)) return json({error:"1ファイル5MB以下にしてください"},413);
   if(files.reduce((n,f)=>n+f.size,0)>12*1024*1024) return json({error:"合計12MB以下にしてください"},413);
   if(folder.includes("..")) return json({error:"保存先フォルダが不正です"},400);
   const repo=env.GITHUB_REPO || "yuuji0628/lomita-police-training-reservation";
   const branch=env.GITHUB_BRANCH || "main";
   const base="https://api.github.com/repos/"+repo;
   const headers={"authorization":"Bearer "+env.GITHUB_TOKEN,"accept":"application/vnd.github+json","x-github-api-version":"2022-11-28","user-agent":"lomita-training-admin","content-type":"application/json"};
   const refRes=await fetch(base+"/git/ref/heads/"+encodeURIComponent(branch),{headers});
   const ref=await refRes.json().catch(()=>({}));
   if(!refRes.ok) return json({error:ref.message||"GitHubブランチ情報を取得できません"},refRes.status);
   const parentSha=ref.object.sha;
   const commitRes=await fetch(base+"/git/commits/"+parentSha,{headers});
   const parent=await commitRes.json().catch(()=>({}));
   if(!commitRes.ok) return json({error:parent.message||"GitHubコミット情報を取得できません"},commitRes.status);
   const tree=[];
   for(const file of files){
     const cleanName=String(file.name||"file").replace(/^\/+/,'');
     if(cleanName.includes("..")) return json({error:"ファイル名が不正です: "+cleanName},400);
     const bytes=new Uint8Array(await file.arrayBuffer()); let binary=""; const chunk=0x8000;
     for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
     const blobRes=await fetch(base+"/git/blobs",{method:"POST",headers,body:JSON.stringify({content:btoa(binary),encoding:"base64"})});
     const blob=await blobRes.json().catch(()=>({}));
     if(!blobRes.ok) return json({error:blob.message||("GitHubへ "+cleanName+" を送信できません")},blobRes.status);
     tree.push({path:(folder?folder+"/":"")+cleanName,mode:"100644",type:"blob",sha:blob.sha});
   }
   const treeRes=await fetch(base+"/git/trees",{method:"POST",headers,body:JSON.stringify({base_tree:parent.tree.sha,tree})});
   const newTree=await treeRes.json().catch(()=>({}));
   if(!treeRes.ok) return json({error:newTree.message||"GitHubツリーを作成できません"},treeRes.status);
   const newCommitRes=await fetch(base+"/git/commits",{method:"POST",headers,body:JSON.stringify({message,tree:newTree.sha,parents:[parentSha]})});
   const newCommit=await newCommitRes.json().catch(()=>({}));
   if(!newCommitRes.ok) return json({error:newCommit.message||"GitHubコミットを作成できません"},newCommitRes.status);
   const updateRes=await fetch(base+"/git/refs/heads/"+encodeURIComponent(branch),{method:"PATCH",headers,body:JSON.stringify({sha:newCommit.sha,force:false})});
   const updated=await updateRes.json().catch(()=>({}));
   if(!updateRes.ok) return json({error:updated.message||"GitHubブランチを更新できません"},updateRes.status);
   return json({ok:true,count:files.length,commit:newCommit.sha,paths:tree.map(x=>x.path)});
 }

 if(path==="/api/admin/github/build-status" && method==="GET"){
   const repo=env.GITHUB_REPO || "yuuji0628/lomita-police-training-reservation";
   const branch=env.GITHUB_BRANCH || "main";
   const base="https://api.github.com/repos/"+repo;
   const publicHeaders={"accept":"application/vnd.github+json","x-github-api-version":"2022-11-28","user-agent":"lomita-training-admin"};
   const latestRes=await fetch(base+"/commits/"+encodeURIComponent(branch),{headers:publicHeaders});
   const latest=await latestRes.json().catch(()=>({}));
   if(!latestRes.ok)return json({error:latest.message||"最新コミットを取得できません"},latestRes.status);
   const sha=latest.sha;
   const [checksRes,statusRes]=await Promise.all([
     fetch(base+"/commits/"+sha+"/check-runs?per_page=30",{headers:publicHeaders}),
     fetch(base+"/commits/"+sha+"/status",{headers:publicHeaders})
   ]);
   const checksData=checksRes.ok?await checksRes.json():{check_runs:[]};
   const statusData=statusRes.ok?await statusRes.json():{state:"pending",statuses:[]};
   const checks=(checksData.check_runs||[]).map(c=>({name:c.name||"Check",status:c.status,conclusion:c.conclusion,label:c.status!=="completed"?"処理中":({success:"成功",neutral:"成功",skipped:"スキップ",failure:"失敗",cancelled:"キャンセル",timed_out:"タイムアウト",action_required:"要確認"}[c.conclusion]||"完了")}));
   const statuses=(statusData.statuses||[]).map(s=>({name:s.context||"Status",status:s.state,conclusion:s.state,label:({success:"成功",pending:"処理中",failure:"失敗",error:"エラー"}[s.state]||s.state)}));
   const all=[...checks,...statuses];
   const bad=all.some(x=>["failure","cancelled","timed_out","action_required","error"].includes(x.conclusion));
   const running=all.some(x=>x.status!=="completed" && !["success","failure","error"].includes(x.status));
   const good=all.length>0 && all.every(x=>["success","neutral","skipped"].includes(x.conclusion)||x.status==="success");
   const state=bad?"failure":running?"building":good?"success":"waiting";
   const summary=state==="waiting"?"Cloudflareのチェック開始待ち":state==="building"?"自動デプロイを実行中":state==="success"?"最新コミットのチェック完了":"最新コミットのチェックでエラー";
   return json({state,summary,sha,message:(latest.commit?.message||"").split("\n")[0],updated_at:latest.commit?.committer?.date||null,checks:all});
 }

 return new Response("Not Found",{status:404});
}

export default { fetch: handle };
