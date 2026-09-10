import core from "./worker.js";

/*
  Version 2.13 D1 status wrapper

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

const HOTFIX_VERSION = "2.13";

async function syncDisplayedVersion(response){
  try{
    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if(!type.includes("text/html")) return response;

    const body = await response.text();
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

    const d1Widget = `
<style>
#d1StatusMini{
  position:fixed;right:10px;top:10px;z-index:9998;
  display:none;align-items:center;gap:6px;
  max-width:220px;padding:6px 9px;border-radius:999px;
  background:rgba(255,255,255,.95);
  border:1px solid #d7e1eb;
  box-shadow:0 4px 14px rgba(20,45,70,.10);
  font:700 10px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;
  color:#41566c;
  backdrop-filter:blur(10px);
}
#d1StatusMini .dot{width:7px;height:7px;border-radius:50%;background:#2f9b5e}
#d1StatusMini.warn{border-color:#e0b649;color:#7f5c00}
#d1StatusMini.warn .dot{background:#d7a400}
#d1StatusMini.err{border-color:#df8a81;color:#922e26}
#d1StatusMini.err .dot{background:#c84034}
</style>
<div id="d1StatusMini"><span class="dot"></span><span id="d1StatusMiniText">D1確認中</span></div>
<script>
(async()=>{
  const box=document.getElementById("d1StatusMini");
  const text=document.getElementById("d1StatusMiniText");
  if(!box||!text)return;
  try{
    const r=await fetch("/api/admin/d1-status",{credentials:"same-origin",cache:"no-store"});
    if(r.status===401)return;
    const d=await r.json().catch(()=>({}));
    box.style.display="flex";
    box.classList.remove("warn","err");
    if(d.status==="maintenance")box.classList.add("warn");
    if(d.status==="error")box.classList.add("err");
    text.textContent=
      d.status==="normal"
        ? "D1 正常 ｜ 次回 "+(d.reset_at_jst||"09:00")
        : d.status==="maintenance"
        ? "メンテナンス中 ｜ "+(d.remaining_label||"")
        : "D1 確認エラー";
  }catch(_){}
})();
</script>`;

    if(replaced.includes("</body>")){
      replaced = replaced.replace("</body>", d1Widget + "</body>");
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
    const active = await env.DB.prepare(`
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
      WHERE r.status IN ('pending','reserved','retake','absent','expired')
      ORDER BY r.id DESC
      LIMIT 80
    `).all();

    // 受講済み履歴は直近だけ。既存UIは履歴表示が長すぎない方針なので20件で十分。
    const completed = await env.DB.prepare(`
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
      WHERE r.status='completed'
      ORDER BY r.id DESC
      LIMIT 20
    `).all();

    const rows = [
      ...(Array.isArray(active?.results) ? active.results : []),
      ...(Array.isArray(completed?.results) ? completed.results : [])
    ];

    return json(rows.map(x => ({
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
    })));
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



function isD1QuotaError(err){
  const s = String(err?.message || err || "").toLowerCase();
  return (
    s.includes("exceeded d1's free tier daily row read limit") ||
    s.includes("daily row read limit") ||
    s.includes("upgrade to a paid plan or wait until tomorrow") ||
    (s.includes("d1_error") && s.includes("row read"))
  );
}

async function isD1ReadQuotaExhausted(env){
  if(!env?.DB) return false;
  try{
    // 1行だけ読む軽量確認。通常時のD1消費を最小限にする。
    await env.DB.prepare("SELECT id FROM reservations ORDER BY id DESC LIMIT 1").first();
    return false;
  }catch(err){
    if(isD1QuotaError(err)) return true;
    // D1上限以外の障害は通常エラー処理に任せる。
    return false;
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


function getNextD1ResetInfo(){
  const now = new Date();

  // D1 daily limits reset at 00:00 UTC = 09:00 JST.
  let resetUtc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0
  ));
  if(resetUtc.getTime() <= now.getTime()){
    resetUtc = new Date(resetUtc.getTime() + 24*60*60*1000);
  }

  const jst = new Date(resetUtc.getTime() + 9*60*60*1000);
  const mm = String(jst.getUTCMonth()+1).padStart(2,"0");
  const dd = String(jst.getUTCDate()).padStart(2,"0");
  const hh = String(jst.getUTCHours()).padStart(2,"0");
  const mi = String(jst.getUTCMinutes()).padStart(2,"0");

  const remainingMs = Math.max(0, resetUtc.getTime() - now.getTime());
  const totalMinutes = Math.ceil(remainingMs/60000);
  const hours = Math.floor(totalMinutes/60);
  const minutes = totalMinutes%60;

  return {
    reset_at_jst: `${mm}/${dd} ${hh}:${mi}`,
    remaining_minutes: totalMinutes,
    remaining_label: `${hours}時間${minutes}分`
  };
}

async function getD1Status(env){
  const reset = getNextD1ResetInfo();

  if(!env?.DB){
    return {
      ok:false,
      status:"error",
      label:"接続エラー",
      message:"DB binding が見つかりません",
      ...reset
    };
  }

  try{
    // 1行だけ読む軽量ヘルスチェック。
    await env.DB.prepare("SELECT id FROM reservations ORDER BY id DESC LIMIT 1").first();
    return {
      ok:true,
      status:"normal",
      label:"正常",
      message:"D1は正常に利用できます",
      ...reset
    };
  }catch(err){
    if(isD1QuotaError(err)){
      return {
        ok:false,
        status:"maintenance",
        label:"メンテナンス中",
        message:"現在メンテナンス中です",
        ...reset
      };
    }
    return {
      ok:false,
      status:"error",
      label:"確認エラー",
      message:String(err?.message || err || "UNKNOWN_ERROR").slice(0,300),
      ...reset
    };
  }
}

const CACHEABLE_ADMIN_GETS = new Set([
  "/api/admin/stats",
  "/api/admin/trainees",
  "/api/admin/surveys"
]);

async function fetchWithShortCache(request, env, ctx){
  const url = new URL(request.url);
  if(request.method !== "GET" || !CACHEABLE_ADMIN_GETS.has(url.pathname)){
    return core.fetch(request, env, ctx);
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
  if(typeof core.scheduled === "function"){
    return core.scheduled(event, env, ctx);
  }
}

export default { fetch, scheduled };
