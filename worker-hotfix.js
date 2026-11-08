import core from "./worker.js";

/*
  Version 2.47 direct progress stamp revoke

  v2.05 の復旧取得が失敗する環境向けに、復旧経路をさらに単純化。
  - PRAGMA を使わない
  - instructors API を認証確認に使わない
  - /api/admin/check だけで認証確認
  - reservations を読み取り専用で直接取得
  - 期限超過処理・ALTER TABLE・DELETE・UPDATE は実行しない
*/

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

const HOTFIX_VERSION = "3.03";

async function syncDisplayedVersion(response){
  try{
    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if(!type.includes("text/html")) return response;
    // v2.68: メンテナンス画面や503ページには管理用UIを注入しない
    if(response.status===503) return response;

    const body = await response.text();
    if(body.includes("ただいまメンテナンス中です") || body.includes("現在メンテナンス中です")){
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      return new Response(body,{status:response.status,statusText:response.statusText,headers});
    }
    let replaced = body
      .replace(/Version\s+2\.04/g, "Version " + HOTFIX_VERSION)
      .replace(/Version\s+2\.05/g, "Version " + HOTFIX_VERSION)
      .replace(/Version\s+2\.06/g, "Version " + HOTFIX_VERSION)
      .replace(/Version\s+2\.07/g, "Version " + HOTFIX_VERSION)
      .replace(/Version\s+2\.08/g, "Version " + HOTFIX_VERSION)
      .replace(/Version\s+2\.09/g, "Version " + HOTFIX_VERSION)
      .replace(/Version\s+2\.10/g, "Version " + HOTFIX_VERSION)
      .replace(/Version\s+2\.11/g, "Version " + HOTFIX_VERSION)
      .replace(/Version\s+2\.12/g, "Version " + HOTFIX_VERSION);
    const timeBlockPatterns = [
      /(<div[^>]*class="[^"]*(?:time|clock|jst)[^"]*"[^>]*>[\s\S]*?<\/div>)/i,
      /(<div[^>]*>[\s\S]*?JST[\s\S]*?<\/div>)/i
    ];

    let placed = false;
    for(const p of timeBlockPatterns){
      if(p.test(replaced)){
placed = true;
        break;
      }
    }
    if(!placed && replaced.includes("</body>")){
}

    const headers = new Headers(response.headers);
    headers.delete("content-length");

    return new Response(replaced, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }catch(_){
    return response;
  }
}

async function verifyAdmin(request, env, ctx){
  const url = new URL(request.url);
  url.pathname = "/api/admin/check";
  url.search = "";

  const probe = new Request(url.toString(), {
    method: "GET",
    headers: request.headers
  });

  const response = await core.fetch(probe, env, ctx);
  return response.ok;
}

async function ensureReadIndexes(env){
  // 1回作成後は軽量。予約一覧の status + id 絞り込みを高速化し、
  // D1 の不要な行読み取りを減らす。
  try{
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_reservations_status_id ON reservations(status,id DESC)"
    ).run();
  }catch(_){}
  try{
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_reservations_training_id ON reservations(training_id)"
    ).run();
  }catch(_){}
}

