import core from "./worker.js";

/*
  Version 2.17 test trainee wrapper

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

const HOTFIX_VERSION = "2.17";

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
#d1StatusInline{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  margin:8px 0 10px;padding:7px 10px;border-radius:12px;
  background:#fff;border:1px solid #d8e2ec;
  box-shadow:0 3px 10px rgba(20,45,70,.05);
  font:800 10px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;
  color:#53667a
}
#d1StatusInline .left{display:flex;align-items:center;gap:6px;min-width:0}
#d1StatusInline .dot{width:7px;height:7px;border-radius:50%;background:#2f9b5e;flex:0 0 auto}
#d1StatusInline .label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#d1StatusInline .reset{color:#8090a1;white-space:nowrap}
#d1StatusInline.warn{border-color:#e1bd5d;background:#fffdf4;color:#7a5a00}
#d1StatusInline.warn .dot{background:#d3a100}
#d1StatusInline.err{border-color:#df9d95;background:#fff8f7;color:#8f3028}
#d1StatusInline.err .dot{background:#c64035}

/* v2.14 管理メニューをコンパクト化 */
#adminToolsSection,
.adminToolsSection,
#adminMenuSection{
  padding:10px !important;
}
#adminToolsSection .card,
.adminToolsSection .card,
#adminMenuSection .card{
  padding:10px !important;
  margin-top:8px !important;
  border-radius:12px !important;
}
#adminToolsSection h2,
#adminToolsSection .title,
.adminToolsSection h2,
.adminToolsSection .title,
#adminMenuSection h2,
#adminMenuSection .title{
  margin:0 0 4px !important;
  font-size:17px !important;
  line-height:1.15 !important;
}
#adminToolsSection .sub,
.adminToolsSection .sub,
#adminMenuSection .sub{
  font-size:10px !important;
  line-height:1.35 !important;
}
#adminToolsSection textarea,
.adminToolsSection textarea,
#adminMenuSection textarea{
  min-height:110px !important;
  max-height:160px !important;
  height:120px !important;
  padding:9px !important;
  font-size:11px !important;
  border-radius:10px !important;
}
#adminToolsSection button,
.adminToolsSection button,
#adminMenuSection button{
  min-height:34px !important;
  height:auto !important;
  padding:7px 10px !important;
  font-size:10px !important;
  border-radius:9px !important;
}
#adminToolsSection .row,
.adminToolsSection .row,
#adminMenuSection .row{
  gap:6px !important;
  flex-wrap:wrap;
}
#adminToolsSection [style*="margin-top:14px"],
.adminToolsSection [style*="margin-top:14px"],
#adminMenuSection [style*="margin-top:14px"]{
  margin-top:8px !important;
}
#adminToolsSection [style*="margin-top:12px"],
.adminToolsSection [style*="margin-top:12px"],
#adminMenuSection [style*="margin-top:12px"]{
  margin-top:7px !important;
}
#adminToolsSection .notice,
.adminToolsSection .notice,
#adminMenuSection .notice{
  padding:7px 9px !important;
  margin-top:6px !important;
  font-size:9px !important;
  line-height:1.3 !important;
  border-radius:9px !important;
}
@media(max-width:560px){
  #d1StatusInline{margin:6px 0 8px;padding:6px 8px;font-size:9px}
  #adminToolsSection textarea,
  .adminToolsSection textarea,
  #adminMenuSection textarea{
    min-height:90px !important;
    height:96px !important;
    max-height:130px !important;
  }
}
</style>
<div id="d1StatusInline">
  <div class="left"><span class="dot"></span><span class="label" id="d1StatusInlineText">D1確認中</span></div>
  <span class="reset" id="d1StatusInlineReset"></span>
