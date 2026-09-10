import core from "./worker.js";

/*
  Version 2.05 reservation-control recovery wrapper

  Purpose:
  - Preserve the existing Version 2.04 worker.js unchanged.
  - Delegate every normal route to worker.js.
  - For /api/admin/reservation-control only:
      1) Try the existing handler first.
      2) If it fails with 5xx, return a safe read-only fallback list.
  - The fallback never deletes or resets reservation data.
*/

const j = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

function qident(name){
  return '"' + String(name || "").replace(/"/g, '""') + '"';
}

async function tableColumns(env, table){
  const result = await env.DB.prepare(`PRAGMA table_info(${qident(table)})`).all();
  return new Set((result.results || []).map(x => String(x.name || "")));
}

function col(cols, alias, name, fallback = "''"){
  return cols.has(name) ? `${alias}.${qident(name)}` : fallback;
}

async function verifyAdminWithCore(request, env, ctx){
  const u = new URL(request.url);
  u.pathname = "/api/admin/instructors";
  u.search = "";
  const probe = new Request(u.toString(), {
    method: "GET",
    headers: request.headers
  });
  const res = await core.fetch(probe, env, ctx);
  return res.status !== 401 && res.status !== 403;
}

async function fallbackReservationControl(request, env, ctx){
  if(!env.DB) return j({error:"DB binding が見つかりません"}, 500);

  const authed = await verifyAdminWithCore(request, env, ctx);
  if(!authed) return j({error:"unauthorized"}, 401);

  const rcols = await tableColumns(env, "reservations");
  const tcols = await tableColumns(env, "trainings");

  const fields = [
    `${col(rcols,"r","id","0")} AS id`,
    `${col(rcols,"r","training_id","0")} AS training_id`,
    `${col(rcols,"r","player_name")} AS player_name`,
    `${col(rcols,"r","discord_id")} AS discord_id`,
    `${col(rcols,"r","affiliation")} AS affiliation`,
    `${col(rcols,"r","note")} AS note`,
    `${col(rcols,"r","status")} AS status`,
    `${col(rcols,"r","assigned_instructor")} AS assigned_instructor`,
    `${col(rcols,"r","preferred_date")} AS preferred_date`,
    `${col(rcols,"r","preferred_time")} AS preferred_time`,
    `${col(rcols,"r","preferred_date2")} AS preferred_date2`,
    `${col(rcols,"r","preferred_time2")} AS preferred_time2`,
    `${col(rcols,"r","preferred_date3")} AS preferred_date3`,
    `${col(rcols,"r","preferred_time3")} AS preferred_time3`,
    `${col(rcols,"r","confirmed_date")} AS confirmed_date`,
    `${col(rcols,"r","confirmed_time")} AS confirmed_time`,
    `${col(rcols,"r","confirmed_preference","0")} AS confirmed_preference`,
    `${col(rcols,"r","exam_result")} AS exam_result`,
    `${col(rcols,"r","exam_score","NULL")} AS exam_score`,
    `${col(rcols,"r","created_at")} AS created_at`,
    `${col(tcols,"t","title","'研修'")} AS title`,
    `${col(tcols,"t","training_date")} AS training_date`,
    `${col(tcols,"t","start_time")} AS start_time`,
    `${col(tcols,"t","instructor")} AS instructor`
  ];

  const hasStatus = rcols.has("status");
  const statusFilter = hasStatus
    ? `WHERE r.status IN ('pending','reserved','completed','retake','absent','expired')`
    : "";

  const order = rcols.has("id") ? "ORDER BY r.id DESC" : "";

  const sql = `
    SELECT ${fields.join(",\n           ")}
    FROM reservations r
    LEFT JOIN trainings t ON t.id = r.training_id
    ${statusFilter}
    ${order}
  `;

  const result = await env.DB.prepare(sql).all();

  return j(result.results || [], 200);
}

async function fetch(request, env, ctx){
  const url = new URL(request.url);

  if(url.pathname !== "/api/admin/reservation-control" || request.method !== "GET"){
    return core.fetch(request, env, ctx);
  }

  let original;
  try{
    original = await core.fetch(request, env, ctx);

    // Authentication/client errors should be preserved exactly.
    if(original.status < 500) return original;

    console.error("reservation-control primary handler failed", original.status);
  }catch(err){
    console.error("reservation-control primary handler exception", err);
  }

  try{
    return await fallbackReservationControl(request, env, ctx);
  }catch(err){
    console.error("reservation-control fallback failed", err);
    return j({
      error: "予約一覧の復旧取得にも失敗しました",
      detail: String(err?.message || err || "UNKNOWN_ERROR").slice(0, 500)
    }, 500);
  }
}

async function scheduled(event, env, ctx){
  if(typeof core.scheduled === "function"){
    return core.scheduled(event, env, ctx);
  }
}

export default { fetch, scheduled };
