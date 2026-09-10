import core from "./worker.js";

/*
  Version 2.08 reservation-control diagnostic wrapper

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

const HOTFIX_VERSION = "2.08";

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

async function safeReservationList(request, env, ctx){
  const fail = (stage, detail, status = 500) => json({
    error: `【診断:${stage}】 ${String(detail || "不明なエラー").slice(0, 700)}`,
    stage,
    detail: String(detail || "").slice(0, 700),
    version: HOTFIX_VERSION
  }, status);

  // 1) DB binding
  if(!env?.DB){
    return fail("DB_BINDING", "DB binding が見つかりません");
  }

  // 2) Admin auth
  try{
    const authed = await verifyAdmin(request, env, ctx);
    if(!authed){
      return fail("ADMIN_AUTH", "管理者認証に失敗しました", 401);
    }
  }catch(err){
    return fail("ADMIN_AUTH_CHECK", err?.message || err);
  }

  // 3) reservations 単体テスト
  let basicRows = [];
  try{
    const basic = await env.DB.prepare(`
      SELECT *
      FROM reservations
      ORDER BY id DESC
      LIMIT 300
    `).all();
    basicRows = Array.isArray(basic?.results) ? basic.results : [];
  }catch(err){
    return fail("RESERVATIONS_READ", err?.message || err);
  }

  // 4) trainings JOIN テスト
  try{
    const joined = await env.DB.prepare(`
      SELECT
        r.*,
        COALESCE(t.title,'研修') AS title,
        COALESCE(t.training_date,'') AS training_date,
        COALESCE(t.start_time,'') AS start_time,
        COALESCE(t.instructor,'') AS instructor
      FROM reservations r
      LEFT JOIN trainings t ON t.id = r.training_id
      WHERE COALESCE(r.status,'') IN (
        'pending','reserved','completed','retake','absent','expired'
      )
      ORDER BY
        CASE COALESCE(r.status,'')
          WHEN 'pending' THEN 0
          WHEN 'reserved' THEN 1
          WHEN 'retake' THEN 2
          WHEN 'completed' THEN 3
          WHEN 'absent' THEN 4
          ELSE 5
        END,
        r.id DESC
      LIMIT 300
    `).all();

    const rows = Array.isArray(joined?.results) ? joined.results : [];

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
      _diagnostic_source: "joined"
    })));
  }catch(joinErr){
    // 5) JOIN だけ失敗した場合は reservations 単体で返す
    try{
      const rows = basicRows
        .filter(x => ['pending','reserved','completed','retake','absent','expired']
          .includes(String(x.status || '')))
        .map(x => ({
          ...x,
          title: String(x.title || "研修"),
          training_date: String(x.training_date || ""),
          start_time: String(x.start_time || ""),
          instructor: String(x.instructor || ""),
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
          _diagnostic_source: "reservations_only",
          _diagnostic_warning: `JOIN失敗: ${String(joinErr?.message || joinErr).slice(0,300)}`
        }));

      if(rows.length){
        return json(rows);
      }

      return fail(
        "TRAININGS_JOIN",
        `reservations は読めました（${basicRows.length}件）が、JOINに失敗しました: ${joinErr?.message || joinErr}`
      );
    }catch(fallbackErr){
      return fail(
        "FALLBACK_NORMALIZE",
        `${joinErr?.message || joinErr} / fallback: ${fallbackErr?.message || fallbackErr}`
      );
    }
  }
}

async function fetch(request, env, ctx){
  const url = new URL(request.url);

  if(url.pathname !== "/api/admin/reservation-control" || request.method !== "GET"){
    const response = await core.fetch(request, env, ctx);
    return syncDisplayedVersion(response);
  }

  /*
    まず既存処理を使う。
    成功していれば従来機能をそのまま維持。
  */
  try{
    const original = await core.fetch(request, env, ctx);

    if(original.status < 500){
      return syncDisplayedVersion(original);
    }

    console.error(
      "reservation-control primary failed; switching to v2.08 diagnostic fallback",
      original.status
    );
  }catch(err){
    console.error("reservation-control primary exception", err);
  }

  /*
    既存処理の自動期限処理・スキーマ補完が失敗しても
    予約一覧だけは読み取り専用で表示する。
  */
  try{
    return await safeReservationList(request, env, ctx);
  }catch(err){
    console.error("reservation-control v2.08 diagnostic fallback failed", err);
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