</div>
<script>
(async()=>{
  const box=document.getElementById("d1StatusInline");
  const text=document.getElementById("d1StatusInlineText");
  const reset=document.getElementById("d1StatusInlineReset");
  if(!box||!text||!reset)return;
  try{
    const r=await fetch("/api/admin/d1-status",{credentials:"same-origin",cache:"no-store"});
    if(r.status===401){ box.remove(); return; }
    const d=await r.json().catch(()=>({}));
    box.classList.remove("warn","err");
    if(d.status==="maintenance")box.classList.add("warn");
    if(d.status==="error")box.classList.add("err");

    if(d.status==="normal"){
      text.textContent="D1 正常・読込節約中";
      reset.textContent="次回 "+(d.reset_at_jst||"09:00");
    }else if(d.status==="maintenance"){
      text.textContent="メンテナンス中";
      reset.textContent=d.remaining_label||"";
    }else{
      text.textContent="D1 確認エラー";
      reset.textContent="";
    }
  }catch(_){
    box.remove();
  }



// v2.17: テスト研修生管理
(async()=>{
  const adminTitle=[...document.querySelectorAll('h1,h2,h3')].find(x=>/管理メニュー/.test(x.textContent||''));
  if(!adminTitle || document.getElementById('testTraineeCard217'))return;

  const card=document.createElement('div');
  card.id='testTraineeCard217';
  card.style.cssText='margin:8px 0;padding:10px;border:1px solid #d7e1eb;border-radius:12px;background:#fff;font-size:10px';
  card.innerHTML=
    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">'+
      '<div><b style="font-size:13px">🧪 テスト研修生</b><div style="color:#76879a;margin-top:2px">申請・予約・アンケート・期限確認専用</div></div>'+
      '<button id="ttCreate217" style="border:0;border-radius:9px;background:#0b2d52;color:#fff;padding:7px 10px;font-weight:900">作成</button>'+
    '</div>'+
    '<div id="ttBody217" style="margin-top:8px;color:#53667a">確認中...</div>';
  adminTitle.insertAdjacentElement('afterend',card);

  const body=card.querySelector('#ttBody217');
  const btn=card.querySelector('#ttCreate217');

  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const show=async()=>{
    try{
      const r=await fetch('/api/admin/test-trainee',{cache:'no-store'});
      const d=await r.json();
      if(!d.found){
        body.innerHTML='<span style="color:#8291a0">まだ作成されていません。</span>';
        btn.style.display='';
        return;
      }
      btn.style.display='none';
      body.innerHTML=
        '<div style="padding:8px;border-radius:10px;background:#f5f8fb;border:1px solid #e0e7ee">'+
          '<div><b>TEST</b>　'+esc(d.player_name||'テスト研修生')+'</div>'+
          '<div style="margin-top:4px">ログイン名：<b>'+esc(d.login_name||'')+'</b></div>'+
          '<div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">'+
            '<button id="ttPass217" style="padding:6px 8px;border:1px solid #cfdbe7;border-radius:8px;background:#fff;font-weight:800">パスワード再発行</button>'+
            '<button id="ttReset217" style="padding:6px 8px;border:1px solid #d6b352;border-radius:8px;background:#fffdf4;font-weight:800">進捗リセット</button>'+
            '<button id="ttDelete217" style="padding:6px 8px;border:1px solid #df9992;border-radius:8px;background:#fff8f7;color:#9c3229;font-weight:800">削除</button>'+
          '</div>'+
        '</div>';
      body.querySelector('#ttPass217').onclick=async()=>{
        const rr=await fetch('/api/admin/test-trainee/reissue-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:d.id})});
        const x=await rr.json();
        if(x.password)alert('新しいテスト用パスワード\\n\\n'+x.password+'\\n\\nこの画面を閉じる前に控えてください。');
        else alert(x.error||'再発行に失敗しました');
      };
      body.querySelector('#ttReset217').onclick=async()=>{
        if(!confirm('テスト研修生の予約・進捗を初期状態に戻しますか？'))return;
        const rr=await fetch('/api/admin/test-trainee/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:d.id})});
        const x=await rr.json(); alert(x.ok?'テスト研修生を初期状態に戻しました':(x.error||'失敗しました'));
        if(x.ok)location.reload();
      };
      body.querySelector('#ttDelete217').onclick=async()=>{
        if(!confirm('テスト研修生を削除しますか？'))return;
        const rr=await fetch('/api/admin/test-trainee/delete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:d.id})});
        const x=await rr.json(); alert(x.ok?'削除しました':(x.error||'削除に失敗しました'));
        if(x.ok)location.reload();
      };
    }catch(_){body.textContent='テスト研修生情報を取得できませんでした';}
  };
  btn.onclick=async()=>{
    btn.disabled=true;btn.textContent='作成中...';
    try{
      const r=await fetch('/api/admin/test-trainee/create',{method:'POST'});
      const d=await r.json();
      if(d.password){
        alert('テスト研修生を作成しました\\n\\nログイン名：'+d.login_name+'\\nパスワード：'+d.password+'\\n\\nパスワードはこの画面でのみ表示されます。控えてください。');
      }else if(d.existing){
        alert('既存のテスト研修生があります。必要ならパスワードを再発行してください。');
      }else if(d.error){
        alert(d.error);
      }
      await show();
    }finally{btn.disabled=false;btn.textContent='作成';}
  };
  await show();
})();

// v2.15: compact operations tools
(async()=>{
  const isAdmin = !!document.querySelector('body');
  if(!isAdmin)return;

  
  document.querySelectorAll('div,article,section').forEach(el=>{
    if(el.children.length>12)return;
    const t=(el.textContent||'').trim();
    if(t.includes('テスト研修生') && !el.dataset.testBadge217){
      el.dataset.testBadge217='1';
      const badge=document.createElement('span');
      badge.textContent='TEST';
      badge.style.cssText='display:inline-block;margin-left:5px;padding:2px 5px;border-radius:999px;background:#eef5ff;border:1px solid #9cbbe4;color:#184f88;font-size:8px;font-weight:1000';
      const target=el.querySelector('b,strong,h3,h4')||el;
      target.appendChild(badge);
    }
  });

  // 期限アラート強化: 7/3/1日で強調
  document.querySelectorAll('.traineeCompactDeadline').forEach(el=>{
    const m=el.textContent.match(/残り\s*(\d+)日/); if(!m)return;
    const d=Number(m[1]);
    if(d<=1){el.style.color='#a52d24';el.style.fontWeight='1000';el.textContent='🚨 '+el.textContent;}
    else if(d<=3){el.style.color='#b06b00';el.style.fontWeight='1000';el.textContent='⚠ '+el.textContent;}
    else if(d<=7){el.style.color='#8b7200';el.style.fontWeight='1000';}
  });

  // 予約一覧ページャー（20件/ページ）。Cookieでページを保持し再読込。
  const resHeading=[...document.querySelectorAll('h1,h2,h3,.sectionTitle')].find(x=>/予約一覧/.test(x.textContent||''));
  if(resHeading && !document.getElementById('reservationPager215')){
    const m=(document.cookie.match(/(?:^|;\s*)reservation_page=(\d+)/)||[])[1];
    const page=Math.max(1,Number(m||1));
    const p=document.createElement('div');p.id='reservationPager215';p.style.cssText='display:flex;gap:6px;align-items:center;margin:6px 0 10px;font-size:10px';
    p.innerHTML='<button id="rpPrev" style="padding:6px 10px;border:1px solid #d7e1eb;border-radius:8px;background:#fff">← 前</button><b>予約 '+page+'ページ目</b><button id="rpNext" style="padding:6px 10px;border:1px solid #d7e1eb;border-radius:8px;background:#fff">次 →</button><span style="color:#8593a2">20件ずつ</span>';
    resHeading.insertAdjacentElement('afterend',p);
    p.querySelector('#rpPrev').onclick=()=>{document.cookie='reservation_page='+Math.max(1,page-1)+';path=/;SameSite=Lax';location.reload()};
    p.querySelector('#rpNext').onclick=()=>{document.cookie='reservation_page='+(page+1)+';path=/;SameSite=Lax';location.reload()};
  }

  // 本日の対応だけ表示する簡易モード
  if(!document.getElementById('todaySimple215')){
    const b=document.createElement('button');b.id='todaySimple215';b.textContent='今日の対応だけ';
    b.style.cssText='position:fixed;left:10px;bottom:86px;z-index:9997;border:0;border-radius:999px;background:#0b2d52;color:#fff;padding:8px 11px;font-weight:900;font-size:10px;box-shadow:0 5px 16px #0002';
    document.body.appendChild(b);
    b.onclick=async()=>{
      let panel=document.getElementById('todayPanel215');
      if(panel){panel.remove();return;}
      panel=document.createElement('div');panel.id='todayPanel215';panel.style.cssText='position:fixed;left:10px;right:10px;bottom:128px;z-index:9998;background:#fff;border:1px solid #d7e1eb;border-radius:14px;padding:10px;box-shadow:0 14px 40px #102b4730;font-size:12px';
      panel.innerHTML='<b>今日の対応</b><div id="todayPanelBody" style="margin-top:7px;color:#65778a">読み込み中...</div>';
      document.body.appendChild(panel);
      try{const r=await fetch('/api/admin/ops-overview',{cache:'no-store'});const d=await r.json();panel.querySelector('#todayPanelBody').innerHTML='今日の研修 <b>'+(d.today||0)+'</b>　承認待ち <b>'+(d.pending||0)+'</b>　再受講 <b>'+(d.retake||0)+'</b>';}catch(_){panel.querySelector('#todayPanelBody').textContent='現在メンテナンス中です';}
    };
  }

  // 管理メニューに障害ログ / GitHub最終保存を追加
  const adminTitle=[...document.querySelectorAll('h1,h2,h3')].find(x=>/管理メニュー/.test(x.textContent||''));
  if(adminTitle && !document.getElementById('opsCard215')){
    const card=document.createElement('div');card.id='opsCard215';card.style.cssText='margin:8px 0;padding:9px;border:1px solid #d7e1eb;border-radius:12px;background:#fff;font-size:10px';
    card.innerHTML='<div style="display:flex;justify-content:space-between;gap:8px"><b>運用状況</b><span id="backup215">保存確認中</span></div><details style="margin-top:6px"><summary style="font-weight:900;cursor:pointer">障害ログ</summary><div id="incidents215" style="margin-top:6px;max-height:160px;overflow:auto;color:#697a8c">開くと読み込みます</div></details>';
    adminTitle.insertAdjacentElement('afterend',card);
    fetch('/api/admin/backup-status',{cache:'no-store'}).then(r=>r.json()).then(d=>{const el=document.getElementById('backup215');if(el)el.textContent=d.ok?('GitHub保存 '+(d.sha||'')):(d.label||'保存未設定')}).catch(()=>{});
    const det=card.querySelector('details');det.addEventListener('toggle',()=>{if(!det.open)return;fetch('/api/admin/incidents',{cache:'no-store'}).then(r=>r.json()).then(a=>{const el=document.getElementById('incidents215');if(!el)return;el.innerHTML=(Array.isArray(a)&&a.length)?a.map(x=>'<div style="padding:5px 0;border-bottom:1px solid #edf1f5"><b>'+x.kind+'</b> '+x.message+'<br><small>'+x.created_at+'</small></div>').join(''):'障害ログはありません';}).catch(()=>{});},{once:true});
  }
})();
})();
</script>`;


    const timeBlockPatterns = [
      /(<div[^>]*class="[^"]*(?:time|clock|jst)[^"]*"[^>]*>[\s\S]*?<\/div>)/i,
      /(<div[^>]*>[\s\S]*?JST[\s\S]*?<\/div>)/i
    ];

    let placed = false;
    for(const p of timeBlockPatterns){
      if(p.test(replaced)){
        replaced = replaced.replace(p, "$1" + d1Widget);
        placed = true;
        break;
      }
    }
    if(!placed && replaced.includes("</body>")){
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
    return core.scheduled(event, env, ctx);
  }
}

export default { fetch, scheduled };
