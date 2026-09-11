import core from "./worker.js";

/*
  Version 2.09 D1 usage saver wrapper

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

const HOTFIX_VERSION = "2.09";

async function syncDisplayedVersion(response){
  try{
    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if(!type.includes("text/html")) return response;

    const body = await response.text();
    const replaced = body
      .replace(/Version\s+2\.04/g, "Version " + HOTFIX_VERSION)
      .replace(/Version\s+2\.05/g, "Version " + HOTFIX_VERSION)
      .replace(/Version\s+2\.06/g, "Version " + HOTFIX_VERSION);

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
    return fail("D1_SAVER_READ", err?.message || err);
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
  const url = new URL(request.url);

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