async function safeReservationList(request, env, ctx){
  const fail = (stage, detail, status = 500) => json({
    error: `【診断:${stage}】 ${String(detail || "不明なエラー").slice(0, 700)}`,
    stage,
    detail: String(detail || "").slice(0, 700),
    version: HOTFIX_VERSION
  }, status);

  if(!env?.DB){
    return fail("DB_BINDING", "DB binding が見つかりません");
  }

  try{
    const authed = await verifyAdmin(request, env, ctx);
    if(!authed){
      return fail("ADMIN_AUTH", "管理者認証に失敗しました", 401);
    }
  }catch(err){
    return fail("ADMIN_AUTH_CHECK", err?.message || err);
  }

  await ensureReadIndexes(env);

  try{
    // 画面で即対応が必要な状態を優先。全件読みを避ける。
    const url = new URL(request.url);
    const cookie = String(request.headers.get("cookie")||"");
    const cm = cookie.match(/(?:^|;\s*)reservation_page=(\d+)/);
    const requested = Number(url.searchParams.get("page") || cm?.[1] || 1);
    const page = Math.max(1, Math.min(999, Number.isFinite(requested)?requested:1));
    const limit = 20;
    const offset = (page-1)*limit;

    const pageRows = await env.DB.prepare(`
      SELECT
        r.id,r.training_id,r.player_name,r.discord_id,r.affiliation,r.note,r.status,
        r.assigned_instructor,r.preferred_date,r.preferred_time,
        r.preferred_date2,r.preferred_time2,r.preferred_date3,r.preferred_time3,
        r.confirmed_date,r.confirmed_time,r.confirmed_preference,
        r.exam_result,r.exam_score,r.created_at,
        COALESCE(t.title,'研修') AS title,
        COALESCE(t.training_date,'') AS training_date,
        COALESCE(t.start_time,'') AS start_time,
        COALESCE(t.instructor,'') AS instructor
      FROM reservations r
      LEFT JOIN trainings t ON t.id=r.training_id
      WHERE r.status IN ('pending','reserved','retake','absent','expired','completed')
      ORDER BY
        CASE r.status WHEN 'pending' THEN 0 WHEN 'reserved' THEN 1 WHEN 'retake' THEN 2 WHEN 'absent' THEN 3 WHEN 'expired' THEN 4 ELSE 5 END,
        r.id DESC
      LIMIT ? OFFSET ?
    `).bind(limit+1,offset).all();

    const raw = Array.isArray(pageRows?.results) ? pageRows.results : [];
    const hasMore = raw.length > limit;
    const rows = raw.slice(0,limit);

    const normalizedRows = rows.map(x => ({
      ...x,
      assigned_instructor: String(x.assigned_instructor || ""),
      preferred_date: String(x.preferred_date || ""),
      preferred_time: String(x.preferred_time || ""),
      preferred_date2: String(x.preferred_date2 || ""),
      preferred_time2: String(x.preferred_time2 || ""),
      preferred_date3: String(x.preferred_date3 || ""),
      preferred_time3: String(x.preferred_time3 || ""),
      confirmed_date: String(x.confirmed_date || ""),
      confirmed_time: String(x.confirmed_time || ""),
      confirmed_preference: Number(x.confirmed_preference || 0),
      exam_result: String(x.exam_result || ""),
      exam_score: x.exam_score ?? null,
      _d1_saver: true
    }));
    const response = json(normalizedRows);
    response.headers.set("x-reservation-page", String(page));
    response.headers.set("x-reservation-has-more", hasMore?"1":"0");
    return response;
  }catch(err){
    if(isD1QuotaError(err)){
      return json({
        error:"現在メンテナンス中です",
        code:"maintenance_d1_quota",
        version:HOTFIX_VERSION
      },503);
    }
    return fail("D1_SAVER_READ", err?.message || err);
  }
}
function maintenanceHtml(){
  const nextResetLabel = (() => {
    const now = new Date();
    // D1 Free Tier daily limits reset at 00:00 UTC = 09:00 JST.
    const jstNow = new Date(now.getTime() + 9*60*60*1000);
    const y = jstNow.getUTCFullYear();
    const m = jstNow.getUTCMonth();
    const d = jstNow.getUTCDate();

    let resetUtc = new Date(Date.UTC(y, m, d, 0, 0, 0));
    if(resetUtc.getTime() <= now.getTime()){
      resetUtc = new Date(resetUtc.getTime() + 24*60*60*1000);
    }

    const resetJst = new Date(resetUtc.getTime() + 9*60*60*1000);
    const mm = String(resetJst.getUTCMonth()+1).padStart(2,"0");
    const dd = String(resetJst.getUTCDate()).padStart(2,"0");
    const hh = String(resetJst.getUTCHours()).padStart(2,"0");
    const mi = String(resetJst.getUTCMinutes()).padStart(2,"0");
    return `${mm}/${dd} ${hh}:${mi}頃`;
  })();

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b2d52">
<title>メンテナンス中｜LOMITA POLICE TRAINING</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;background:#eef3f8;color:#102b47}
  body{display:flex;align-items:center;justify-content:center;padding:24px}
  .wrap{width:min(100%,560px)}
  .brand{background:linear-gradient(135deg,#092744,#123f6d);color:#fff;border-radius:22px;padding:22px 20px;box-shadow:0 16px 40px rgba(7,35,64,.16);position:relative;overflow:hidden}
  .brand:after{content:"POLICE";position:absolute;right:-8px;top:8px;font-size:72px;font-weight:1000;color:rgba(255,255,255,.035)}
  .badge{display:inline-block;background:linear-gradient(#f9e390,#d6ad43);color:#18304a;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:1000;letter-spacing:.06em}
  h1{margin:14px 0 6px;font-size:28px;line-height:1.15}
  .sub{margin:0;color:#d8e5f2;font-size:14px}
  .card{margin-top:14px;background:#fff;border:1px solid #d5e0eb;border-radius:18px;padding:20px;box-shadow:0 8px 24px rgba(22,50,80,.06)}
  .status{display:flex;align-items:center;gap:10px;font-weight:1000;font-size:18px}
  .dot{width:11px;height:11px;border-radius:50%;background:#d8ac3c;box-shadow:0 0 0 5px rgba(216,172,60,.14)}
  .msg{margin-top:12px;font-size:14px;line-height:1.7;color:#52677d}
  .eta{margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:12px;background:#f5f8fb;border:1px solid #dfe7ef}
  .eta span{font-size:12px;font-weight:800;color:#6c7d8e}
  .eta strong{font-size:17px;color:#102b47}
  .small{margin-top:12px;padding-top:12px;border-top:1px solid #e7edf3;font-size:12px;line-height:1.6;color:#738397}
  .btn{margin-top:14px;width:100%;border:0;border-radius:12px;background:#0b2d52;color:#fff;font-weight:900;font-size:15px;padding:13px 16px}
  .ver{text-align:center;margin-top:10px;font-size:11px;color:#8997a7}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">
    <span class="badge">LOMITA POLICE</span>
    <h1>現在メンテナンス中です</h1>
    <p class="sub">研修管理システム</p>
  </div>

  <div class="card">
    <div class="status"><span class="dot"></span>システム利用を一時停止しています</div>
    <div class="msg">
      現在、システムメンテナンスのため一時的にご利用いただけません。<br>
      しばらくしてから再度お試しください。
    </div>
    <div class="eta">
      <span>終了予定</span>
      <strong>${nextResetLabel}</strong>
    </div>
    <div class="small">
      復旧を確認でき次第、通常画面へ戻ります。<br>
      この画面は約5分ごとに自動で再確認します。
    </div>
    <button class="btn" type="button" onclick="location.reload()">再確認する</button>
  </div>

  <div class="ver">Version ${HOTFIX_VERSION}</div>
</div>

<script>
  setTimeout(()=>location.reload(), 5*60*1000);
</script>
</body>
</html>`;
}

function maintenanceResponse(){
  return new Response(maintenanceHtml(), {
    status:503,
    headers:{
      "content-type":"text/html; charset=utf-8",
      "cache-control":"no-store, no-cache, must-revalidate",
      "retry-after":"300"
    }
  });
}
async function ensureIncidentLog(env){
  try{await env.DB.prepare(`CREATE TABLE IF NOT EXISTS incident_logs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();}catch(_){}
}
async function logIncident(env,kind,message){
  try{
    await ensureIncidentLog(env);
    await env.DB.prepare("INSERT INTO incident_logs(kind,message) VALUES(?,?)")
      .bind(String(kind||"system").slice(0,50),String(message||"").slice(0,500)).run();
  }catch(_){}
}
async function getIncidentList(env){
  await ensureIncidentLog(env);
  const q=await env.DB.prepare("SELECT id,kind,message,created_at FROM incident_logs ORDER BY id DESC LIMIT 30").all();
  return q?.results||[];
}
async function getOpsOverview(env){
  const reset=getNextD1ResetInfo();
  let today=0,pending=0,retake=0;
  try{
    const q=await env.DB.prepare(`SELECT
      SUM(CASE WHEN status='reserved' AND date(COALESCE(confirmed_date,preferred_date))=date('now','+9 hours') THEN 1 ELSE 0 END) today,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN status='retake' THEN 1 ELSE 0 END) retake
      FROM reservations`).first();
    today=Number(q?.today||0); pending=Number(q?.pending||0); retake=Number(q?.retake||0);
  }catch(err){ if(isD1QuotaError(err)) throw err; }
  return {today,pending,retake,...reset};
}
async function getBackupStatus(env){
  const token=String(env.GITHUB_TOKEN||env.GITHUB_PAT||"").trim();
  const repo=String(env.GITHUB_REPO||"yuuji0628/lomita-police-training-reservation").trim();
  if(!token)return {configured:false,label:"GitHub保存確認 未設定"};
  try{
    const r=await fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json","User-Agent":"lomita-training"}});
    if(!r.ok)return {configured:true,ok:false,label:"GitHub保存確認エラー"};
    const a=await r.json(); const c=Array.isArray(a)?a[0]:null;
    return {configured:true,ok:true,label:"GitHub最終保存",at:c?.commit?.committer?.date||"",sha:String(c?.sha||"").slice(0,7)};
  }catch(err){return {configured:true,ok:false,label:"GitHub保存確認エラー",detail:String(err?.message||err).slice(0,200)};}
}
async function sendHourlyDiscordSummary(env){
  const hook=String(env.DISCORD_TRAINING_WEBHOOK_URL||"").trim();
  if(!hook||!env?.DB)return {ok:false,skipped:"not_configured"};
  try{
    const o=await getOpsOverview(env);
    if(!(o.pending||o.retake||o.today))return {ok:true,skipped:"nothing"};
    const content='📋 研修管理まとめ\n本日の研修：'+o.today+'件\n承認待ち：'+o.pending+'件\n再受講：'+o.retake+'件';
    const r=await fetch(hook,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content})});
    if(!r.ok){await logIncident(env,"discord",`まとめ通知失敗 ${r.status}`);return {ok:false,status:r.status};}
    return {ok:true};
  }catch(err){await logIncident(env,"discord",String(err?.message||err));return {ok:false};}
}

function testRandomText(len=10){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const a=new Uint8Array(len);
  crypto.getRandomValues(a);
  let s="";
  for(let i=0;i<len;i++)s+=chars[a[i]%chars.length];
  return s;
}
async function testPasswordHash(password,salt){
  const data=new TextEncoder().encode("lomita-trainee:"+salt+":"+password);
  const digest=await crypto.subtle.digest("SHA-256",data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function ensureTestTraineeColumns(env){
  // Core側の trainee_profiles を前提にしつつ、不足列だけ安全に補完。
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS trainee_profiles(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    discord_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
    affiliation TEXT DEFAULT '',
    rank TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const q=await env.DB.prepare("PRAGMA table_info(trainee_profiles)").all();
  const cols=(q.results||[]).map(x=>String(x.name||"").toLowerCase());
  for(const [name,def] of [
    ["login_name","TEXT DEFAULT ''"],
    ["password_hash","TEXT DEFAULT ''"],
    ["password_salt","TEXT DEFAULT ''"],
    ["discord_user_id","TEXT DEFAULT ''"],
    ["admin_memo","TEXT DEFAULT ''"],
    ["all_completed_at","TEXT DEFAULT ''"]
  ]){
    if(!cols.includes(name)){
      try{await env.DB.prepare("ALTER TABLE trainee_profiles ADD COLUMN "+name+" "+def).run();}catch(_){}
    }
  }
}
async function createTestTrainee(env){
  await ensureTestTraineeColumns(env);

  // 同名の既存テストアカウントがある場合はそのまま返し、乱立を防止。
  const existing=await env.DB.prepare(
    "SELECT id,player_name,login_name,discord_id FROM trainee_profiles WHERE admin_memo LIKE '%[TEST]%' ORDER BY id DESC LIMIT 1"
  ).first();
  if(existing){
    return {
      ok:true,
      existing:true,
      id:existing.id,
      player_name:existing.player_name,
      login_name:existing.login_name,
      discord_id:existing.discord_id,
      note:"既存のテスト研修生を使用します。パスワード再発行が必要な場合は「パスワード再発行」を押してください。"
    };
  }

  const suffix=String(Date.now()).slice(-6);
  const login="test-"+suffix;
  const password="Test-"+testRandomText(10);
  const salt=testRandomText(24);
  const hash=await testPasswordHash(password,salt);
  const discord="TEST-"+suffix+"-"+testRandomText(5);

  const r=await env.DB.prepare(`
    INSERT INTO trainee_profiles(
      player_name,discord_id,affiliation,rank,login_name,password_hash,password_salt,
      discord_user_id,admin_memo,all_completed_at,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).bind(
    "テスト研修生",
    discord,
    "TEST",
    "TEST",
    login,
    hash,
    salt,
    "",
    "[TEST] 動作確認専用アカウント。実運用集計・通知対象外。",
    ""
  ).run();

  return {
    ok:true,
    existing:false,
    id:r?.meta?.last_row_id || null,
    player_name:"テスト研修生",
    login_name:login,
    password,
    discord_id:discord,
    test:true
  };
}
async function getTestTrainee(env){
  await ensureTestTraineeColumns(env);
  const r=await env.DB.prepare(`
    SELECT id,player_name,login_name,discord_id,created_at,updated_at
    FROM trainee_profiles
    WHERE admin_memo LIKE '%[TEST]%'
    ORDER BY id DESC LIMIT 1
  `).first();
  return r?{ok:true,found:true,...r}:{ok:true,found:false};
}
async function resetTestTrainee(env,id){
  await ensureTestTraineeColumns(env);
  const row=await env.DB.prepare(
    "SELECT id,discord_id FROM trainee_profiles WHERE id=? AND admin_memo LIKE '%[TEST]%' LIMIT 1"
  ).bind(Number(id)).first();
  if(!row)return {ok:false,error:"テスト研修生が見つかりません"};

  // TESTアカウントだけに限定して予約履歴をリセット。
  try{await env.DB.prepare("DELETE FROM reservations WHERE discord_id=?").bind(row.discord_id).run();}catch(_){}
  try{await env.DB.prepare("UPDATE trainee_profiles SET all_completed_at='', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();}catch(_){}
  return {ok:true};
}
async function reissueTestPassword(env,id){
  await ensureTestTraineeColumns(env);
  const row=await env.DB.prepare(
    "SELECT id FROM trainee_profiles WHERE id=? AND admin_memo LIKE '%[TEST]%' LIMIT 1"
  ).bind(Number(id)).first();
  if(!row)return {ok:false,error:"テスト研修生が見つかりません"};

  const password="Test-"+testRandomText(10);
  const salt=testRandomText(24);
  const hash=await testPasswordHash(password,salt);
  await env.DB.prepare(
    "UPDATE trainee_profiles SET password_hash=?,password_salt=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
  ).bind(hash,salt,row.id).run();
  return {ok:true,password};
}
async function deleteTestTrainee(env,id){
  await ensureTestTraineeColumns(env);
  const row=await env.DB.prepare(
    "SELECT id,discord_id FROM trainee_profiles WHERE id=? AND admin_memo LIKE '%[TEST]%' LIMIT 1"
  ).bind(Number(id)).first();
  if(!row)return {ok:false,error:"テスト研修生が見つかりません"};

  try{await env.DB.prepare("DELETE FROM reservations WHERE discord_id=?").bind(row.discord_id).run();}catch(_){}
  await env.DB.prepare("DELETE FROM trainee_profiles WHERE id=? AND admin_memo LIKE '%[TEST]%'").bind(row.id).run();
  return {ok:true};
}


function parseQuarterHourTime(v){
  const s=String(v||"").trim();
  const parts=s.split(":");
  if(parts.length<2)return null;
  const hh=Number(parts[0]);
  const mm=Number(parts[1]);
  const ss=parts.length>=3 ? Number(parts[2]||0) : 0;
  if(!Number.isInteger(hh)||!Number.isInteger(mm)||!Number.isInteger(ss))return null;
  if(hh<0||hh>23||![0,15,30,45].includes(mm)||ss!==0)return null;
  return {
    hh,mm,
    normalized:String(hh).padStart(2,"0")+":"+String(mm).padStart(2,"0")
  };
}
function isQuarterHourTime(v){
  return !!parseQuarterHourTime(v);
}
async function enforceQuarterHourReservationRequest(request){
  if(request.method!=="POST")return null;
  const url=new URL(request.url);
  if(!/reservation|reserve|booking|apply/i.test(url.pathname))return null;
  const ct=String(request.headers.get("content-type")||"").toLowerCase();
  if(!ct.includes("application/json"))return null;
  let body;
  try{body=await request.clone().json();}catch(_){return null;}
  if(!body||typeof body!=="object")return null;
  const keys=["preferred_time","preferred_time2","preferred_time3","confirmed_time","start_time","time"];
  let changed=false;
  for(const k of keys){
    if(body[k]===undefined||String(body[k]||"").trim()==="")continue;
    const parsed=parseQuarterHourTime(body[k]);
    if(!parsed){
      return json({error:"時刻は15分単位（00・15・30・45分）で選択してください"},400);
    }
    if(String(body[k])!==parsed.normalized){
      body[k]=parsed.normalized;
      changed=true;
    }
  }
  if(!changed)return null;

  const headers=new Headers(request.headers);
  headers.set("content-type","application/json");
  headers.delete("content-length");
  const normalizedRequest=new Request(request.url,{
    method:request.method,
    headers,
    body:JSON.stringify(body),
    redirect:request.redirect
  });
  return {normalizedRequest};
}

async function ensureTrainingDurations(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS training_durations(
    training_id INTEGER PRIMARY KEY,
    training_title TEXT NOT NULL DEFAULT '',
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}
async function listTrainingDurations(env){
  await ensureTrainingDurations(env);
  let programs=[];
  try{
    const q=await env.DB.prepare(`
      SELECT training_id, title
      FROM training_programs
      WHERE COALESCE(active,1)=1
      ORDER BY training_id
    `).all();
    programs=q?.results||[];
  }catch(_){
    try{
      const q=await env.DB.prepare(`
        SELECT id AS training_id, title
        FROM training_programs
        ORDER BY id
      `).all();
      programs=q?.results||[];
    }catch(__){}
  }
  const d=await env.DB.prepare(
    "SELECT training_id,training_title,duration_minutes,updated_at FROM training_durations"
  ).all();
  const map=new Map((d?.results||[]).map(x=>[Number(x.training_id),x]));
  return programs.map(p=>{
    const id=Number(p.training_id||p.id||0);
    const row=map.get(id);
    return {
      training_id:id,
      title:String(p.title||row?.training_title||("研修 "+id)),
      duration_minutes:Math.max(15,Number(row?.duration_minutes||30))
    };
  });
}
async function saveTrainingDuration(env,b){
  await ensureTrainingDurations(env);
  const trainingId=Number(b?.training_id||0);
  const title=String(b?.training_title||"").trim();
  let mins=Number(b?.duration_minutes||0);
  if(!trainingId)return {ok:false,error:"研修を選択してください"};
  if(!Number.isFinite(mins)||mins<15||mins>480||mins%15!==0){
    return {ok:false,error:"所要時間は15分単位・15〜480分で設定してください"};
  }
  await env.DB.prepare(`
    INSERT INTO training_durations(training_id,training_title,duration_minutes,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(training_id) DO UPDATE SET
      training_title=excluded.training_title,
      duration_minutes=excluded.duration_minutes,
      updated_at=CURRENT_TIMESTAMP
  `).bind(trainingId,title,mins).run();
  return {ok:true,training_id:trainingId,duration_minutes:mins};
}
async function getTrainingDurationByTitle(env,title){
  await ensureTrainingDurations(env);
  title=String(title||"").trim();
  if(!title)return {duration_minutes:30};
  const row=await env.DB.prepare(`
    SELECT duration_minutes,training_id,training_title
    FROM training_durations
    WHERE trim(training_title)=trim(?)
       OR instr(trim(?),trim(training_title))>0
       OR instr(trim(training_title),trim(?))>0
    ORDER BY length(training_title) DESC
    LIMIT 1
  `).bind(title,title,title).first();
  if(row)return {duration_minutes:Math.max(15,Number(row.duration_minutes||60)),training_id:Number(row.training_id||0),training_title:String(row.training_title||title)};

  // 未設定なら training_programs をタイトルで照合し、既定60分。
  try{
    const p=await env.DB.prepare(`
      SELECT training_id,title FROM training_programs
      WHERE trim(title)=trim(?) OR instr(trim(?),trim(title))>0 OR instr(trim(title),trim(?))>0
      ORDER BY length(title) DESC LIMIT 1
    `).bind(title,title,title).first();
    if(p)return {duration_minutes:60,training_id:Number(p.training_id||0),training_title:String(p.title||title)};
  }catch(_){}
  return {duration_minutes:30,training_title:title};
}
async function ensureInstructorAvailability(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS instructor_availability(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instructor_id INTEGER NOT NULL DEFAULT 0,
    instructor_name TEXT NOT NULL DEFAULT '',
    available_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  try{await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_instructor_availability_date ON instructor_availability(available_date,instructor_name)").run();}catch(_){}
}
async function listInstructorAvailability(env){
  await ensureInstructorAvailability(env);
  const i=await env.DB.prepare("SELECT id,name FROM instructors ORDER BY name COLLATE NOCASE").all().catch(()=>({results:[]}));
  const a=await env.DB.prepare(`
    SELECT id,instructor_id,instructor_name,available_date,start_time,end_time,note,created_at
    FROM instructor_availability
    WHERE available_date>=date('now','+9 hours')
    ORDER BY available_date,start_time,instructor_name
    LIMIT 120
  `).all();
  return {instructors:i?.results||[],availability:a?.results||[]};
}
async function saveInstructorAvailability(env,b){
  await ensureInstructorAvailability(env);
  const instructorId=Number(b?.instructor_id||0);
  const name=String(b?.instructor_name||"").trim();
  const date=String(b?.available_date||"").trim();
  const startParsed=parseQuarterHourTime(b?.start_time);
  const rawEnd=String(b?.end_time||"").trim();
  const endParsed=rawEnd==="24:00"?null:parseQuarterHourTime(rawEnd);
  const start=startParsed?.normalized||String(b?.start_time||"").trim();
  const end=rawEnd==="24:00"?"24:00":(endParsed?.normalized||rawEnd);
  const note=String(b?.note||"").trim().slice(0,200);
  if(!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)){
    return {ok:false,error:"教官・日付・開始/終了時刻を入力してください"};
  }
  if(!isQuarterHourTime(start)||!(isQuarterHourTime(end)||end==="24:00")){
    return {ok:false,error:"開始時刻・終了時刻は15分単位で登録してください"};
  }
  if(start==="24:00"||start>=end)return {ok:false,error:"終了時刻は開始時刻より後にしてください"};
  const r=await env.DB.prepare(`
    INSERT INTO instructor_availability(instructor_id,instructor_name,available_date,start_time,end_time,note)
    VALUES(?,?,?,?,?,?)
  `).bind(instructorId,name,date,start,end,note).run();
  return {ok:true,id:r?.meta?.last_row_id||null};
}
async function deleteInstructorAvailability(env,id){
  await ensureInstructorAvailability(env);
  await env.DB.prepare("DELETE FROM instructor_availability WHERE id=?").bind(Number(id||0)).run();
  return {ok:true};
}

async function ensureDeadlineExtensions(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS trainee_deadline_extensions(
    profile_id INTEGER PRIMARY KEY,
    extra_days INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}
async function listDeadlineExtensions(env){
  await ensureDeadlineExtensions(env);
  const q=await env.DB.prepare(`
    SELECT p.id,p.player_name,p.discord_id,p.login_name,
           COALESCE(e.extra_days,0) extra_days,
           COALESCE(e.reason,'') reason,
           COALESCE(e.updated_at,'') extension_updated_at
    FROM trainee_profiles p
    LEFT JOIN trainee_deadline_extensions e ON e.profile_id=p.id
    ORDER BY p.player_name COLLATE NOCASE
    LIMIT 300
  `).all();
  return q?.results||[];
}
async function setDeadlineExtension(env,b){
  await ensureDeadlineExtensions(env);
  const profileId=Number(b?.profile_id||0);
  const extraDays=Math.max(0,Math.min(90,Number(b?.extra_days||0)));
  const reason=String(b?.reason||"").trim().slice(0,300);
  const p=await env.DB.prepare("SELECT id,player_name FROM trainee_profiles WHERE id=? LIMIT 1").bind(profileId).first();
  if(!p)return {ok:false,error:"研修生が見つかりません"};
  if(extraDays===0){
    await env.DB.prepare("DELETE FROM trainee_deadline_extensions WHERE profile_id=?").bind(profileId).run();
    return {ok:true,player_name:p.player_name,extra_days:0};
  }
  await env.DB.prepare(`
    INSERT INTO trainee_deadline_extensions(profile_id,extra_days,reason,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(profile_id) DO UPDATE SET
      extra_days=excluded.extra_days,
      reason=excluded.reason,
      updated_at=CURRENT_TIMESTAMP
  `).bind(profileId,extraDays,reason).run();
  return {ok:true,player_name:p.player_name,extra_days:extraDays};
}

function addDaysToYmd(ymd,days){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd||"")) || !days)return ymd;
  const [y,m,d]=String(ymd).split("-").map(Number);
  const dt=new Date(Date.UTC(y,m-1,d));
  dt.setUTCDate(dt.getUTCDate()+Number(days));
  return dt.toISOString().slice(0,10);
}

/*
  Coreの30日期限計算は「オリエンテーション/最初の修了日」を開始日にする。
  このProxyは、その開始日SELECTの結果だけに管理者が設定した延長日数を加える。
  そのため表示だけでなく、自動期限リセット判定にも同じ延長が効く。
*/
function envWithDeadlineExtensions(env){
  if(!env?.DB)return env;
  const originalDB=env.DB;
  const dbProxy=new Proxy(originalDB,{
    get(target,prop,receiver){
      if(prop!=="prepare")return Reflect.get(target,prop,receiver);
      return function(sql){
        const prepared=target.prepare(sql);
        const deadlineStartQuery=
          String(sql).includes("SELECT substr(COALESCE(NULLIF(completed_at,''),confirmed_date),1,10) d") &&
          String(sql).includes("FROM reservations");
        if(!deadlineStartQuery)return prepared;

        let bound=[];
        let activeStmt=prepared;
        const wrapper={
          bind(...args){
            bound=args;
            activeStmt=prepared.bind(...args);
            return wrapper;
          },
          async first(...args){
            const row=await activeStmt.first(...args);
            if(!row?.d)return row;
            try{
              await ensureDeadlineExtensions(env);
              const key=String(bound[bound.length-1]||"").trim();
              if(!key)return row;
              const p=await originalDB.prepare(`
                SELECT id FROM trainee_profiles
                WHERE lower(trim(COALESCE(discord_id,'')))=lower(trim(?))
                   OR lower(trim(COALESCE(login_name,'')))=lower(trim(?))
                   OR lower(trim(COALESCE(player_name,'')))=lower(trim(?))
                LIMIT 1
              `).bind(key,key,key).first();
              if(!p?.id)return row;
              const e=await originalDB.prepare(
                "SELECT extra_days FROM trainee_deadline_extensions WHERE profile_id=? LIMIT 1"
              ).bind(Number(p.id)).first();
              const days=Math.max(0,Number(e?.extra_days||0));
              if(days>0)return {...row,d:addDaysToYmd(row.d,days),_deadline_extension_days:days};
            }catch(_){}
            return row;
          },
          all:(...args)=>activeStmt.all(...args),
          run:(...args)=>activeStmt.run(...args),
          raw:(...args)=>activeStmt.raw(...args)
        };
        return wrapper;
      };
    }
  });
  return {...env,DB:dbProxy};
}
const CACHEABLE_ADMIN_GETS = new Set([
  "/api/admin/stats",
  "/api/admin/trainees",
  "/api/admin/surveys"
]);

async function fetchWithShortCache(request, env, ctx){
  const url = new URL(request.url);
  if(request.method !== "GET" || !CACHEABLE_ADMIN_GETS.has(url.pathname)){
    return core.fetch(request, envWithDeadlineExtensions(env), ctx);
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, {method:"GET", headers:request.headers});
  const hit = await cache.match(cacheKey);
  if(hit) return hit;

  const res = await core.fetch(request, env, ctx);
  if(res.ok){
    const headers = new Headers(res.headers);
    headers.set("cache-control","private, max-age=60");
    const cached = new Response(res.clone().body, {
      status:res.status,
      statusText:res.statusText,
      headers
    });
    ctx.waitUntil(cache.put(cacheKey, cached.clone()));
    return cached;
  }
  return res;
}

async function fetch(request, env, ctx){
  const quarterCheck=await enforceQuarterHourReservationRequest(request);
  if(quarterCheck instanceof Response)return quarterCheck;
  if(quarterCheck?.normalizedRequest)request=quarterCheck.normalizedRequest;
  const requestUrl = new URL(request.url);
  const accept = String(request.headers.get("accept") || "").toLowerCase();
  const isDocumentRequest =
    request.method === "GET" &&
    !requestUrl.pathname.startsWith("/api/") &&
    (accept.includes("text/html") || requestUrl.pathname === "/" || !requestUrl.pathname.includes("."));

  if(isDocumentRequest){
    const exhausted = await isD1ReadQuotaExhausted(env);
    if(exhausted){
      return maintenanceResponse();
    }
  }

  const url = new URL(request.url);





  if(url.pathname === "/api/trainee/instructor-availability" && request.method === "GET"){
    try{
      await ensureInstructorAvailability(env);
      const q=await env.DB.prepare(`
        SELECT id,instructor_id,instructor_name,available_date,start_time,end_time,note
        FROM instructor_availability
        ORDER BY available_date,start_time,instructor_name
        LIMIT 200
      `).all();

      const nowJst=new Date(Date.now()+9*60*60*1000);
      const today=nowJst.toISOString().slice(0,10);
      const nowHm=String(nowJst.getUTCHours()).padStart(2,"0")+":"+String(nowJst.getUTCMinutes()).padStart(2,"0");

      const rows=(q?.results||[]).filter(x=>{
        const d=String(x.available_date||"");
        const s=String(x.start_time||"");
        const e=String(x.end_time||"");
        if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;
        if(!isQuarterHourTime(s)||!(isQuarterHourTime(e)||e==="24:00"))return false;
        if(d<today)return false;
        if(d===today && e<=nowHm)return false;
        return true;
      });

      return json({availability:rows,today_jst:today,now_jst:nowHm});
    }catch(err){
      return json({availability:[],error:String(err?.message||err)},200);
    }
  }


  if(url.pathname === "/api/admin/training-durations" && request.method === "GET"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{return json(await listTrainingDurations(env));}
    catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/admin/training-durations" && request.method === "POST"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{return json(await saveTrainingDuration(env,await request.json().catch(()=>({}))));}
    catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/trainee/training-duration" && request.method === "GET"){
    try{
      return json(await getTrainingDurationByTitle(env,url.searchParams.get("title")||""));
    }catch(err){return json({duration_minutes:30,error:String(err?.message||err)},200);}
  }
  if(url.pathname === "/api/admin/instructor-availability" && request.method === "GET"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{return json(await listInstructorAvailability(env));}
    catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/admin/instructor-availability" && request.method === "POST"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{return json(await saveInstructorAvailability(env,await request.json().catch(()=>({}))));}
    catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/admin/instructor-availability/delete" && request.method === "POST"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{const b=await request.json().catch(()=>({}));return json(await deleteInstructorAvailability(env,b.id));}
    catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/admin/deadline-extensions" && request.method === "GET"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{return json(await listDeadlineExtensions(env));}
    catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/admin/deadline-extensions" && request.method === "POST"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{return json(await setDeadlineExtension(env,await request.json().catch(()=>({}))));}
    catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/admin/test-trainee" && request.method === "GET"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{return json(await getTestTrainee(env));}
    catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/admin/test-trainee/create" && request.method === "POST"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{return json(await createTestTrainee(env));}
    catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/admin/test-trainee/reset" && request.method === "POST"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{
      const b=await request.json().catch(()=>({}));
      return json(await resetTestTrainee(env,b.id));
    }catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/admin/test-trainee/reissue-password" && request.method === "POST"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{
      const b=await request.json().catch(()=>({}));
      return json(await reissueTestPassword(env,b.id));
    }catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/admin/test-trainee/delete" && request.method === "POST"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{
      const b=await request.json().catch(()=>({}));
      return json(await deleteTestTrainee(env,b.id));
    }catch(err){return json({error:String(err?.message||err)},500);}
  }
  if(url.pathname === "/api/admin/ops-overview" && request.method === "GET"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{return json(await getOpsOverview(env));}catch(err){await logIncident(env,"d1",String(err?.message||err));return json({error:"現在メンテナンス中です"},503);}
  }
  if(url.pathname === "/api/admin/incidents" && request.method === "GET"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    try{return json(await getIncidentList(env));}catch(err){return json({error:"障害ログを取得できませんでした"},500);}
  }
  if(url.pathname === "/api/admin/backup-status" && request.method === "GET"){
    if(!(await verifyAdmin(request,env,ctx)))return json({error:"unauthorized"},401);
    return json(await getBackupStatus(env));
  }
  if(url.pathname === "/api/admin/d1-status" && request.method === "GET"){
    try{
      const authed = await verifyAdmin(request, env, ctx);
      if(!authed) return json({error:"unauthorized"},401);
      return json(await getD1Status(env));
    }catch(err){
      return json({
        ok:false,
        status:"error",
        label:"確認エラー",
        message:String(err?.message || err || "UNKNOWN_ERROR").slice(0,300),
        ...getNextD1ResetInfo()
      },500);
    }
  }


  if(url.pathname !== "/api/admin/reservation-control" || request.method !== "GET"){
    const response = await fetchWithShortCache(request, env, ctx);
    return syncDisplayedVersion(response);
  }

  /*
    D1節約版:
    予約一覧は既存coreを通さず、必要な件数だけ直接取得。
    runExpiredPendingReservations / ensure系の連続実行を避ける。
  */
  try{
    return await safeReservationList(request, env, ctx);
  }catch(err){
    console.error("reservation-control v2.09 saver failed", err);
    const detail = String(err?.message || err || "UNKNOWN_ERROR").slice(0, 800);
    return json({
      error: "【診断:UNHANDLED】 " + detail,
      stage: "UNHANDLED",
      detail,
      version: HOTFIX_VERSION
    }, 500);
  }
}

async function scheduled(event, env, ctx){
  ctx.waitUntil(sendHourlyDiscordSummary(env));
  if(typeof core.scheduled === "function"){
    return core.scheduled(event, envWithDeadlineExtensions(env), ctx);
  }
}

export default { fetch, scheduled };