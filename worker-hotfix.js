import core from "./worker.js";

/*
  Version 2.07 reservation-control recovery wrapper

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

const HOTFIX_VERSION = "2.07";

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
  if(!env?.DB){
    return json({
      error: "予約一覧の復旧取得にも失敗しました",
      detail: "DB binding が見つかりません"
    }, 500);
  }

  const authed = await verifyAdmin(request, env, ctx);
  if(!authed){
    return json({error:"unauthorized"}, 401);
  }

  /*
    r.* を使うことで、追加カラムの有無に依存しない。
    trainings 側は以前から存在する基本項目だけを取得。
    LEFT JOIN のため、研修マスタ側に不整合があっても予約自体は返す。
  */
  const result = await env.DB.prepare(`
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
  `).all();

  const rows = Array.isArray(result?.results) ? result.results : [];

  /*
    UI が期待する新しめの項目がDBに無い場合でも
    undefined のままにせず安全な既定値を補う。
  */
  const normalized = rows.map(x => ({
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
    exam_score: x.exam_score ?? null
  }));

  return json(normalized);
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
      "reservation-control primary failed; switching to v2.07 safe fallback",
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
    console.error("reservation-control v2.07 fallback failed", err);
    return json({
      error: "予約一覧の復旧取得にも失敗しました",
      detail: String(err?.message || err || "UNKNOWN_ERROR").slice(0, 800)
    }, 500);
  }
}

async function scheduled(event, env, ctx){
  if(typeof core.scheduled === "function"){
    return core.scheduled(event, env, ctx);
  }
}

export default { fetch, scheduled };
