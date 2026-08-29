const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});


const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

async function adminSessionSignature(secret, expires) {
  const data = new TextEncoder().encode("lomita-admin:" + expires + ":" + secret);
  return b64url(await crypto.subtle.digest("SHA-256", data));
}

async function verifyAdminSession(request, secret) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)lomita_admin=([^;]+)/);
  if (!match) return false;
  const [expiresRaw, sig] = decodeURIComponent(match[1]).split(".");
  const expires = Number(expiresRaw);
  if (!expires || expires < Date.now() || !sig) return false;
  const expected = await adminSessionSignature(secret, expiresRaw);
  return sig === expected;
}

async function ensureTraineeProfiles(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS trainee_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT NOT NULL,
      discord_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
      affiliation TEXT DEFAULT '',
      rank TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function ensureReservationInstructor(env) {
  const info = await env.DB.prepare("PRAGMA table_info(reservations)").all();
  const cols = (info.results || []).map(x => String(x.name || "").toLowerCase());
  if (!cols.includes("assigned_instructor")) {
    await env.DB.prepare("ALTER TABLE reservations ADD COLUMN assigned_instructor TEXT DEFAULT ''").run();
  }
}

async function ensureInstructors(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS instructors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function ensureTrainingPrograms(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS training_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS training_program_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      training_id INTEGER NOT NULL UNIQUE,
      step_order INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Old DBs do not have training_id. Add it safely.
  const pinfo = await env.DB.prepare("PRAGMA table_info(training_programs)").all();
  let pcols = (pinfo.results || []).map(x => String(x.name || "").toLowerCase());
  if (!pcols.includes("training_id")) {
    try {
      await env.DB.prepare("ALTER TABLE training_programs ADD COLUMN training_id INTEGER").run();
    } catch (e) {
      // Another request may have added it at the same time.
      const check = await env.DB.prepare("PRAGMA table_info(training_programs)").all();
      pcols = (check.results || []).map(x => String(x.name || "").toLowerCase());
      if (!pcols.includes("training_id")) throw e;
    }
  }

  // Existing programs become application-ready trainings automatically.
  const {results:orphans} = await env.DB.prepare(
    "SELECT id,name,description FROM training_programs WHERE training_id IS NULL"
  ).all();

  for (const p of (orphans || [])) {
    const tr = await env.DB.prepare(`
      INSERT INTO trainings(title,description,training_date,start_time,capacity,instructor,location)
      VALUES(?,?,?,?,?,?,?)
    `).bind(
      p.name,
      p.description || "",
      "2099-12-31",
      "00:00",
      999,
      "",
      ""
    ).run();

    const tid = Number(tr.meta?.last_row_id || 0);
    if (tid) {
      await env.DB.prepare("UPDATE training_programs SET training_id=? WHERE id=?")
        .bind(tid,p.id).run();
    }
  }
}

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
.res{border-top:1px solid var(--line);padding:13px 0}.res:first-child{border-top:0}.statusButtons{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.menuTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.menuTabs .btn{width:100%;padding:12px 8px}.profileHead{display:flex;gap:12px;align-items:center}.avatar{width:48px;height:48px;border-radius:50%;background:#e8f2ff;display:flex;align-items:center;justify-content:center;font-weight:900;color:var(--blue)}
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
      <div><span class="badge">TRAINEE</span><div class="brand">研修生ページ</div><div class="sub">登録・参加申請・受講履歴をまとめて確認</div></div>
      <a class="btn small" href="/">トップへ</a>
    </div>
  </div>

  <div class="card" style="margin-top:0">
    <div class="title">研修生メニュー</div>
    <div class="sub" style="margin:6px 0 14px">初めて利用する方は研修生登録をしてください。</div>
    <div class="formgrid">
      <button id="openRegisterBtn" type="button" class="btn primary" style="width:100%">＋ 初めての方・研修生登録</button>
      <button id="focusMyPageBtn" type="button" class="btn dark" style="width:100%">登録済み・マイページ</button>
    </div>
  </div>

  <div id="myPageLogin" class="card">
    <div class="title" style="font-size:16px">マイページを開く</div>
    <div class="sub" style="margin:6px 0 12px">登録したDiscord ID / ユーザー名を入力してください。</div>
    <div class="field"><label>Discord ID / ユーザー名</label><input id="myDiscordId" maxlength="60" placeholder="Discord ID / ユーザー名"></div>
    <button id="myPageBtn" type="button" class="btn dark" style="width:100%">自分の研修情報を見る</button>
    <div id="myMsg"></div>
  </div>

  <div id="myPage" style="display:none">
    <div class="section">自分の研修状況</div>
    <div id="mySummary"></div>
    <div class="section">申請・受講履歴</div>
    <div id="myHistory"></div>
  </div>

  <div id="msg"></div>
  <div class="section">受付中の研修</div>
  <div id="list"><div class="empty">読み込み中...</div></div>
</div>

<div id="registerModal" class="modal"><div class="sheet">
  <button class="btn small" style="float:right" onclick="closeRegister()">閉じる</button>
  <span class="badge">NEW TRAINEE</span>
  <div class="title">研修生登録</div>
  <div class="sub" style="margin:5px 0 12px">一度登録するとDiscord IDでマイページを開けます。</div>
  <div id="registerMsg"></div>
  <div class="field"><label>プレイヤー名 *</label><input id="regPlayerName" maxlength="40" placeholder="プレイヤー名"></div>
  <div class="field"><label>Discord ID / ユーザー名 *</label><input id="regDiscordId" maxlength="60" placeholder="Discord ID / ユーザー名"></div>
  <div class="formgrid">
    <div class="field"><label>所属</label><input id="regAffiliation" maxlength="60" placeholder="例：Lomita Police"></div>
    <div class="field"><label>階級</label><input id="regRank" maxlength="60" placeholder="例：Officer"></div>
  </div>
  <button id="registerSubmitBtn" type="button" class="btn primary" style="width:100%">研修生として登録する</button>
</div></div>

<div id="booking" class="modal"><div class="sheet">
  <button class="btn small" style="float:right" onclick="closeBooking()">閉じる</button>
  <div class="title" id="bookTitle">研修予約</div>
  <div class="sub" style="margin-top:4px">申請後、管理者の承認で予約確定になります。</div>
  <div id="bookingMsg"></div>
  <div class="field"><label>プレイヤー名 *</label><input id="playerName" maxlength="40"></div>
  <div class="field"><label>Discord ID / ユーザー名 *</label><input id="discordId" maxlength="60"></div>
  <div class="field"><label>所属・階級</label><input id="affiliation" maxlength="120"></div>
  <div class="field"><label>備考</label><textarea id="note" maxlength="250"></textarea></div>
  <button id="bookingSubmitBtn" type="button" class="btn primary" style="width:100%">参加申請する</button>
</div></div>`;

const PUBLIC_SCRIPT = String.raw`
let selectedTraining=null, myProfile=null;
const statusLabels={pending:'承認待ち',reserved:'予約確定',completed:'受講済み',absent:'欠席',cancelled:'キャンセル'};
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmt(d){return new Date(d+'T00:00:00').toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'})}
function noticeIn(id,t,c){document.getElementById(id).innerHTML='<div class="notice '+(c||'')+'">'+esc(t)+'</div>'}
function profileAffiliation(p){return [p.affiliation,p.rank].filter(Boolean).join(' / ')}
async function load(discordId){
 const r=await fetch('/api/trainings');
 const data=await r.json().catch(()=>[]);
 const el=document.getElementById('list');
 if(!r.ok){el.innerHTML='<div class="notice error">'+esc((data.error||'研修を取得できませんでした')+(data.detail?'：'+data.detail:''))+'</div>';return}
 if(!data.length){el.innerHTML='<div class="empty">現在、受付中の研修はありません。</div>';return}
 el.innerHTML=data.map(t=>'<div class="card"><div class="title">'+esc(t.title)+'</div>'+(t.description?'<div class="sub" style="margin:10px 0 12px;white-space:pre-wrap">'+esc(t.description)+'</div>':'')+'<div class="between"><span class="sub">申請後、管理者が担当教官を選んで承認します。</span><button class="btn primary bookingBtn" data-id="'+t.id+'" data-title="'+encodeURIComponent(t.title)+'">申請する</button></div></div>').join('');
 document.querySelectorAll('.bookingBtn').forEach(btn=>btn.addEventListener('click',()=>openBooking(Number(btn.dataset.id),decodeURIComponent(btn.dataset.title))));
}
function openRegister(){document.getElementById('registerMsg').innerHTML='';document.getElementById('registerModal').classList.add('open')}
function closeRegister(){document.getElementById('registerModal').classList.remove('open')}
async function registerTrainee(){
 const btn=document.getElementById('registerSubmitBtn');
 const body={
   player_name:document.getElementById('regPlayerName').value.trim(),
   discord_id:document.getElementById('regDiscordId').value.trim(),
   affiliation:document.getElementById('regAffiliation').value.trim(),
   rank:document.getElementById('regRank').value.trim()
 };
 if(!body.player_name){noticeIn('registerMsg','プレイヤー名を入力してください','error');return}
 if(!body.discord_id){noticeIn('registerMsg','Discord ID / ユーザー名を入力してください','error');return}
 btn.disabled=true;btn.textContent='登録中...';
 try{
   const r=await fetch('/api/trainee/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   const d=await r.json().catch(()=>({}));
   if(!r.ok){noticeIn('registerMsg',d.error||'登録できませんでした','error');return}
   myProfile=d.profile;
   document.getElementById('myDiscordId').value=body.discord_id;
   closeRegister();
   show('研修生登録が完了しました。','success');
   await loadMyPage();
 }catch(e){noticeIn('registerMsg','通信エラーで登録できませんでした','error')}
 finally{btn.disabled=false;btn.textContent='研修生として登録する'}
}
function openBooking(id,title){
 selectedTraining={id,title};document.getElementById('bookingMsg').innerHTML='';
 document.getElementById('bookTitle').textContent=title+' 参加申請';
 if(myProfile){
   document.getElementById('playerName').value=myProfile.player_name||'';
   document.getElementById('discordId').value=myProfile.discord_id||'';
   document.getElementById('affiliation').value=profileAffiliation(myProfile);
 }
 document.getElementById('booking').classList.add('open')
}
function closeBooking(){document.getElementById('booking').classList.remove('open')}
function show(t,c){const e=document.getElementById('msg');e.innerHTML='<div class="notice '+c+'">'+esc(t)+'</div>';setTimeout(()=>e.innerHTML='',4200)}
async function loadMyPage(){
 const discord_id=document.getElementById('myDiscordId').value.trim();
 if(!discord_id){noticeIn('myMsg','Discord ID / ユーザー名を入力してください','error');return}
 const btn=document.getElementById('myPageBtn');btn.disabled=true;btn.textContent='確認中...';
 try{
   const r=await fetch('/api/trainee/profile?discord_id='+encodeURIComponent(discord_id));
   const raw=await r.text();
   let d={};
   try{d=raw?JSON.parse(raw):{}}catch(_){d={error:raw||'サーバーから不正な応答が返りました'}}
   if(!r.ok){noticeIn('myMsg',(d.error||'研修情報を取得できませんでした')+(d.detail?'：'+d.detail:''),'error');return}
   myProfile=d.profile;
   document.getElementById('myMsg').innerHTML='';
   document.getElementById('myPage').style.display='block';
   document.getElementById('mySummary').innerHTML='<div class="card"><div class="profileHead"><div class="avatar">'+esc((d.profile.player_name||'?').slice(0,1))+'</div><div><div class="title">'+esc(d.profile.player_name)+'</div><div class="sub">Discord：'+esc(d.profile.discord_id)+'</div><div class="sub">'+esc(profileAffiliation(d.profile)||'所属・階級 未登録')+'</div></div></div><div class="grid" style="margin-top:14px"><div class="stat"><span class="sub">承認待ち</span><b>'+d.stats.pending+'</b></div><div class="stat"><span class="sub">予約確定</span><b>'+d.stats.reserved+'</b></div><div class="stat"><span class="sub">受講済み</span><b>'+d.stats.completed+'</b></div><div class="stat"><span class="sub">欠席</span><b>'+d.stats.absent+'</b></div></div></div>';
   const h=document.getElementById('myHistory');
   h.innerHTML=d.history.length?d.history.map(x=>'<div class="card"><div class="between"><div><span class="pill '+esc(x.status)+'">'+esc(statusLabels[x.status]||x.status)+'</span><div class="title" style="margin-top:7px">'+esc(x.title)+'</div><div class="meta"><span>📅 '+fmt(x.training_date)+'</span><span>🕒 '+esc(x.start_time||'')+(x.end_time?'〜'+esc(x.end_time):'')+'</span></div></div></div>'+(x.note?'<div class="sub">備考：'+esc(x.note)+'</div>':'')+'</div>').join(''):'<div class="empty">まだ申請・受講履歴はありません。</div>';
   await load(discord_id);
   document.getElementById('myPage').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){noticeIn('myMsg','通信エラーで取得できませんでした','error')}
 finally{btn.disabled=false;btn.textContent='自分の研修情報を見る'}
}
async function submitBooking(){
 const out=document.getElementById('bookingMsg'),btn=document.getElementById('bookingSubmitBtn');
 const player_name=document.getElementById('playerName').value.trim(), discord_id=document.getElementById('discordId').value.trim();
 if(!player_name){noticeIn('bookingMsg','プレイヤー名を入力してください','error');return}
 if(!discord_id){noticeIn('bookingMsg','Discord IDを入力してください','error');return}
 const body={training_id:selectedTraining.id,player_name,discord_id,affiliation:document.getElementById('affiliation').value.trim(),note:document.getElementById('note').value.trim()};
 btn.disabled=true;btn.textContent='申請中...';out.innerHTML='<div class="notice">申請を送信しています...</div>';
 try{
   const r=await fetch('/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   let d={};try{d=await r.json()}catch(_){}
   if(!r.ok){noticeIn('bookingMsg',d.error||'申請できませんでした','error');return}
   closeBooking();document.getElementById('note').value='';show('参加申請を送信しました。承認をお待ちください。','success');load(myProfile?.discord_id||discord_id);loadMyPage();
 }catch(e){noticeIn('bookingMsg','通信エラーで申請できませんでした','error')}
 finally{btn.disabled=false;btn.textContent='参加申請する'}
}
document.getElementById('openRegisterBtn')?.addEventListener('click',openRegister);
document.getElementById('focusMyPageBtn')?.addEventListener('click',()=>document.getElementById('myDiscordId').focus());
document.getElementById('registerSubmitBtn')?.addEventListener('click',registerTrainee);
document.getElementById('myPageBtn')?.addEventListener('click',loadMyPage);
document.getElementById('bookingSubmitBtn')?.addEventListener('click',submitBooking);
load();`;

const ADMIN_BODY = `
<div id="loginView" class="wrap login">
 <div class="header" style="margin-top:28px;text-align:left">
   <span class="badge">ADMIN</span>
   <div class="brand">研修管理本部</div>
   <div class="sub">管理者専用ページ</div>
 </div>
 <div class="card" style="padding:20px">
   <div class="title" style="font-size:22px">管理者ログイン</div>
   <div class="sub" style="margin:6px 0 14px">管理パスワードを入力してください。</div>
   <div class="notice">一度ログインすると、この端末では12時間ログイン状態を保持します。</div>
   <div id="loginMsg"></div>
   <div class="field"><label>管理パスワード</label><input id="password" type="password" placeholder="管理パスワード" autocomplete="current-password" autofocus></div>
   <button id="adminLoginBtn" type="button" class="btn dark" style="width:100%">管理画面を開く</button>
   <a href="/" class="btn" style="display:block;text-align:center;margin-top:8px">トップへ戻る</a>
 </div>
</div>
<div id="adminView" style="display:none"><div class="wrap">
 <div class="header"><div class="between"><div><span class="badge">LOMITA POLICE</span><div class="brand">研修管理本部</div><div class="sub">研修・参加申請・受講状況を一括管理</div></div><div class="row"><button class="btn small" onclick="logout()">ログアウト</button><button class="btn small" onclick="openManageMenu()">⚙ 管理メニュー</button><button class="btn primary small" onclick="openTraining()">＋研修追加</button></div></div></div>
 <div id="msg"></div>
 <div class="grid"><div class="stat"><span class="sub">今後の研修</span><b id="sTrain">0</b></div><div class="stat"><span class="sub">承認待ち</span><b id="sPending">0</b></div><div class="stat"><span class="sub">予約確定</span><b id="sReserved">0</b></div><div class="stat"><span class="sub">受講済み</span><b id="sCompleted">0</b></div></div>

 <div class="menuTabs" style="grid-template-columns:repeat(2,1fr)">
   <button id="tabTraining" class="btn dark" type="button" onclick="showAdminSection('training')">研修管理</button>
   <button id="tabPrograms" class="btn" type="button" onclick="showAdminSection('programs')">研修プログラム管理</button>
   <button id="tabInstructors" class="btn" type="button" onclick="showAdminSection('instructors')">教官管理</button>
   <button id="tabTrainees" class="btn" type="button" onclick="showAdminSection('trainees')">研修生管理</button>
   <button class="btn" type="button" onclick="openManageMenu()">管理メニュー</button>
 </div>

 <div id="trainingSection">
   <div class="section">研修一覧</div><div id="adminList"></div>
 </div>
 <div id="instructorSection" style="display:none">
   <div class="section">教官管理</div>
   <div class="card">
     <div class="title" style="font-size:16px">教官を登録</div>
     <div class="sub" style="margin:6px 0 12px">ここで登録した教官を研修の担当者として選べます。</div>
     <div class="field"><label>教官名 *</label><input id="instructorName" maxlength="80" placeholder="教官名を入力"></div>
     <button id="createInstructorBtn" class="btn primary" type="button" style="width:100%">教官を登録</button>
     <div id="instructorMsg"></div>
   </div>
   <div id="instructorList"><div class="empty">教官を読み込んでいます...</div></div>
 </div>

  <div id="programSection" style="display:none">
   <div class="section">研修プログラム管理</div>
   <div class="card">
     <div class="title" style="font-size:16px">研修プログラムを作成</div>
     <div class="sub" style="margin:6px 0 12px">このプログラム自体が、そのまま研修生の申請対象になります。</div>
     <div class="field"><label>研修名 *</label><input id="programName" maxlength="80" placeholder="例：学科1"></div>
     <div class="field"><label>フリー記入欄</label><textarea id="programDescription" maxlength="1000" placeholder="研修内容・注意事項など"></textarea></div>
     <button id="createProgramBtn" class="btn primary" type="button" style="width:100%">研修プログラムを作成</button>
     <div id="programMsg"></div>
   </div>
   <div id="programList"><div class="empty">研修プログラムを読み込んでいます...</div></div>
 </div>

 <div id="traineeSection" style="display:none">
   <div class="section">研修生一覧</div>
   <div class="card"><input id="traineeSearch" placeholder="名前・Discord ID・所属で検索"></div>
   <div id="traineeList"><div class="empty">研修生情報を読み込んでいます...</div></div>
 </div>
</div><div class="footerNav"><a href="/">トップ</a><a class="active" href="/admin">管理画面</a></div></div>

<div id="manageModal" class="modal"><div class="sheet">
 <button class="btn small" style="float:right" onclick="closeManageMenu()">閉じる</button>
 <span class="badge">ADMIN TOOLS</span><div class="title" style="font-size:24px">管理メニュー</div>
 <div class="sub" style="margin:5px 0 16px">システム更新・ビルド確認などの管理機能</div>
 <div class="section">GitHubアップロード</div>
 <div class="card">
   <div class="card" style="border:2px solid #0b4fa3">
   <div class="title" style="font-size:16px">worker.jsとして更新</div>
   <div class="sub" style="margin:6px 0 12px">修正版JSを選ぶと、元のファイル名に関係なく本番の worker.js を上書きします。</div>
   <div id="workerUploadMsg"></div>
   <div class="field"><label>修正版JSファイル *</label><input id="workerFile" type="file" accept=".js,text/javascript"></div>
   <button id="workerUploadBtn" type="button" class="btn primary" style="width:100%">worker.jsとして更新</button>
 </div>

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
 <button class="btn small" style="float:right" onclick="closeTraining()">閉じる</button>
 <div class="title" id="trainingModalTitle">研修を追加</div>
 <div class="sub" style="margin:5px 0 12px">研修内容はシンプルに登録できます。</div>
 <div id="trainingMsg"></div>
 <input type="hidden" id="trainingId">

 <div class="field"><label>研修名 *</label><input id="title" maxlength="80" placeholder="例：交通取締研修"></div>
 <div class="field"><label>フリー記入欄</label><textarea id="description" maxlength="1000" placeholder="研修内容、注意事項など自由に記入"></textarea></div>
 <div class="field"><label>担当者</label><select id="instructor"><option value="">担当者なし</option></select></div>

 <button id="trainingSaveBtn" type="button" class="btn primary" style="width:100%">保存する</button>
</div></div>

<div id="resModal" class="modal"><div class="sheet"><button class="btn small" style="float:right" onclick="closeReservations()">閉じる</button><div class="title" id="resTitle">参加者管理</div><div id="resList"></div></div></div>
<div id="traineeModal" class="modal"><div class="sheet">
 <button class="btn small" style="float:right" onclick="closeTraineeDetail()">閉じる</button>
 <span class="badge">TRAINEE</span><div class="title" id="traineeDetailTitle">研修生詳細</div>
 <div id="traineeDetail"><div class="empty">読み込み中...</div></div>
</div></div>`;

const ADMIN_SCRIPT = String.raw`
let adminPassword='', trainings=[], activeTrainingId=null;
const labels={pending:'承認待ち',reserved:'予約確定',completed:'受講済み',absent:'欠席',cancelled:'キャンセル'};
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function auth(){const h={'content-type':'application/json'};if(adminPassword)h['x-admin-password']=adminPassword;return h}
function msg(t,c){const e=document.getElementById('msg');e.innerHTML='<div class="notice '+c+'">'+esc(t)+'</div>';setTimeout(()=>e.innerHTML='',3500)}
async function login(){
 const btn=document.getElementById('adminLoginBtn');
 const password=document.getElementById('password').value;
 if(!password){document.getElementById('loginMsg').innerHTML='<div class="notice error">管理パスワードを入力してください</div>';return}
 btn.disabled=true;btn.textContent='確認中...';
 try{
   const r=await fetch('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
   if(!r.ok){document.getElementById('loginMsg').innerHTML='<div class="notice error">パスワードが違います</div>';return}
   adminPassword='';showAdmin();await loadAdmin();
 }finally{btn.disabled=false;btn.textContent='管理画面を開く'}
}
async function logout(){
 adminPassword='';
 await fetch('/api/admin/logout',{method:'POST'}).catch(()=>{});
 location.href='/';
}
function showAdmin(){document.getElementById('loginView').style.display='none';document.getElementById('adminView').style.display='block'}
async function restoreAdmin(){
 const r=await fetch('/api/admin/check');
 if(r.ok){showAdmin();await loadAdmin()}
}
function openManageMenu(){document.getElementById('manageModal').classList.add('open');setTimeout(()=>loadBuildStatus(),150)}
function closeManageMenu(){document.getElementById('manageModal').classList.remove('open')}
function showAdminSection(section){
 const training=section==='training';
 const programs=section==='programs';
 const instructors=section==='instructors';
 const trainees=section==='trainees';
 document.getElementById('trainingSection').style.display=training?'block':'none';
 document.getElementById('programSection').style.display=programs?'block':'none';
 document.getElementById('instructorSection').style.display=instructors?'block':'none';
 document.getElementById('traineeSection').style.display=trainees?'block':'none';
 document.getElementById('tabTraining').className='btn '+(training?'dark':'');
 document.getElementById('tabPrograms').className='btn '+(programs?'dark':'');
 document.getElementById('tabInstructors').className='btn '+(instructors?'dark':'');
 document.getElementById('tabTrainees').className='btn '+(trainees?'dark':'');
 if(programs)loadPrograms();
 if(instructors)loadInstructors();
 if(trainees)loadTrainees();
}
let instructorRows=[];
async function loadInstructors(){
 const r=await fetch('/api/admin/instructors',{headers:auth()});
 if(r.status===401)return logout();
 const d=await r.json().catch(()=>[]);
 if(!r.ok){document.getElementById('instructorList').innerHTML='<div class="notice error">'+esc(d.error||'教官を取得できませんでした')+'</div>';return}
 instructorRows=d;
 renderInstructors();
 refreshInstructorSelect();
}
function renderInstructors(){
 const e=document.getElementById('instructorList');
 if(!instructorRows.length){e.innerHTML='<div class="empty">まだ教官は登録されていません。</div>';return}
 e.innerHTML=instructorRows.map(x=>'<div class="card"><div class="between"><div><div class="title">'+esc(x.name)+'</div><div class="sub">登録済み教官</div></div><button class="btn small danger" data-delete-instructor="'+x.id+'">削除</button></div></div>').join('');
 document.querySelectorAll('[data-delete-instructor]').forEach(b=>b.addEventListener('click',()=>deleteInstructor(Number(b.dataset.deleteInstructor))));
}
function refreshInstructorSelect(selected){
 const sel=document.getElementById('instructor');
 if(!sel)return;
 sel.innerHTML='<option value="">担当者なし</option>'+instructorRows.map(x=>'<option value="'+esc(x.name)+'">'+esc(x.name)+'</option>').join('');
 if(selected)sel.value=selected;
}
async function createInstructor(){
 const name=document.getElementById('instructorName').value.trim();
 if(!name){noticeInAdmin('instructorMsg','教官名を入力してください','error');return}
 const btn=document.getElementById('createInstructorBtn');btn.disabled=true;btn.textContent='登録中...';
 try{
   const r=await fetch('/api/admin/instructors',{method:'POST',headers:auth(),body:JSON.stringify({name})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok){noticeInAdmin('instructorMsg',d.error||'登録できませんでした','error');return}
   document.getElementById('instructorName').value='';
   noticeInAdmin('instructorMsg','教官を登録しました','success');
   await loadInstructors();
 }finally{btn.disabled=false;btn.textContent='教官を登録'}
}
async function deleteInstructor(id){
 if(!confirm('この教官を削除しますか？\\n既存研修の担当者名はそのまま残ります。'))return;
 const r=await fetch('/api/admin/instructors/'+id,{method:'DELETE',headers:auth()});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){alert(d.error||'削除できませんでした');return}
 await loadInstructors();
}

let programRows=[];
async function loadPrograms(){
 const r=await fetch('/api/admin/programs',{headers:auth()});
 if(r.status===401)return logout();
 const d=await r.json().catch(()=>[]);
 if(!r.ok){document.getElementById('programList').innerHTML='<div class="notice error">'+esc(d.error||'研修プログラムを取得できませんでした')+'</div>';return}
 programRows=d;renderPrograms();
}
function renderPrograms(){
 const e=document.getElementById('programList');
 if(!programRows.length){e.innerHTML='<div class="empty">まだ研修プログラムはありません。</div>';return}
 e.innerHTML=programRows.map(p=>'<div class="card"><div class="between"><div><div class="title">'+esc(p.name)+'</div>'+(p.description?'<div class="sub" style="margin-top:6px;white-space:pre-wrap">'+esc(p.description)+'</div>':'')+'<div class="sub" style="margin-top:7px">研修生はこのプログラムへ直接申請します。</div></div><button class="btn small danger" data-delete-program="'+p.id+'">削除</button></div></div>').join('');
 document.querySelectorAll('[data-delete-program]').forEach(b=>b.addEventListener('click',()=>deleteProgram(Number(b.dataset.deleteProgram))));
}
async function createProgram(){
 const name=document.getElementById('programName').value.trim();
 const description=document.getElementById('programDescription').value.trim();
 if(!name){noticeInAdmin('programMsg','研修名を入力してください','error');return}
 const btn=document.getElementById('createProgramBtn');btn.disabled=true;btn.textContent='作成中...';
 try{
   const r=await fetch('/api/admin/programs',{method:'POST',headers:auth(),body:JSON.stringify({name,description})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok){noticeInAdmin('programMsg',d.error||'作成できませんでした','error');return}
   document.getElementById('programName').value='';
   document.getElementById('programDescription').value='';
   noticeInAdmin('programMsg','研修プログラムを作成しました','success');
   await loadPrograms();
 }finally{btn.disabled=false;btn.textContent='研修プログラムを作成'}
}
function noticeInAdmin(id,t,c){document.getElementById(id).innerHTML='<div class="notice '+(c||'')+'">'+esc(t)+'</div>'}
async function deleteProgram(id){
 if(!confirm('この研修プログラムを削除しますか？'))return;
 const r=await fetch('/api/admin/programs/'+id,{method:'DELETE',headers:auth()});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){alert(d.error||'削除できませんでした');return}
 await loadPrograms();
}

let traineeRows=[];
async function loadTrainees(){
 const r=await fetch('/api/admin/trainees',{headers:auth()});
 if(r.status===401)return logout();
 traineeRows=await r.json();renderTrainees();
}
function renderTrainees(){
 const q=(document.getElementById('traineeSearch')?.value||'').trim().toLowerCase();
 const rows=traineeRows.filter(x=>!q||[x.player_name,x.discord_id,x.affiliation].some(v=>String(v||'').toLowerCase().includes(q)));
 const e=document.getElementById('traineeList');
 if(!rows.length){e.innerHTML='<div class="empty">該当する研修生はいません。</div>';return}
 e.innerHTML=rows.map(x=>'<div class="card traineeCard" data-discord="'+encodeURIComponent(x.discord_id)+'"><div class="between"><div class="profileHead"><div class="avatar">'+esc((x.player_name||'?').slice(0,1))+'</div><div><div class="title">'+esc(x.player_name||'名前未登録')+'</div><div class="sub">Discord：'+esc(x.discord_id||'未登録')+'</div><div class="sub">'+esc([x.affiliation,x.rank].filter(Boolean).join(' / ')||'所属・階級 未登録')+'</div></div></div><button class="btn small traineeOpenBtn" data-discord="'+encodeURIComponent(x.discord_id)+'">詳細</button></div><div class="meta"><span>申請 '+x.total+'件</span><span>承認待ち '+x.pending+'</span><span>予約 '+x.reserved+'</span><span>受講済み '+x.completed+'</span><span>欠席 '+x.absent+'</span></div></div>').join('');
 document.querySelectorAll('.traineeOpenBtn').forEach(btn=>btn.addEventListener('click',()=>openTraineeDetail(decodeURIComponent(btn.dataset.discord))));
}
async function openTraineeDetail(discord){
 document.getElementById('traineeModal').classList.add('open');
 document.getElementById('traineeDetail').innerHTML='<div class="empty">読み込み中...</div>';
 const r=await fetch('/api/admin/trainee-history?discord_id='+encodeURIComponent(discord),{headers:auth()});
 const d=await r.json();
 if(!r.ok){document.getElementById('traineeDetail').innerHTML='<div class="notice error">'+esc(d.error||'取得できませんでした')+'</div>';return}
 document.getElementById('traineeDetailTitle').textContent=(d.profile.player_name||'研修生')+' / 研修履歴';
 document.getElementById('traineeDetail').innerHTML='<div class="card"><div class="sub">Discord</div><b>'+esc(d.profile.discord_id)+'</b><div class="sub" style="margin-top:8px">'+esc([d.profile.affiliation,d.profile.rank].filter(Boolean).join(' / ')||'所属・階級 未登録')+'</div><div class="grid" style="margin-top:14px"><div class="stat"><span class="sub">承認待ち</span><b>'+d.stats.pending+'</b></div><div class="stat"><span class="sub">予約確定</span><b>'+d.stats.reserved+'</b></div><div class="stat"><span class="sub">受講済み</span><b>'+d.stats.completed+'</b></div><div class="stat"><span class="sub">欠席</span><b>'+d.stats.absent+'</b></div></div></div><div class="section">履歴</div>'+(d.history.length?d.history.map(x=>'<div class="card"><div class="between"><div><span class="pill '+esc(x.status)+'">'+esc(labels[x.status]||x.status)+'</span><div class="title" style="margin-top:7px">'+esc(x.title)+'</div><div class="meta"><span>📅 '+fmt(x.training_date)+'</span><span>🕒 '+esc(x.start_time||'')+(x.end_time?'〜'+esc(x.end_time):'')+'</span></div></div></div>'+(x.note?'<div class="sub">備考：'+esc(x.note)+'</div>':'')+'</div>').join(''):'<div class="empty">履歴がありません。</div>');
}
function closeTraineeDetail(){document.getElementById('traineeModal').classList.remove('open')}
function fmt(d){return new Date(d+'T00:00:00').toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'})}
async function loadAdmin(){
 if(!instructorRows.length){const ir=await fetch('/api/admin/instructors',{headers:auth()});if(ir.ok)instructorRows=await ir.json().catch(()=>[]);}
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
async function openTraining(id){
 const t=id?trainings.find(x=>x.id===id):null;
 document.getElementById('trainingMsg').innerHTML='';
 document.getElementById('trainingModal').classList.add('open');
 document.getElementById('trainingModalTitle').textContent=t?'研修を編集':'研修を追加';
 document.getElementById('trainingId').value=t?.id||'';
 document.getElementById('title').value=t?.title||'';
 document.getElementById('description').value=t?.description||'';
 if(!instructorRows.length)await loadInstructors();
 refreshInstructorSelect(t?.instructor||'');
}
function closeTraining(){document.getElementById('trainingModal').classList.remove('open')}
async function saveTraining(){
 const modalMsg=document.getElementById('trainingMsg');
 const title=document.getElementById('title').value.trim();
 const description=document.getElementById('description').value.trim();
 const instructor=document.getElementById('instructor').value.trim();

 if(!title){
   modalMsg.innerHTML='<div class="notice error">研修名を入力してください。</div>';
   document.getElementById('title').focus();return;
 }

 const id=document.getElementById('trainingId').value;
 const existing=id?trainings.find(x=>String(x.id)===String(id)):null;

 // DBの必須項目は画面に出さず内部値で保持
 const body={
   category:'一般研修',
   title,
   description,
   training_date:existing?.training_date||'2099-12-31',
   capacity:999,
   start_time:existing?.start_time||'00:00',
   end_time:'',
   instructor,
   location:''
 };

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
   let d={};try{d=await r.json()}catch(_){}
   if(!r.ok){
     modalMsg.innerHTML='<div class="notice error">'+esc(d.error||('保存できませんでした（HTTP '+r.status+'）'))+'</div>';
     return;
   }
   closeTraining();
   msg('研修を保存しました','success');
   await loadAdmin();
 }catch(e){
   modalMsg.innerHTML='<div class="notice error">通信エラーで保存できませんでした。</div>';
 }finally{
   saveBtn.disabled=false;saveBtn.textContent=oldText;
 }
}
async function deleteTraining(id){if(!confirm('この研修と関連予約を削除しますか？'))return;const r=await fetch('/api/admin/trainings/'+id,{method:'DELETE',headers:auth()});if(r.ok){msg('削除しました','success');loadAdmin()}}
async function openReservations(id,title){activeTrainingId=id;document.getElementById('resTitle').textContent=title+' / 参加者管理';document.getElementById('resModal').classList.add('open');await loadReservations()}
function closeReservations(){document.getElementById('resModal').classList.remove('open')}
async function loadReservations(){const r=await fetch('/api/admin/trainings/'+activeTrainingId+'/reservations',{headers:auth()});const data=await r.json();const e=document.getElementById('resList');if(!data.length){e.innerHTML='<div class="empty">申請者はいません。</div>';return}
 e.innerHTML=data.map(x=>'<div class="res"><div class="between"><div><b>'+esc(x.player_name)+'</b> <span class="pill '+esc(x.status)+'">'+esc(labels[x.status]||x.status)+'</span><div class="sub">Discord：'+esc(x.discord_id||'未登録')+'</div><div class="sub">'+esc(x.affiliation||'所属未入力')+'</div></div></div>'+(x.note?'<div class="sub" style="margin-top:6px">備考：'+esc(x.note)+'</div>':'')+'<div class="field" style="margin:10px 0"><label>担当教官</label><select id="reservationInstructor_'+x.id+'"><option value="">担当教官を選択</option>'+instructorRows.map(i=>'<option value="'+esc(i.name)+'" '+(x.assigned_instructor===i.name?'selected':'')+'>'+esc(i.name)+'</option>').join('')+'</select></div><div class="statusButtons">'+(x.status==='pending'?'<button class="btn primary small statusBtn" data-id="'+x.id+'" data-status="reserved">担当を決めて承認</button>':'')+'<button class="btn small statusBtn" data-id="'+x.id+'" data-status="completed">受講済み</button><button class="btn small statusBtn" data-id="'+x.id+'" data-status="absent">欠席</button><button class="btn danger small statusBtn" data-id="'+x.id+'" data-status="cancelled">取消</button></div></div>').join('');
 document.querySelectorAll('.statusBtn').forEach(btn=>btn.addEventListener('click',()=>setStatus(Number(btn.dataset.id),btn.dataset.status)));
}
async function setStatus(id,status){
 let assigned_instructor='';
 if(status==='reserved'){
   const sel=document.getElementById('reservationInstructor_'+id);
   assigned_instructor=sel?sel.value.trim():'';
   if(!assigned_instructor){alert('担当教官を選択してから承認してください。');return}
 }
 const r=await fetch('/api/admin/reservations/'+id+'/status',{
   method:'POST',
   headers:auth(),
   body:JSON.stringify({status,assigned_instructor})
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok){alert(d.error||'更新できませんでした');return}
 await loadAdmin();
}
async function uploadAsWorker(){
 const input=document.getElementById('workerFile');
 const btn=document.getElementById('workerUploadBtn');
 const msgEl=document.getElementById('workerUploadMsg');
 const file=input?.files?.[0];
 if(!file){msgEl.innerHTML='<div class="notice error">JSファイルを選択してください。</div>';return}
 btn.disabled=true;btn.textContent='アップロード中...';
 msgEl.innerHTML='<div class="notice">worker.jsとしてGitHubへ送信しています...</div>';
 try{
   const fd=new FormData();
   fd.append('file',file,file.name);
   const r=await fetch('/api/admin/github/upload-worker',{method:'POST',headers:adminPassword?{'x-admin-password':adminPassword}:{},body:fd});
   const d=await r.json().catch(()=>({}));
   if(!r.ok){msgEl.innerHTML='<div class="notice error">'+esc(d.error||'アップロードに失敗しました')+'</div>';return}
   msgEl.innerHTML='<div class="notice success">worker.jsを更新しました。Cloudflareの自動ビルドを待ってください。</div>';
   input.value='';
 }catch(e){
   msgEl.innerHTML='<div class="notice error">通信エラーでアップロードできませんでした。</div>';
 }finally{
   btn.disabled=false;btn.textContent='worker.jsとして更新';
 }
}

function updateFileInfo(){
  const files=[...document.getElementById('gitFile').files];
  const el=document.getElementById('gitFileInfo');
  if(!files.length){el.textContent='ファイル未選択';return}
  const total=files.reduce((n,f)=>n+f.size,0);
  el.textContent=files.length+'個選択 ・ 合計 '+(total/1024).toFixed(total>1024?0:1)+' KB';
}
document.getElementById('trainingSaveBtn')?.addEventListener('click',saveTraining);
document.getElementById('traineeSearch')?.addEventListener('input',renderTrainees);
document.getElementById('createProgramBtn')?.addEventListener('click',createProgram);
document.getElementById('createInstructorBtn')?.addEventListener('click',createInstructor);
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
document.getElementById('workerUploadBtn')?.addEventListener('click',uploadAsWorker);
document.getElementById('gitFile')?.addEventListener('change',updateFileInfo);
document.getElementById('adminLoginBtn')?.addEventListener('click',login);
document.getElementById('password')?.addEventListener('keydown',e=>{if(e.key==='Enter')login()});
restoreAdmin();
`;

async function handle(request, env) {
 const url=new URL(request.url), path=url.pathname, method=request.method;
 const adminPass=env.ADMIN_PASSWORD || "game1234";
 const isAdmin=async()=>request.headers.get("x-admin-password")===adminPass || await verifyAdminSession(request,adminPass);

 if(path==="/" && method==="GET") return html("研修予約システム",LANDING_BODY,"");
 if(path==="/trainee" && method==="GET") return html("研修生ページ",PUBLIC_BODY,PUBLIC_SCRIPT);
 if(path==="/admin" && method==="GET") return html("研修管理",ADMIN_BODY,ADMIN_SCRIPT);

 if(path==="/api/trainings" && method==="GET"){
   try{
     await ensureTrainingPrograms(env);
     const {results}=await env.DB.prepare(`
       SELECT training_id AS id,name AS title,description
       FROM training_programs
       WHERE active=1 AND training_id IS NOT NULL
       ORDER BY id
     `).all();
     return json(results || []);
   }catch(e){
     return json({error:"研修を取得できませんでした",detail:String(e?.message||e)},500);
   }
 }
 if(path==="/api/trainee/register" && method==="POST"){
   await ensureTraineeProfiles(env);
   const b=await request.json().catch(()=>({}));
   const playerName=String(b.player_name||"").trim();
   const discordId=String(b.discord_id||"").trim();
   const affiliation=String(b.affiliation||"").trim();
   const rank=String(b.rank||"").trim();
   if(!playerName||!discordId)return json({error:"プレイヤー名とDiscord IDは必須です"},400);
   const exists=await env.DB.prepare("SELECT id FROM trainee_profiles WHERE lower(trim(discord_id))=lower(trim(?))").bind(discordId).first();
   if(exists)return json({error:"このDiscord IDはすでに登録されています"},409);
   await env.DB.prepare("INSERT INTO trainee_profiles(player_name,discord_id,affiliation,rank) VALUES(?,?,?,?)")
     .bind(playerName,discordId,affiliation,rank).run();
   return json({ok:true,profile:{player_name:playerName,discord_id:discordId,affiliation,rank}},201);
 }

 if(path==="/api/trainee/profile" && method==="GET"){
   await ensureReservationInstructor(env);
   await ensureTraineeProfiles(env);
   const discordId=(url.searchParams.get("discord_id")||"").trim();
   if(!discordId)return json({error:"Discord IDが必要です"},400);

   let profile=null;
   try{
     profile=await env.DB.prepare(
       "SELECT player_name,discord_id,affiliation,rank FROM trainee_profiles WHERE lower(trim(discord_id))=lower(trim(?))"
     ).bind(discordId).first();
   }catch(e){
     return json({error:"研修生情報の取得に失敗しました",detail:String(e?.message||e)},500);
   }

   let results=[];
   let historyWarning="";
   try{
     const q=await env.DB.prepare(`
       SELECT
         r.id,r.training_id,r.player_name,r.discord_id,r.affiliation,r.note,r.status,
         t.title,t.training_date,t.start_time,t.end_time,t.location,t.category
       FROM reservations r
       JOIN trainings t ON t.id=r.training_id
       WHERE lower(trim(COALESCE(r.discord_id,'')))=lower(trim(?))
       ORDER BY t.training_date DESC,t.start_time DESC,r.id DESC
     `).bind(discordId).all();
     results=Array.isArray(q?.results)?q.results:[];
   }catch(e){
     historyWarning=String(e?.message||e);
     results=[];
   }

   if(!profile && !results.length){
     return json({error:"研修生登録が見つかりません。初めての方は研修生登録をしてください。"},404);
   }
   if(!profile){
     const latest=results[0];
     profile={
       player_name:latest?.player_name||"",
       discord_id:latest?.discord_id||discordId,
       affiliation:latest?.affiliation||"",
       rank:""
     };
   }

   const stats={pending:0,reserved:0,completed:0,absent:0,cancelled:0};
   for(const x of results){
     if(stats[x.status]!==undefined)stats[x.status]++;
   }
   return json({profile,stats,history:results,history_warning:historyWarning||undefined});
 }

 if(path==="/api/reservations" && method==="POST"){
   const b=await request.json().catch(()=>({}));
   if(!b.training_id||!b.player_name||!b.discord_id) return json({error:"必須項目が不足しています"},400);
   await ensureTrainingPrograms(env);
   const t=await env.DB.prepare("SELECT capacity FROM trainings WHERE id=?").bind(b.training_id).first();
   if(!t)return json({error:"研修が見つかりません"},404);

   const step=await env.DB.prepare("SELECT id,program_id,step_order FROM training_program_steps WHERE training_id=?").bind(b.training_id).first();
   if(step){
     const {results:prev}=await env.DB.prepare("SELECT training_id FROM training_program_steps WHERE program_id=? AND step_order<? ORDER BY step_order")
       .bind(step.program_id,step.step_order).all();
     if(prev.length){
       const {results:done}=await env.DB.prepare(`
         SELECT DISTINCT training_id FROM reservations
         WHERE lower(trim(COALESCE(discord_id,'')))=lower(trim(?)) AND status='completed'
       `).bind(b.discord_id).all();
       const doneSet=new Set(done.map(x=>Number(x.training_id)));
       const locked=prev.some(x=>!doneSet.has(Number(x.training_id)));
       if(locked)return json({error:"前の研修がまだ受講済みになっていません"},403);
     }
   }
   const c=await env.DB.prepare("SELECT COUNT(*) c FROM reservations WHERE training_id=? AND status IN ('pending','reserved')").bind(b.training_id).first();
   if(Number(c.c)>=Number(t.capacity))return json({error:"定員に達しています"},409);
   const dup=await env.DB.prepare("SELECT id FROM reservations WHERE training_id=? AND lower(player_name)=lower(?) AND status IN ('pending','reserved')").bind(b.training_id,b.player_name).first();
   if(dup)return json({error:"同じ名前ですでに申請されています"},409);
   await env.DB.prepare("INSERT INTO reservations(training_id,player_name,discord_id,affiliation,note,status) VALUES(?,?,?,?,?,'pending')")
     .bind(b.training_id,b.player_name,b.discord_id,b.affiliation||"",b.note||"").run();
   return json({ok:true},201);
 }

 if(path==="/api/admin/login" && method==="POST"){
   const b=await request.json().catch(()=>({}));
   if(String(b.password||"")!==adminPass)return json({error:"unauthorized"},401);
   const expires=String(Date.now()+12*60*60*1000);
   const sig=await adminSessionSignature(adminPass,expires);
   return new Response(JSON.stringify({ok:true,expires:Number(expires)}),{
     status:200,
     headers:{
       "content-type":"application/json; charset=utf-8",
       "cache-control":"no-store",
       "set-cookie":"lomita_admin="+encodeURIComponent(expires+"."+sig)+"; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Strict"
     }
   });
 }
 if(path==="/api/admin/logout" && method==="POST"){
   return new Response(JSON.stringify({ok:true}),{
     headers:{
       "content-type":"application/json; charset=utf-8",
       "cache-control":"no-store",
       "set-cookie":"lomita_admin=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict"
     }
   });
 }
 if(path==="/api/admin/check") return (await isAdmin())?json({ok:true}):json({error:"unauthorized"},401);
 if(path.startsWith("/api/admin/") && !(await isAdmin())) return json({error:"unauthorized"},401);

 if(path==="/api/admin/stats" && method==="GET"){
   const trainings=await env.DB.prepare("SELECT COUNT(*) c FROM trainings WHERE date(training_date)>=date('now')").first();
   const pending=await env.DB.prepare("SELECT COUNT(*) c FROM reservations WHERE status='pending'").first();
   const reserved=await env.DB.prepare("SELECT COUNT(*) c FROM reservations WHERE status='reserved'").first();
   const completed=await env.DB.prepare("SELECT COUNT(*) c FROM reservations WHERE status='completed'").first();
   return json({trainings:trainings.c,pending:pending.c,reserved:reserved.c,completed:completed.c});
 }

 if(path==="/api/admin/trainees" && method==="GET"){
   await ensureTraineeProfiles(env);
   const {results:profiles}=await env.DB.prepare("SELECT player_name,discord_id,affiliation,rank FROM trainee_profiles ORDER BY player_name COLLATE NOCASE").all();
   const {results:agg}=await env.DB.prepare(`
     SELECT
       MAX(player_name) player_name,
       MAX(discord_id) discord_id,
       MAX(affiliation) affiliation,
       COUNT(*) total,
       SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
       SUM(CASE WHEN status='reserved' THEN 1 ELSE 0 END) reserved,
       SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,
       SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) absent,
       SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) cancelled
     FROM reservations
     WHERE trim(COALESCE(discord_id,''))<>''
     GROUP BY lower(trim(discord_id))
   `).all();
   const map=new Map();
   for(const p of profiles)map.set(String(p.discord_id).trim().toLowerCase(),{...p,total:0,pending:0,reserved:0,completed:0,absent:0,cancelled:0});
   for(const a of agg){
     const key=String(a.discord_id||"").trim().toLowerCase();
     const old=map.get(key)||{player_name:a.player_name,discord_id:a.discord_id,affiliation:a.affiliation||"",rank:""};
     map.set(key,{...old,total:Number(a.total||0),pending:Number(a.pending||0),reserved:Number(a.reserved||0),completed:Number(a.completed||0),absent:Number(a.absent||0),cancelled:Number(a.cancelled||0)});
   }
   return json([...map.values()].sort((a,b)=>String(a.player_name||"").localeCompare(String(b.player_name||""),"ja")));
 }

 if(path==="/api/admin/trainee-history" && method==="GET"){
   await ensureTraineeProfiles(env);
   const discordId=(url.searchParams.get("discord_id")||"").trim();
   if(!discordId)return json({error:"Discord IDが必要です"},400);
   let profile=await env.DB.prepare("SELECT player_name,discord_id,affiliation,rank FROM trainee_profiles WHERE lower(trim(discord_id))=lower(trim(?))").bind(discordId).first();
   const {results}=await env.DB.prepare(`
     SELECT r.*,t.title,t.training_date,t.start_time,t.end_time,t.location,t.category
     FROM reservations r JOIN trainings t ON t.id=r.training_id
     WHERE lower(trim(r.discord_id))=lower(trim(?))
     ORDER BY t.training_date DESC,t.start_time DESC,r.id DESC
   `).bind(discordId).all();
   if(!profile && !results.length)return json({error:"研修生が見つかりません"},404);
   if(!profile){
     const latest=results[0];
     profile={player_name:latest.player_name,discord_id:latest.discord_id,affiliation:latest.affiliation||"",rank:""};
   }
   const stats={pending:0,reserved:0,completed:0,absent:0,cancelled:0};
   for(const x of results)if(stats[x.status]!==undefined)stats[x.status]++;
   return json({profile,stats,history:results});
 }

 if(path==="/api/admin/instructors" && method==="GET"){
   await ensureInstructors(env);
   const {results}=await env.DB.prepare("SELECT id,name,created_at FROM instructors ORDER BY name COLLATE NOCASE").all();
   return json(results);
 }

 if(path==="/api/admin/instructors" && method==="POST"){
   await ensureInstructors(env);
   const b=await request.json().catch(()=>({}));
   const name=String(b.name||"").trim();
   if(!name)return json({error:"教官名は必須です"},400);
   try{
     const r=await env.DB.prepare("INSERT INTO instructors(name) VALUES(?)").bind(name).run();
     return json({ok:true,id:r.meta?.last_row_id||null},201);
   }catch(e){
     const message=String(e?.message||e);
     if(message.toLowerCase().includes("unique"))return json({error:"同じ教官名がすでに登録されています"},409);
     return json({error:"教官を登録できませんでした",detail:message},500);
   }
 }

 let im=path.match(/^\/api\/admin\/instructors\/(\d+)$/);
 if(im && method==="DELETE"){
   await ensureInstructors(env);
   await env.DB.prepare("DELETE FROM instructors WHERE id=?").bind(Number(im[1])).run();
   return json({ok:true});
 }

 if(path==="/api/admin/programs" && method==="GET"){
   await ensureTrainingPrograms(env);
   const {results:programs}=await env.DB.prepare("SELECT * FROM training_programs ORDER BY id DESC").all();
   const {results:steps}=await env.DB.prepare(`
     SELECT ps.id,ps.program_id,ps.training_id,ps.step_order,t.title,t.description,t.instructor
     FROM training_program_steps ps JOIN trainings t ON t.id=ps.training_id
     ORDER BY ps.program_id,ps.step_order,ps.id
   `).all();
   return json(programs.map(p=>({...p,steps:steps.filter(s=>Number(s.program_id)===Number(p.id))})));
 }

 if(path==="/api/admin/programs" && method==="POST"){
   await ensureTrainingPrograms(env);
   const b=await request.json().catch(()=>({}));
   const name=String(b.name||"").trim();
   const description=String(b.description||"").trim();
   if(!name)return json({error:"研修名は必須です"},400);

   const tr=await env.DB.prepare(`
     INSERT INTO trainings(title,description,training_date,start_time,capacity,instructor,location)
     VALUES(?,?,?,?,?,?,?)
   `).bind(name,description,"2099-12-31","00:00",999,"","").run();
   const trainingId=Number(tr.meta?.last_row_id||0);

   const r=await env.DB.prepare("INSERT INTO training_programs(name,description,training_id) VALUES(?,?,?)")
     .bind(name,description,trainingId).run();
   return json({ok:true,id:r.meta?.last_row_id||null,training_id:trainingId},201);
 }
 let pm=path.match(/^\/api\/admin\/programs\/(\d+)$/);
 if(pm && method==="DELETE"){
   await ensureTrainingPrograms(env);
   const p=await env.DB.prepare("SELECT training_id FROM training_programs WHERE id=?").bind(Number(pm[1])).first();
   await env.DB.prepare("DELETE FROM training_program_steps WHERE program_id=?").bind(Number(pm[1])).run();
   await env.DB.prepare("DELETE FROM training_programs WHERE id=?").bind(Number(pm[1])).run();
   if(p?.training_id){
     await env.DB.prepare("DELETE FROM reservations WHERE training_id=?").bind(Number(p.training_id)).run();
     await env.DB.prepare("DELETE FROM trainings WHERE id=?").bind(Number(p.training_id)).run();
   }
   return json({ok:true});
 }

 pm=path.match(/^\/api\/admin\/programs\/(\d+)\/create-training$/);
 if(pm && method==="POST"){
   await ensureTrainingPrograms(env);
   await ensureInstructors(env);
   const programId=Number(pm[1]);
   const program=await env.DB.prepare("SELECT id FROM training_programs WHERE id=?").bind(programId).first();
   if(!program)return json({error:"研修プログラムが見つかりません"},404);

   const b=await request.json().catch(()=>({}));
   const title=String(b.title||"").trim();
   const description=String(b.description||"").trim();
   const instructor=String(b.instructor||"").trim();
   if(!title)return json({error:"研修名は必須です"},400);

   if(instructor){
     const validInstructor=await env.DB.prepare("SELECT id FROM instructors WHERE lower(trim(name))=lower(trim(?))").bind(instructor).first();
     if(!validInstructor)return json({error:"選択した教官が登録されていません"},400);
   }

   const max=await env.DB.prepare("SELECT COALESCE(MAX(step_order),0) n FROM training_program_steps WHERE program_id=?").bind(programId).first();
   const nextOrder=Number(max?.n||0)+1;

   // Existing trainings schema has required date/time/capacity, but UI no longer uses them.
   const insert=await env.DB.prepare(`
     INSERT INTO trainings(category,title,description,training_date,start_time,end_time,capacity,instructor,location)
     VALUES(?,?,?,?,?,?,?,?,?)
   `).bind(
     "一般研修",title,description,"2099-12-31","00:00","",999,instructor,""
   ).run();

   const trainingId=Number(insert.meta?.last_row_id||0);
   if(!trainingId)return json({error:"研修の作成に失敗しました"},500);

   try{
     await env.DB.prepare("INSERT INTO training_program_steps(program_id,training_id,step_order) VALUES(?,?,?)")
       .bind(programId,trainingId,nextOrder).run();
   }catch(e){
     await env.DB.prepare("DELETE FROM trainings WHERE id=?").bind(trainingId).run();
     return json({error:"プログラムへの追加に失敗しました",detail:String(e?.message||e)},500);
   }

   return json({ok:true,training_id:trainingId,step_order:nextOrder},201);
 }

 pm=path.match(/^\/api\/admin\/programs\/(\d+)\/steps$/);
 if(pm && method==="POST"){
   await ensureTrainingPrograms(env);
   const b=await request.json().catch(()=>({}));
   const trainingId=Number(b.training_id);
   if(!trainingId)return json({error:"研修を選択してください"},400);
   const exists=await env.DB.prepare("SELECT id FROM training_program_steps WHERE training_id=?").bind(trainingId).first();
   if(exists)return json({error:"この研修はすでに別のプログラムに入っています"},409);
   const max=await env.DB.prepare("SELECT COALESCE(MAX(step_order),0) n FROM training_program_steps WHERE program_id=?").bind(Number(pm[1])).first();
   await env.DB.prepare("INSERT INTO training_program_steps(program_id,training_id,step_order) VALUES(?,?,?)")
     .bind(Number(pm[1]),trainingId,Number(max.n||0)+1).run();
   return json({ok:true},201);
 }

 let sm=path.match(/^\/api\/admin\/program-steps\/(\d+)$/);
 if(sm && method==="DELETE"){
   await ensureTrainingPrograms(env);
   const step=await env.DB.prepare("SELECT program_id,step_order FROM training_program_steps WHERE id=?").bind(Number(sm[1])).first();
   if(step){
     await env.DB.prepare("DELETE FROM training_program_steps WHERE id=?").bind(Number(sm[1])).run();
     await env.DB.prepare("UPDATE training_program_steps SET step_order=step_order-1 WHERE program_id=? AND step_order>?")
       .bind(step.program_id,step.step_order).run();
   }
   return json({ok:true});
 }

 sm=path.match(/^\/api\/admin\/program-steps\/(\d+)\/move$/);
 if(sm && method==="POST"){
   await ensureTrainingPrograms(env);
   const b=await request.json().catch(()=>({}));
   const dir=Number(b.direction)===-1?-1:1;
   const cur=await env.DB.prepare("SELECT id,program_id,step_order FROM training_program_steps WHERE id=?").bind(Number(sm[1])).first();
   if(!cur)return json({error:"ステップが見つかりません"},404);
   const targetOrder=Number(cur.step_order)+dir;
   const other=await env.DB.prepare("SELECT id FROM training_program_steps WHERE program_id=? AND step_order=?").bind(cur.program_id,targetOrder).first();
   if(!other)return json({ok:true});
   await env.DB.batch([
     env.DB.prepare("UPDATE training_program_steps SET step_order=0 WHERE id=?").bind(cur.id),
     env.DB.prepare("UPDATE training_program_steps SET step_order=? WHERE id=?").bind(cur.step_order,other.id),
     env.DB.prepare("UPDATE training_program_steps SET step_order=? WHERE id=?").bind(targetOrder,cur.id)
   ]);
   return json({ok:true});
 }

 if(path==="/api/admin/trainings" && method==="GET"){
   await ensureReservationInstructor(env);
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
   await ensureTrainingPrograms(env);
   const oldStep=await env.DB.prepare("SELECT program_id,step_order FROM training_program_steps WHERE training_id=?").bind(Number(m[1])).first();
   await env.DB.prepare("DELETE FROM training_program_steps WHERE training_id=?").bind(Number(m[1])).run();
   if(oldStep)await env.DB.prepare("UPDATE training_program_steps SET step_order=step_order-1 WHERE program_id=? AND step_order>?").bind(oldStep.program_id,oldStep.step_order).run();
   await env.DB.prepare("DELETE FROM reservations WHERE training_id=?").bind(Number(m[1])).run();
   await env.DB.prepare("DELETE FROM trainings WHERE id=?").bind(Number(m[1])).run(); return json({ok:true});
 }

 m=path.match(/^\/api\/admin\/trainings\/(\d+)\/reservations$/);
 if(m && method==="GET"){
   const {results}=await env.DB.prepare("SELECT * FROM reservations WHERE training_id=? ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'reserved' THEN 1 ELSE 2 END, created_at").bind(Number(m[1])).all(); return json(results);
 }

 m=path.match(/^\/api\/admin\/reservations\/(\d+)$/);
 if(m && method==="PATCH"){
   await ensureReservationInstructor(env);
   await ensureInstructors(env);
   const b=await request.json().catch(()=>({}));
   if(!['pending','reserved','completed','absent','cancelled'].includes(b.status))return json({error:"invalid status"},400);
   const assigned=String(b.assigned_instructor||"").trim();
   if(b.status==="reserved"){
     if(!assigned)return json({error:"担当教官を選択してください"},400);
     const ok=await env.DB.prepare("SELECT id FROM instructors WHERE lower(trim(name))=lower(trim(?))").bind(assigned).first();
     if(!ok)return json({error:"登録されていない教官です"},400);
     await env.DB.prepare("UPDATE reservations SET status=?,assigned_instructor=? WHERE id=?").bind(b.status,assigned,Number(m[1])).run();
   }else{
     await env.DB.prepare("UPDATE reservations SET status=? WHERE id=?").bind(b.status,Number(m[1])).run();
   }
   return json({ok:true});
 }

 if(path==="/api/admin/github/upload-worker" && method==="POST"){
   if(!env.GITHUB_TOKEN) return json({error:"Cloudflareに GITHUB_TOKEN が設定されていません"},500);
   const form=await request.formData();
   const file=form.get("file");
   if(!file || typeof file.arrayBuffer!=="function") return json({error:"JSファイルがありません"},400);
   if(file.size>5*1024*1024) return json({error:"5MB以下のJSファイルにしてください"},413);

   const repo=env.GITHUB_REPO || "yuuji0628/lomita-police-training-reservation";
   const branch=env.GITHUB_BRANCH || "main";
   const base="https://api.github.com/repos/"+repo;
   const headers={
     "authorization":"Bearer "+env.GITHUB_TOKEN,
     "accept":"application/vnd.github+json",
     "x-github-api-version":"2022-11-28",
     "user-agent":"lomita-training-admin",
     "content-type":"application/json"
   };

   const currentRes=await fetch(base+"/contents/worker.js?ref="+encodeURIComponent(branch),{headers});
   const current=await currentRes.json().catch(()=>({}));
   if(!currentRes.ok) return json({error:current.message||"現在のworker.jsを取得できません"},currentRes.status);

   const bytes=new Uint8Array(await file.arrayBuffer());
   let binary="";
   for(let i=0;i<bytes.length;i+=0x8000){
     binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
   }

   const putRes=await fetch(base+"/contents/worker.js",{
     method:"PUT",
     headers,
     body:JSON.stringify({
       message:"admin: update worker.js",
       content:btoa(binary),
       sha:current.sha,
       branch
     })
   });
   const result=await putRes.json().catch(()=>({}));
   if(!putRes.ok) return json({error:result.message||"worker.jsを更新できませんでした"},putRes.status);

   return json({ok:true,commit_sha:result.commit?.sha||"",path:"worker.js"});
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
