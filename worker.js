const APP_VERSION="1.27";
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});


const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

async function adminSessionSignature(secret, expires, role = "owner") {
  const data = new TextEncoder().encode("lomita-admin:" + expires + ":" + role + ":" + secret);
  return b64url(await crypto.subtle.digest("SHA-256", data));
}

async function legacyAdminSessionSignature(secret, expires) {
  const data = new TextEncoder().encode("lomita-admin:" + expires + ":" + secret);
  return b64url(await crypto.subtle.digest("SHA-256", data));
}

async function getAdminSessionRole(request, secret) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)lomita_admin=([^;]+)/);
  if (!match) return null;
  const parts = decodeURIComponent(match[1]).split(".");

  // Current format: expires.role.signature
  if (parts.length === 3) {
    const [expiresRaw, roleRaw, sig] = parts;
    const expires = Number(expiresRaw);
    const role = roleRaw === "owner" ? "owner" : roleRaw === "manager" ? "manager" : "";
    if (!expires || expires < Date.now() || !role || !sig) return null;
    const expected = await adminSessionSignature(secret, expiresRaw, role);
    return sig === expected ? role : null;
  }

  // Compatibility with sessions issued before role separation.
  if (parts.length === 2) {
    const [expiresRaw, sig] = parts;
    const expires = Number(expiresRaw);
    if (!expires || expires < Date.now() || !sig) return null;
    const expected = await legacyAdminSessionSignature(secret, expiresRaw);
    return sig === expected ? "owner" : null;
  }
  return null;
}

async function verifyAdminSession(request, secret) {
  return Boolean(await getAdminSessionRole(request, secret));
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

  const info = await env.DB.prepare("PRAGMA table_info(trainee_profiles)").all();
  const cols = (info.results || []).map(x => String(x.name || "").toLowerCase());
  if (!cols.includes("login_name")) {
    try { await env.DB.prepare("ALTER TABLE trainee_profiles ADD COLUMN login_name TEXT DEFAULT ''").run(); } catch (_) {}
  }
  if (!cols.includes("password_hash")) {
    try { await env.DB.prepare("ALTER TABLE trainee_profiles ADD COLUMN password_hash TEXT DEFAULT ''").run(); } catch (_) {}
  }
  if (!cols.includes("password_salt")) {
    try { await env.DB.prepare("ALTER TABLE trainee_profiles ADD COLUMN password_salt TEXT DEFAULT ''").run(); } catch (_) {}
  }
  if (!cols.includes("discord_user_id")) {
    try { await env.DB.prepare("ALTER TABLE trainee_profiles ADD COLUMN discord_user_id TEXT DEFAULT ''").run(); } catch (_) {}
  }

}

function randomToken(bytes=16){
  const a=new Uint8Array(bytes);crypto.getRandomValues(a);return b64url(a);
}
async function traineePasswordHash(password,salt){
  const data=new TextEncoder().encode("lomita-trainee:"+salt+":"+password);
  return b64url(await crypto.subtle.digest("SHA-256",data));
}
async function traineeSessionSignature(secret,id,expires){
  const data=new TextEncoder().encode("lomita-trainee-session:"+id+":"+expires+":"+secret);
  return b64url(await crypto.subtle.digest("SHA-256",data));
}
async function createTraineeSessionCookie(env,profileId){
  const expires=Date.now()+12*60*60*1000;
  const secret=env.TRAINEE_SESSION_SECRET||env.ADMIN_PASSWORD||"lomita-trainee-session";
  const sig=await traineeSessionSignature(secret,String(profileId),String(expires));
  return `lomita_trainee=${profileId}.${expires}.${sig}; Max-Age=43200; HttpOnly; Secure; SameSite=Strict; Path=/`;
}
async function getTraineeSession(request,env){
  await ensureTraineeProfiles(env);
  const cookie=request.headers.get("cookie")||"";
  const m=cookie.match(/(?:^|;\s*)lomita_trainee=([^;]+)/);
  if(!m)return null;
  const [idRaw,expiresRaw,sig]=decodeURIComponent(m[1]).split(".");
  const id=Number(idRaw),expires=Number(expiresRaw);
  if(!id||!expires||expires<Date.now()||!sig)return null;
  const secret=env.TRAINEE_SESSION_SECRET||env.ADMIN_PASSWORD||"lomita-trainee-session";
  const expected=await traineeSessionSignature(secret,idRaw,expiresRaw);
  if(sig!==expected)return null;
  return await env.DB.prepare("SELECT id,player_name,login_name,discord_id,affiliation,rank FROM trainee_profiles WHERE id=?").bind(id).first();
}

async function ensureReservationInstructor(env) {
  const info = await env.DB.prepare("PRAGMA table_info(reservations)").all();
  const cols = (info.results || []).map(x => String(x.name || "").toLowerCase());
  if (!cols.includes("assigned_instructor")) {
    await env.DB.prepare("ALTER TABLE reservations ADD COLUMN assigned_instructor TEXT DEFAULT ''").run();
  }
}

async function ensureReservationPreferredSchedule(env) {
  const info = await env.DB.prepare("PRAGMA table_info(reservations)").all();
  const cols = (info.results || []).map(x => String(x.name || "").toLowerCase());
  if (!cols.includes("preferred_date")) {
    await env.DB.prepare("ALTER TABLE reservations ADD COLUMN preferred_date TEXT DEFAULT ''").run();
  }
  if (!cols.includes("preferred_time")) {
    await env.DB.prepare("ALTER TABLE reservations ADD COLUMN preferred_time TEXT DEFAULT ''").run();
  }
  if (!cols.includes("preferred_date2")) await env.DB.prepare("ALTER TABLE reservations ADD COLUMN preferred_date2 TEXT DEFAULT ''").run();
  if (!cols.includes("preferred_time2")) await env.DB.prepare("ALTER TABLE reservations ADD COLUMN preferred_time2 TEXT DEFAULT ''").run();
  if (!cols.includes("preferred_date3")) await env.DB.prepare("ALTER TABLE reservations ADD COLUMN preferred_date3 TEXT DEFAULT ''").run();
  if (!cols.includes("preferred_time3")) await env.DB.prepare("ALTER TABLE reservations ADD COLUMN preferred_time3 TEXT DEFAULT ''").run();
  if (!cols.includes("confirmed_date")) await env.DB.prepare("ALTER TABLE reservations ADD COLUMN confirmed_date TEXT DEFAULT ''").run();
  if (!cols.includes("confirmed_time")) await env.DB.prepare("ALTER TABLE reservations ADD COLUMN confirmed_time TEXT DEFAULT ''").run();
  if (!cols.includes("confirmed_preference")) await env.DB.prepare("ALTER TABLE reservations ADD COLUMN confirmed_preference INTEGER DEFAULT 0").run();
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

  const sortInfo=await env.DB.prepare("PRAGMA table_info(training_programs)").all();
  const sortCols=(sortInfo.results||[]).map(x=>String(x.name||"").toLowerCase());
  if(!sortCols.includes("sort_order")){
    try{await env.DB.prepare("ALTER TABLE training_programs ADD COLUMN sort_order INTEGER DEFAULT 0").run()}catch(_){}
  }
  const {results:sortRows}=await env.DB.prepare("SELECT id,sort_order FROM training_programs ORDER BY id").all();
  let seq=1;
  for(const p of (sortRows||[])){
    if(!Number(p.sort_order))await env.DB.prepare("UPDATE training_programs SET sort_order=? WHERE id=?").bind(seq,p.id).run();
    seq++;
  }

}


function cookieValue(request,name){
  const cookie=request.headers.get("cookie")||"";
  const safe=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const m=cookie.match(new RegExp("(?:^|;\\s*)"+safe+"=([^;]+)"));
  return m?decodeURIComponent(m[1]):"";
}
function discordConfigured(env){
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
}
function discordRedirectUri(request){
  return new URL("/auth/discord/callback",request.url).toString();
}
async function discordExchangeCode(request,env,codeValue){
  const body=new URLSearchParams({
    client_id:env.DISCORD_CLIENT_ID,
    client_secret:env.DISCORD_CLIENT_SECRET,
    grant_type:"authorization_code",
    code:codeValue,
    redirect_uri:discordRedirectUri(request)
  });
  const r=await fetch("https://discord.com/api/oauth2/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||"Discord token exchange failed");
  return d.access_token;
}
async function discordCurrentUser(accessToken){
  const r=await fetch("https://discord.com/api/users/@me",{headers:{authorization:"Bearer "+accessToken}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.id)throw new Error(d.message||"Discord user fetch failed");
  return d;
}

const html = (title, body, script = "") => new Response(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title><style>
:root{
  --navy:#071b33;
  --navy2:#0d2948;
  --navy3:#123b66;
  --blue:#1659a7;
  --gold:#d7ad45;
  --gold2:#f0d98c;
  --bg:#e9eef4;
  --panel:#f7f9fc;
  --card:#ffffff;
  --text:#0b1726;
  --muted:#68778b;
  --line:#cfd8e3;
  --danger:#b42318;
  --ok:#147d43;
  --warn:#a15c00;
}
*{box-sizing:border-box}
body{
  margin:0;
  background:
    linear-gradient(180deg,#dfe7f0 0,#edf2f7 220px,#eef3f8 100%);
  color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;
}
body:before{
  content:"";
  display:block;
  position:fixed;
  inset:0 0 auto 0;
  height:6px;
  background:linear-gradient(90deg,var(--gold),#fff0,var(--gold));
  z-index:100;
  pointer-events:none;
}
a{color:inherit;text-decoration:none}
.wrap{max-width:900px;margin:auto;padding:18px 14px 100px}
.header{
  position:relative;
  overflow:hidden;
  background:linear-gradient(135deg,var(--navy) 0%,var(--navy2) 58%,#123c66 100%);
  color:#fff;
  padding:20px;
  border-radius:20px;
  border:1px solid #ffffff20;
  box-shadow:0 14px 36px #06182a30;
  margin-bottom:14px;
}
.header:after{
  content:"POLICE";
  position:absolute;
  right:-12px;
  top:4px;
  font-size:64px;
  line-height:1;
  font-weight:1000;
  letter-spacing:.08em;
  color:#ffffff08;
  transform:rotate(-3deg);
  pointer-events:none;
  z-index:0;
}
.header > *{
  position:relative;
  z-index:2;
}
.header a,.header button{
  position:relative;
  z-index:3;
  pointer-events:auto;
}
.header .brand{font-size:25px;font-weight:950;letter-spacing:.03em}
.header .sub{color:#d6e3f2}
.badge{
  display:inline-flex;
  align-items:center;
  gap:5px;
  background:linear-gradient(180deg,var(--gold2),var(--gold));
  color:#12233a;
  padding:5px 10px;
  border-radius:999px;
  font-size:11px;
  font-weight:950;
  border:1px solid #fff8;
  box-shadow:inset 0 1px #fff8;
  margin-bottom:8px;
}
.sub{color:var(--muted);font-size:13px}
.top,.between,.row{display:flex;gap:10px;align-items:center}
.between{justify-content:space-between}
.row{flex-wrap:wrap}

.btn{
  border:1px solid var(--line);
  background:#fff;
  color:var(--text);
  padding:11px 14px;
  border-radius:12px;
  font-weight:850;
  cursor:pointer;
  box-shadow:0 1px 2px #08192c0d;
}
.btn:hover{filter:brightness(.99)}
.btn:active{transform:translateY(1px)}
.btn.primary{
  background:linear-gradient(180deg,#1d65b8,#164f92);
  color:#fff;
  border-color:#164f92;
  box-shadow:0 6px 14px #164f9228;
}
.btn.dark{
  background:linear-gradient(180deg,#0b223f,#06182d);
  color:#fff;
  border-color:#06182d;
}
.btn.danger{color:var(--danger);border-color:#efb4ae;background:#fff7f6}
.btn.small{padding:8px 10px;font-size:12px}

.card,.stat{
  background:var(--card);
  border:1px solid #cfd8e4;
  border-radius:18px;
  padding:16px;
  box-shadow:0 4px 16px #0a20350a;
}
.card{margin:12px 0}
.card:has(.title){position:relative}
.title{font-size:18px;font-weight:950;letter-spacing:.01em}
.meta{display:flex;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:13px;margin:8px 0}
.pill{
  display:inline-flex;
  align-items:center;
  border-radius:999px;
  background:#e7edf4;
  color:#26384c;
  padding:5px 9px;
  font-size:12px;
  font-weight:850;
  border:1px solid #d4dde7;
}
.pill.pending{background:#fff5d9;color:#8a5600;border-color:#efd99e}
.pill.reserved{background:#e9f2ff;color:#164f92;border-color:#bdd5f5}
.pill.completed{background:#e8f7ef;color:#147d43;border-color:#bfe3cf}
.pill.cancelled,.pill.absent{background:#fff0ef;color:var(--danger);border-color:#efc0bc}

.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.stat{
  position:relative;
  overflow:hidden;
  background:linear-gradient(180deg,#fff,#f9fbfd);
}
.stat:before{
  content:"";
  position:absolute;
  left:0;top:0;bottom:0;
  width:4px;
  background:var(--navy3);
}
.stat b{display:block;font-size:26px;margin-top:5px}
.section{
  display:flex;
  align-items:center;
  gap:8px;
  font-weight:950;
  font-size:18px;
  margin:24px 2px 9px;
  color:#0b1d31;
}
.section:before{
  content:"";
  width:5px;
  height:20px;
  border-radius:99px;
  background:linear-gradient(180deg,var(--gold),#b58b29);
  box-shadow:0 0 0 2px #fff8;
}
.empty{text-align:center;color:var(--muted);padding:38px 10px}

input,textarea,select{
  width:100%;
  border:1px solid #c6d1de;
  border-radius:12px;
  padding:12px 13px;
  font:inherit;
  background:#fff;
  color:var(--text);
  box-shadow:inset 0 1px 2px #0b1e3108;
}
input:focus,textarea:focus,select:focus{
  outline:none;
  border-color:#6b94c4;
  box-shadow:0 0 0 3px #1659a714;
}
textarea{min-height:90px}
.field{margin:12px 0}
.field label{
  display:block;
  font-size:12px;
  color:#52647a;
  font-weight:850;
  margin-bottom:6px;
}
.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}

.notice{
  padding:11px 12px;
  border-radius:12px;
  background:#eaf3ff;
  color:#164f92;
  font-size:13px;
  margin:10px 0;
  border:1px solid #c8dbf3;
}
.notice.error{background:#fff0f0;color:#b42318;border-color:#efc2c2}
.notice.success{background:#eaf8ef;color:#147d43;border-color:#c5e8d2}

.modal{
  position:fixed;
  inset:0;
  background:#061527b8;
  backdrop-filter:blur(3px);
  display:none;
  align-items:flex-end;
  justify-content:center;
  z-index:30;
}
.modal.open{display:flex}
.sheet{
  background:linear-gradient(180deg,#fff,#f8fafc);
  width:100%;
  max-width:640px;
  max-height:92vh;
  overflow:auto;
  border-radius:24px 24px 0 0;
  padding:20px;
  padding-bottom:calc(22px + env(safe-area-inset-bottom));
  border-top:4px solid var(--gold);
  box-shadow:0 -18px 50px #06152738;
}
.login{max-width:430px;margin:60px auto 0}

.footerNav{
  position:fixed;
  left:0;right:0;bottom:0;
  background:#fffffffa;
  border-top:1px solid var(--line);
  display:flex;
  gap:10px;
  padding:8px 14px calc(8px + env(safe-area-inset-bottom));
  z-index:20;
  box-shadow:0 -8px 24px #06152712;
}
.footerNav a{
  flex:1;
  text-align:center;
  padding:12px;
  border-radius:12px;
  font-weight:950;
}
.footerNav .active{
  background:linear-gradient(180deg,#0b223f,#06182d);
  color:#fff;
  box-shadow:inset 0 0 0 1px #ffffff12;
}

.res{border-top:1px solid var(--line);padding:13px 0}
.res:first-child{border-top:0}
.statusButtons{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.menuTabs{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:9px;
  margin:14px 0;
}
.menuTabs .btn{
  width:100%;
  padding:13px 9px;
  border-radius:14px;
  font-weight:900;
}
.menuTabs .btn.dark{
  box-shadow:inset 0 -3px 0 #d7ad454d,0 6px 16px #06182d20;
}
.profileHead{display:flex;gap:12px;align-items:center}
.avatar{
  width:50px;height:50px;border-radius:50%;
  background:linear-gradient(180deg,#eaf2fb,#dae7f6);
  border:2px solid #bfd1e4;
  display:flex;align-items:center;justify-content:center;
  font-weight:950;color:var(--blue);
}

.traineeCard{border-left:4px solid var(--navy3)}
#programList .card{border-top:3px solid #d7ad4555}
#instructorList .card{border-left:4px solid #d7ad45}
#trainingList .card{border-left:4px solid #164f92}


/* Compact trainee dashboard */
#traineeApp .header{padding:15px 16px;border-radius:17px;margin-bottom:10px}
#traineeApp .header .brand{font-size:21px}
#traineeApp .header .badge{padding:4px 8px;margin-bottom:5px}
#traineeApp .section{font-size:16px;margin:16px 2px 7px}
#traineeApp .section:before{height:17px;width:4px}
#traineeApp .profileCard{padding:12px}
#traineeApp .profileHead{gap:9px}
#traineeApp .avatar{width:40px;height:40px}
#traineeApp .grid{gap:7px;margin-top:10px}
#traineeApp .stat{padding:10px 12px;border-radius:13px;min-height:72px}
#traineeApp .stat b{font-size:22px;margin-top:2px}
#traineeApp .stat .sub{font-size:11px}
#traineeApp .card{padding:12px;border-radius:15px;margin:8px 0}
#traineeApp .title{font-size:16px}
#traineeApp .meta{margin:5px 0;font-size:12px}
#traineeApp .pill{padding:4px 8px;font-size:11px}


/* Smart compact admin dashboard - v1.11 */
#adminView .wrap{max-width:760px;padding-bottom:88px}
#adminView .header{
  padding:14px 16px;
  border-radius:17px;
  margin-bottom:10px;
}
#adminView .header .brand{font-size:22px;line-height:1.15}
#adminView .header .badge{
  padding:4px 9px;
  margin-bottom:5px;
  font-size:10px;
}
#adminView .header .sub{font-size:12px;line-height:1.35}
#adminView .header .between{gap:8px}
#adminView .header .row{
  gap:6px;
  justify-content:flex-end;
  max-width:255px;
}
#adminView .header .btn.small{
  padding:7px 9px;
  font-size:11px;
  border-radius:10px;
}
#adminView > .wrap > .grid{
  gap:7px;
  grid-template-columns:repeat(4,1fr);
}
#adminView > .wrap > .grid .stat{
  min-height:68px;
  padding:9px 10px;
  border-radius:13px;
}
#adminView > .wrap > .grid .stat .sub{
  font-size:10px;
  white-space:nowrap;
}
#adminView > .wrap > .grid .stat b{
  font-size:22px;
  margin-top:2px;
  line-height:1.05;
}
#adminView .menuTabs{
  gap:7px;
  margin:9px 0 10px;
}
#adminView .menuTabs .btn{
  min-height:42px;
  padding:9px 7px;
  border-radius:12px;
  font-size:12px;
}
#adminView .section{
  margin:13px 2px 7px;
  font-size:16px;
}
#adminView .section:before{width:4px;height:17px}
#adminView #reservationsSection > .section{
  margin-top:10px;
  font-size:17px;
}
#adminView #reservationsSection > .card{
  margin-top:7px;
  margin-bottom:8px;
  padding:12px;
  border-radius:15px;
}
#adminView #reservationControlList .card{
  margin:8px 0;
  padding:12px;
  border-radius:15px;
}
#adminView #reservationControlList .title{font-size:16px}
#adminView #reservationControlList .field{margin:9px 0}
#adminView #reservationControlList input,
#adminView #reservationControlList select{padding:10px 11px}
#adminView #reservationControlList .btn.primary{padding:10px 12px}
#adminView .footerNav{
  padding-top:5px;
  padding-bottom:calc(5px + env(safe-area-inset-bottom));
  gap:8px;
}
#adminView .footerNav a{
  padding:9px;
  border-radius:11px;
  font-size:14px;
}

@media(max-width:700px){
  #adminView > .wrap > .grid{grid-template-columns:repeat(4,1fr);gap:6px}
  #adminView > .wrap > .grid .stat{min-width:0;padding:8px 7px;min-height:64px}
  #adminView > .wrap > .grid .stat .sub{font-size:9px;letter-spacing:-.02em}
  #adminView > .wrap > .grid .stat b{font-size:20px}
  #adminView .header .between{align-items:flex-start}
  #adminView .header .row{max-width:220px}

  .grid{grid-template-columns:1fr 1fr}
  .formgrid{grid-template-columns:1fr}
  .header .between{align-items:flex-start}
  .top{align-items:flex-start}
  .header:after{font-size:48px;right:-18px;top:14px}
  .menuTabs{grid-template-columns:repeat(2,1fr)}
}

/* automatic instructor completion stamp - police seal */
.instructorStamp{
  width:76px;height:76px;border-radius:50%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;line-height:1.02;transform:rotate(-5deg);
  font-weight:950;color:#0a2748;background:#fff;
  border:3px solid #0a2748;
  box-shadow:
    inset 0 0 0 3px #fff,
    inset 0 0 0 5px #d6ae35,
    inset 0 0 0 7px #0a2748,
    0 4px 10px rgba(10,39,72,.16);
  flex:0 0 76px;position:relative;overflow:hidden;
}
.instructorStamp:before,.instructorStamp:after{
  content:"";position:absolute;left:13px;right:13px;height:1px;background:#d6ae35;
}
.instructorStamp:before{top:25px}.instructorStamp:after{bottom:22px}
.instructorStamp .stStar{
  font-size:12px;line-height:1;color:#d6ae35;margin-bottom:2px;
}
.instructorStamp .stTop{
  font-size:6px;letter-spacing:1px;color:#0a2748;font-weight:950;
}
.instructorStamp .stName{
  font-size:9px;max-width:56px;line-height:1.05;white-space:normal;
  word-break:break-word;overflow-wrap:anywhere;margin:4px 0 3px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.instructorStamp .stName.long{font-size:7px;max-width:58px}
.instructorStamp .stDone{
  font-size:7px;letter-spacing:.9px;color:#0a2748;font-weight:950;
}
.completedHistory{display:flex;gap:10px;align-items:center}.completedHistoryMain{min-width:0;flex:1}
.trainingProgressGrid{display:grid;grid-template-columns:1fr;gap:9px;margin-top:9px}
.trainingProgressCard{background:#fff;border:1px solid #d9e1ec;border-radius:14px;padding:11px 12px;box-shadow:0 2px 8px rgba(10,34,61,.05)}
.trainingProgressCard.done{border-left:5px solid #d6ae35}
.trainingProgressRow{display:flex;align-items:center;justify-content:space-between;gap:10px}
.trainingProgressMain{min-width:0;flex:1}
.trainingProgressTitle{font-weight:900;font-size:14px;line-height:1.35;color:#0d223c}
.trainingProgressMeta{font-size:11px;color:#758195;margin-top:5px}
.trainingProgressEmpty{width:66px;height:66px;border:2px dashed #ccd5e2;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:9px;color:#9aa6b5;flex:0 0 66px}
.dashboardProgressBox{margin-top:14px;padding-top:12px;border-top:1px solid #e4e9f0}
.dashboardProgressHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}
.dashboardProgressTitle{font-size:15px;font-weight:950;color:#0d223c}
.historyLauncher{display:flex;justify-content:flex-end;margin:12px 0 4px}
.historyLauncher .btn{min-height:42px}
@media(max-width:520px){
 .instructorStamp{width:68px;height:68px;flex-basis:68px}
 .instructorStamp .stName{font-size:8px;max-width:50px}
 .instructorStamp .stName.long{font-size:6px;max-width:52px}
 .trainingProgressEmpty{width:60px;height:60px;flex-basis:60px}
}

/* compact trainee progress dashboard */
#mySummary.compactSummary{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;margin:0!important}
.compactUserRow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 7px;padding:0 2px}
.compactUserName{font-weight:900;font-size:13px;color:#0d223c}
.compactUserSub{font-size:10px;color:#7a8798;margin-top:1px}
.dashboardProgressBox{margin-top:0!important;padding-top:0!important;border-top:0!important}
.dashboardProgressHead{margin:0 0 6px!important}
.dashboardProgressTitle{font-size:14px!important}
.trainingProgressGrid{gap:7px!important;margin-top:6px!important}
.trainingProgressCard{padding:8px 10px!important;border-radius:12px!important;min-height:62px}
.trainingProgressRow{gap:8px!important}
.trainingProgressTitle{font-size:13px!important}
.trainingProgressMeta{font-size:10px!important;margin-top:3px!important}
.trainingProgressEmpty{width:50px!important;height:50px!important;flex-basis:50px!important;font-size:8px!important}
.instructorStamp{width:56px!important;height:56px!important;flex-basis:56px!important;border-width:2px!important;box-shadow:inset 0 0 0 2px #fff,inset 0 0 0 4px #d6ae35,inset 0 0 0 6px #0a2748,0 3px 8px rgba(10,39,72,.14)!important}
.instructorStamp:before,.instructorStamp:after{left:9px!important;right:9px!important}
.instructorStamp:before{top:18px!important}.instructorStamp:after{bottom:16px!important}
.instructorStamp .stStar{font-size:8px!important}
.instructorStamp .stTop{font-size:4px!important;letter-spacing:.6px!important}
.instructorStamp .stName{font-size:7px!important;max-width:42px!important;margin:2px 0!important}
.instructorStamp .stName.long{font-size:6px!important;max-width:44px!important}
.instructorStamp .stDone{font-size:5px!important;letter-spacing:.5px!important}
.historyLauncher{margin:9px 0 2px!important}


/* training ledger / driving-school style record */
.trainingLedger{
  background:#fff;border:1px solid #d5dde8;border-radius:14px;
  overflow:hidden;box-shadow:0 2px 8px rgba(10,34,61,.05);
}
.trainingLedgerHeader{
  padding:10px 12px;background:#f7f9fc;border-bottom:1px solid #d9e1ec;
}
.trainingLedgerTitle{font-weight:950;font-size:14px;color:#0d223c}
.trainingLedgerMeta{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:4px;font-size:10px;color:#6f7d8f}
.trainingLedgerMeta b{color:#0d223c}
.trainingLedgerRows{display:block}
.trainingLedgerRow{
  display:grid;grid-template-columns:minmax(0,1fr) 64px 76px 58px;
  align-items:center;gap:6px;padding:8px 9px;border-bottom:1px solid #e7ebf0;
  min-height:62px;
}
.trainingLedgerRow:last-child{border-bottom:0}
.trainingLedgerRow.done{background:#fffdf6}
.trainingLedgerName{min-width:0}
.trainingLedgerName .main{font-size:12px;font-weight:900;line-height:1.3;color:#0d223c}
.trainingLedgerName .sub{font-size:9px;color:#8490a0;margin-top:2px}
.trainingLedgerStatus{text-align:center;font-size:9px;font-weight:900}
.trainingLedgerStatus .doneLabel{
  display:inline-block;padding:4px 6px;border-radius:999px;
  background:#edf8f1;color:#187a42;border:1px solid #bfe5cc;
}
.trainingLedgerStatus .pendingLabel{
  display:inline-block;padding:4px 6px;border-radius:999px;
  background:#f5f6f8;color:#7f8a99;border:1px solid #dde2e8;
}
.trainingLedgerInstructor{
  font-size:9px;line-height:1.25;color:#5f6d7e;text-align:center;
  word-break:break-word;
}
.trainingLedgerStamp{display:flex;justify-content:center}
.trainingLedger .instructorStamp{
  width:48px!important;height:48px!important;flex-basis:48px!important;
  border-width:2px!important;
  box-shadow:inset 0 0 0 2px #fff,inset 0 0 0 4px #d6ae35,inset 0 0 0 5px #0a2748!important;
  transform:rotate(-4deg)!important;
}
.trainingLedger .instructorStamp:before,.trainingLedger .instructorStamp:after{
  left:8px!important;right:8px!important;
}
.trainingLedger .instructorStamp:before{top:15px!important}
.trainingLedger .instructorStamp:after{bottom:14px!important}
.trainingLedger .instructorStamp .stStar{font-size:7px!important}
.trainingLedger .instructorStamp .stTop{font-size:3.7px!important;letter-spacing:.4px!important}
.trainingLedger .instructorStamp .stName{font-size:6px!important;max-width:36px!important;margin:1px 0!important}
.trainingLedger .instructorStamp .stName.long{font-size:5px!important;max-width:38px!important}
.trainingLedger .instructorStamp .stDone{font-size:4px!important;letter-spacing:.35px!important}
.trainingLedgerEmptyStamp{
  width:46px;height:46px;border:1.5px dashed #d5dce5;border-radius:50%;
  display:flex;align-items:center;justify-content:center;font-size:8px;color:#a5afbc;
}
@media(max-width:520px){
  .trainingLedgerRow{
    grid-template-columns:minmax(0,1fr) 52px 66px 50px;
    gap:4px;padding:7px 7px;min-height:58px;
  }
  .trainingLedgerName .main{font-size:11px}
  .trainingLedgerName .sub{font-size:8px}
  .trainingLedgerInstructor{font-size:8px}
}


/* mobile driving-school style ledger grid */
.ledgerScroll{
  overflow-x:auto;
  -webkit-overflow-scrolling:touch;
  padding-bottom:6px;
  border:1px solid #cfd7e1;
  border-radius:12px;
  background:#fff;
}
.ledgerPaper{
  min-width:760px;
  background:#fff;
  color:#111827;
}
.ledgerTop{
  display:flex;justify-content:space-between;align-items:center;
  padding:8px 10px;border-bottom:2px solid #111;
  font-size:11px;background:#fafafa;
}
.ledgerTop b{font-size:13px}
.ledgerTable{
  display:grid;
  grid-template-columns:72px repeat(8, 90px);
  border-top:1px solid #111;
  border-left:1px solid #111;
}
.ledgerCell{
  min-height:56px;
  border-right:1px solid #111;
  border-bottom:1px solid #111;
  display:flex;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:4px;
  font-size:10px;
  line-height:1.2;
  background:#fff;
  position:relative;
}
.ledgerCell.label{
  font-weight:900;
  background:#f7f7f7;
  font-size:10px;
}
.ledgerCell.item{
  flex-direction:column;
  gap:2px;
}
.ledgerCell .itemNo{
  position:absolute;
  top:2px;right:4px;
  font-size:8px;color:#6b7280;
}
.ledgerCell .itemTitle{
  font-weight:900;
  font-size:10px;
  max-width:74px;
  line-height:1.15;
}
.ledgerCell .itemTeacher{
  font-size:8px;
  color:#64748b;
  margin-top:1px;
}
.ledgerCell.done{background:#fffdf5}
.ledgerCell.pending{background:#fff}
.ledgerCell.empty{background:#fbfbfb;color:#c0c6cf}
.ledgerStampMini{
  width:48px;height:48px;border-radius:50%;
  border:2px solid #0a2748;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  color:#0a2748;background:#fff;
  box-shadow:inset 0 0 0 2px #fff,inset 0 0 0 4px #d6ae35;
  transform:rotate(-4deg);
  font-weight:950;
  line-height:1.02;
  padding:3px;
}
.ledgerStampMini .s1{
  font-size:7px;
  font-weight:950;
  letter-spacing:.3px;
  color:#b48b17;
  margin-bottom:2px;
}
.ledgerStampMini .s2{
  font-size:8px;
  font-weight:950;
  max-width:38px;
  line-height:1.05;
  text-align:center;
  white-space:normal;
  overflow-wrap:anywhere;
  word-break:break-word;
  display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
  overflow:hidden;
}
.ledgerStampMini .s2.long{
  font-size:6px;
  max-width:40px;
}
.ledgerStampMini .s3{
  font-size:6px;
  font-weight:950;
  letter-spacing:.4px;
  margin-top:2px;
}
.ledgerLegend{
  display:flex;gap:8px;align-items:center;
  padding:7px 9px;
  font-size:9px;color:#64748b;background:#fafafa;
  border-top:1px solid #d9dee6;
}
@media(max-width:520px){
 .ledgerScroll{margin-left:-2px;margin-right:-2px}
 .ledgerPaper{min-width:754px}
 .ledgerTable{grid-template-columns:66px repeat(8,86px)}
 .ledgerCell{min-height:52px}
 .ledgerCell .itemTitle{font-size:8px;max-width:70px}
}

</style></head><body>${body}<script>${script}</script></body></html>`, {headers:{"content-type":"text/html; charset=utf-8"}});


const LANDING_BODY = `
<div class="wrap" style="max-width:620px">
  <div class="header" style="margin-top:35px">
    <span class="badge">LOMITA POLICE DEPARTMENT</span>
    <div class="brand">警察研修管理システム</div>
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
<div class="wrap" id="traineeApp">
  <div class="header">
    <div class="between">
      <div><span class="badge">TRAINEE PORTAL</span><div class="brand">研修生ポータル</div><div class="sub">研修申請・承認状況・受講履歴</div><div class="sub" style="margin-top:6px;opacity:.78">Version ${APP_VERSION}</div></div>
      <a class="btn small" href="/" onclick="window.location.href='/';return false">トップへ</a>
    </div>
  </div>

  <div id="authView">
    <div class="card">
      <div class="title">研修生ログイン</div>
      <div class="sub" style="margin:6px 0 14px">Discordアカウントでログインしてください。</div>
      <div id="discordLoginMsg" class="notice" style="margin-bottom:12px">Discord連携を確認しています...</div>
      <a id="discordTraineeLoginBtn" href="/auth/discord" class="btn primary" style="display:block;text-align:center;width:100%">Discordでログイン</a>
      <div class="sub" style="margin-top:12px;text-align:center">ログイン状態はこの端末で12時間保持されます。</div>
    </div>
  </div>

  <div id="loggedInView" style="display:none">
    <div class="between">
      <div class="section" style="margin-top:8px">研修記録</div>
      <button id="traineeLogoutBtn" class="btn small" type="button">ログアウト</button>
    </div>
    <div id="mySummary"></div>
    <div class="historyLauncher"><button id="openHistoryBtn" class="btn small" type="button">申請・受講履歴を見る</button></div>

<div id="historyModal" class="modal">
  <div class="modalCard">
    <div class="between">
      <div>
        <div class="title">申請・受講履歴</div>
        <div class="sub">過去の申請・予約・受講履歴</div>
      </div>
      <button id="closeHistoryBtn" class="btn small" type="button">閉じる</button>
    </div>
    <div id="myHistory" style="margin-top:12px"></div>
  </div>
</div>
    <div id="msg"></div>
    <div class="section">現在の研修</div>
    <div id="list"><div class="empty">読み込み中...</div></div>
  </div>
</div>

<div id="booking" class="modal"><div class="sheet">
  <button class="btn small" style="float:right" onclick="closeBooking()">閉じる</button>
  <div class="title" id="bookTitle">研修申請</div>
  <div class="sub" style="margin-top:4px">申請後、管理者が担当教官を選んで承認します。</div>
  <div id="bookingMsg"></div>
  <div style="margin-top:12px">
    <div style="font-weight:900;margin-bottom:6px">第1希望 <span style="color:#b42318;font-size:12px">必須</span></div>
    <div class="grid" style="grid-template-columns:1.35fr 1fr;gap:8px">
      <div class="field" style="margin:0"><label style="font-size:11px">日付</label><input id="preferredDate" type="date" required style="min-height:44px;font-size:15px;padding:9px 10px"></div>
      <div class="field" style="margin:0"><label style="font-size:11px">時間</label><input id="preferredTime" type="time" required style="min-height:44px;font-size:15px;padding:9px 10px"></div>
    </div>
  </div>
  <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb">
    <div style="font-weight:900;margin-bottom:6px">第2希望 <span class="sub" style="font-size:11px">任意</span></div>
    <div class="grid" style="grid-template-columns:1.35fr 1fr;gap:8px">
      <div class="field" style="margin:0"><label style="font-size:11px">日付</label><input id="preferredDate2" type="date" style="min-height:44px;font-size:15px;padding:9px 10px"></div>
      <div class="field" style="margin:0"><label style="font-size:11px">時間</label><input id="preferredTime2" type="time" style="min-height:44px;font-size:15px;padding:9px 10px"></div>
    </div>
  </div>
  <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb">
    <div style="font-weight:900;margin-bottom:6px">第3希望 <span class="sub" style="font-size:11px">任意</span></div>
    <div class="grid" style="grid-template-columns:1.35fr 1fr;gap:8px">
      <div class="field" style="margin:0"><label style="font-size:11px">日付</label><input id="preferredDate3" type="date" style="min-height:44px;font-size:15px;padding:9px 10px"></div>
      <div class="field" style="margin:0"><label style="font-size:11px">時間</label><input id="preferredTime3" type="time" style="min-height:44px;font-size:15px;padding:9px 10px"></div>
    </div>
  </div>
  <div class="field"><label>備考</label><textarea id="note" maxlength="250" placeholder="必要な場合のみ入力"></textarea></div>
  <button id="bookingSubmitBtn" type="button" class="btn primary" style="width:100%">申請する</button>
</div></div>`;

const PUBLIC_SCRIPT = String.raw`
let selectedTraining=null,myProfile=null;
const statusLabels={pending:'承認待ち',reserved:'予約確定',completed:'受講済み',absent:'欠席',cancelled:'キャンセル'};
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function noticeIn(id,t,c){document.getElementById(id).innerHTML='<div class="notice '+(c||'')+'">'+esc(t)+'</div>'}
function show(t,c){const e=document.getElementById('msg');e.innerHTML='<div class="notice '+c+'">'+esc(t)+'</div>';setTimeout(()=>e.innerHTML='',4200)}

function showAuth(){document.getElementById('authView').style.display='block';document.getElementById('loggedInView').style.display='none'}
function showLoggedIn(){document.getElementById('authView').style.display='none';document.getElementById('loggedInView').style.display='block'}

async function loadDiscordLoginConfig(){
 const b=document.getElementById('discordTraineeLoginBtn');
 const msg=document.getElementById('discordLoginMsg');
 try{
   const r=await fetch('/api/auth/discord/config',{cache:'no-store'});
   const d=await r.json().catch(()=>({}));
   if(d.enabled){
     if(b){b.style.display='block';b.style.pointerEvents='auto';b.style.opacity='1'}
     if(msg){msg.className='notice success';msg.textContent='Discordログインを利用できます。'}
   }else{
     if(b){b.style.pointerEvents='none';b.style.opacity='.55'}
     if(msg){msg.className='notice error';msg.textContent='Discord連携の設定が未完了です。管理者にお問い合わせください。'}
   }
 }catch(_){
   if(msg){msg.className='notice error';msg.textContent='Discord連携状態を確認できませんでした。再読み込みしてください。'}
 }
}
async function restoreTrainee(){
 const r=await fetch('/api/trainee/session');
 if(!r.ok){showAuth();return}
 const d=await r.json();myProfile=d.profile;showLoggedIn();await loadMyPage();
}
async function traineeLogout(){
 await fetch('/api/trainee/logout',{method:'POST'});
 myProfile=null;showAuth();
}
async function load(){
 const r=await fetch('/api/trainings');
 const data=await r.json().catch(()=>[]);
 const el=document.getElementById('list');
 if(r.status===401){showAuth();return}
 if(!r.ok){el.innerHTML='<div class="notice error">'+esc((data.error||'研修を取得できませんでした')+(data.detail?'：'+data.detail:''))+'</div>';return}
 if(!data.length){el.innerHTML='<div class="empty">すべての研修を受講済みです。</div>';return}
 el.innerHTML=data.map(t=>'<div class="card profileCard"><div class="title">'+esc(t.title)+'</div>'+(t.description?'<div class="sub" style="margin:10px 0 12px;white-space:pre-wrap">'+esc(t.description)+'</div>':'')+'<div class="between"><span class="sub">'+(t.current_status==='pending'?'現在、承認待ちです。':t.current_status==='reserved'?'承認済みです。受講完了後に次の研修が表示されます。':'申請後、管理者が担当教官を選んで承認します。')+'</span><button class="btn primary bookingBtn" data-id="'+t.id+'" data-title="'+encodeURIComponent(t.title)+'" '+(t.already_applied?'disabled':'')+'>'+(t.current_status==='pending'?'承認待ち':t.current_status==='reserved'?'受講待ち':'申請する')+'</button></div></div>').join('');
 document.querySelectorAll('.bookingBtn:not([disabled])').forEach(btn=>btn.addEventListener('click',()=>openBooking(Number(btn.dataset.id),decodeURIComponent(btn.dataset.title))));
}
function openBooking(id,title){
 selectedTraining={id,title};
 document.getElementById('bookingMsg').innerHTML='';
 document.getElementById('bookTitle').textContent=title+' 申請';
 const now=new Date();
 const local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
 ['preferredDate','preferredDate2','preferredDate3'].forEach(id=>{const el=document.getElementById(id);if(el)el.min=local;});
 document.getElementById('booking').classList.add('open')
}
function closeBooking(){document.getElementById('booking').classList.remove('open')}
function instructorStamp(name){
 const n=String(name||'担当教官').trim()||'担当教官';
 const cls=n.length>=9?'stName long':'stName';
 return '<div class="instructorStamp" title="担当教官：'+esc(n)+'"><div class="stStar">★</div><div class="stTop">LOMITA POLICE</div><div class="'+cls+'">'+esc(n)+'</div><div class="stDone">CERTIFIED</div></div>';
}
function ledgerStamp(name){
 const n=String(name||'担当教官').trim()||'担当教官';
 const cls=n.length>=9?'s2 long':'s2';
 return '<div class="ledgerStampMini" title="担当教官：'+esc(n)+'">'+
   '<div class="s1">教官印</div>'+
   '<div class="'+cls+'">'+esc(n)+'</div>'+
   '<div class="s3">承認</div>'+
 '</div>';
}


async function loadProgress(){
 const el=document.getElementById('trainingProgressList');
 if(!el)return;
 try{
   const r=await fetch('/api/trainee/progress',{cache:'no-store'});
   const d=await r.json().catch(()=>({}));
   if(r.status===401)return;
   if(!r.ok){
     el.innerHTML='<div class="notice error">'+esc(d.error||'進捗を取得できませんでした')+'</div>';
     return;
   }
   const rows=Array.isArray(d.programs)?d.programs:[];
   if(!rows.length){
     el.innerHTML='<div class="empty">研修プログラムが登録されていません。</div>';
     return;
   }
   const completed=rows.filter(p=>p.status==='completed').length;
   const perRow=8;
   const groups=[];
   for(let i=0;i<rows.length;i+=perRow)groups.push(rows.slice(i,i+perRow));

   const makeCells=(group,offset)=>{
     const filled=[...group];
     while(filled.length<perRow)filled.push(null);

     const stampRow=
       '<div class="ledgerCell label">月日<br>指導員印</div>'+
       filled.map((p,j)=>{
         if(!p)return '<div class="ledgerCell empty">—</div>';
         const done=p.status==='completed';
         return '<div class="ledgerCell item '+(done?'done':'pending')+'">'+
           '<div class="itemNo">'+(offset+j+1)+'</div>'+
           (done?ledgerStamp(p.assigned_instructor):'<span style="color:#b6bec9">未修了</span>')+
         '</div>';
       }).join('');

     const itemRow=
       '<div class="ledgerCell label">研修項目名</div>'+
       filled.map((p,j)=>{
         if(!p)return '<div class="ledgerCell empty">—</div>';
         return '<div class="ledgerCell item">'+
           '<div class="itemTitle">'+esc(p.title||('研修 '+(offset+j+1)))+'</div>'+
           (p.status==='completed'?'<div class="itemTeacher">'+esc(p.assigned_instructor||'')+'</div>':'')+
         '</div>';
       }).join('');

     const statusRow=
       '<div class="ledgerCell label">修了状況</div>'+
       filled.map(p=>{
         if(!p)return '<div class="ledgerCell empty">—</div>';
         return '<div class="ledgerCell">'+(p.status==='completed'?'修了':'未修了')+'</div>';
       }).join('');

     return stampRow+itemRow+statusRow;
   };

   el.innerHTML=
    '<div class="ledgerScroll">'+
      '<div class="ledgerPaper">'+
        '<div class="ledgerTop">'+
          '<div><b>研修進捗表</b></div>'+
          '<div>修了 '+completed+' / '+rows.length+'</div>'+
        '</div>'+
        groups.map((g,idx)=>'<div class="ledgerTable">'+makeCells(g,idx*perRow)+'</div>').join('')+
        '<div class="ledgerLegend">横にスワイプして原簿全体を確認できます。</div>'+
      '</div>'+
    '</div>' }catch(_){
   el.innerHTML='<div class="notice error">進捗を取得できませんでした。</div>';
 }
}

async function loadMyPage(){
 const r=await fetch('/api/trainee/profile');
 const d=await r.json().catch(()=>({}));
 if(r.status===401){showAuth();return}
 if(!r.ok)return;
 myProfile=d.profile;
 const summaryEl=document.getElementById('mySummary');
 summaryEl.classList.add('compactSummary');
 summaryEl.innerHTML=
  '<div class="compactUserRow">'+
    '<div><div class="compactUserName">'+esc(d.profile.player_name||'研修生')+'</div><div class="compactUserSub">ログイン中</div></div>'+
  '</div>'+
  '<div class="dashboardProgressBox">'+
    '<div class="dashboardProgressHead"><div class="dashboardProgressTitle">研修進捗表</div></div>'+
    '<div id="trainingProgressList" class="trainingProgressGrid"><div class="empty">進捗を読み込み中...</div></div>'+
  '</div>';
 loadProgress();
 const h=document.getElementById('myHistory');
 h.innerHTML=d.history.length?d.history.map(x=>'<div class="card">'+(x.status==='completed'?'<div class="completedHistory"><div class="completedHistoryMain">':'')+'<div class="between"><div><span class="pill '+esc(x.status)+'">'+esc(statusLabels[x.status]||x.status)+'</span><div class="title" style="margin-top:7px">'+esc(x.title)+'</div></div>'+(x.status==='pending'||x.status==='reserved'?'<button class="btn danger small traineeCancelBtn" data-id="'+x.id+'">申請キャンセル</button>':'')+'</div>'+(x.preferred_date||x.preferred_time?'<div class="sub" style="margin-top:7px">第1希望：'+esc([x.preferred_date||'',x.preferred_time||''].filter(Boolean).join(' '))+'</div>':'')+
(x.preferred_date2||x.preferred_time2?'<div class="sub"><b>第2希望：</b>'+esc([x.preferred_date2||'',x.preferred_time2||''].filter(Boolean).join(' '))+'</div>':'')+
(x.preferred_date3||x.preferred_time3?'<div class="sub"><b>第3希望：</b>'+esc([x.preferred_date3||'',x.preferred_time3||''].filter(Boolean).join(' '))+'</div>':'')+(x.confirmed_date||x.confirmed_time?'<div style="margin-top:7px;font-weight:900">✅ 確定日時：'+esc([x.confirmed_date||'',x.confirmed_time||''].filter(Boolean).join(' '))+'</div>':'')+(x.assigned_instructor?'<div class="sub" style="margin-top:7px">担当教官：'+esc(x.assigned_instructor)+'</div>':'')+(x.note?'<div class="sub">備考：'+esc(x.note)+'</div>':'')+(x.status==='completed'?'</div></div>':'')+'</div>').join(''):'<div class="empty">まだ申請・受講履歴はありません。</div>';
 document.querySelectorAll('.traineeCancelBtn').forEach(b=>b.addEventListener('click',()=>cancelMyReservation(Number(b.dataset.id))));
 await load();
}
async function cancelMyReservation(id){
 if(!confirm('この研修申請をキャンセルしますか？'))return;
 const r=await fetch('/api/trainee/reservations/'+id+'/cancel',{method:'POST'});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){alert(d.error||'キャンセルできませんでした');return}
 show('申請をキャンセルしました。','success');
 await loadMyPage();
}
async function submitBooking(){
 if(!selectedTraining)return;
 const ids=['preferredDate','preferredTime','preferredDate2','preferredTime2','preferredDate3','preferredTime3'];
 const v=Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value]));
 if(!v.preferredDate||!v.preferredTime){noticeIn('bookingMsg','第1希望の日時は必ず入力してください。','error');return}
 if((v.preferredDate2&&!v.preferredTime2)||(!v.preferredDate2&&v.preferredTime2)){noticeIn('bookingMsg','第2希望は日付と時間を両方入力してください。','error');return}
 if((v.preferredDate3&&!v.preferredTime3)||(!v.preferredDate3&&v.preferredTime3)){noticeIn('bookingMsg','第3希望は日付と時間を両方入力してください。','error');return}
 const btn=document.getElementById('bookingSubmitBtn');btn.disabled=true;btn.textContent='申請中...';
 try{
  const r=await fetch('/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
   training_id:selectedTraining.id,preferred_date:v.preferredDate,preferred_time:v.preferredTime,
   preferred_date2:v.preferredDate2,preferred_time2:v.preferredTime2,
   preferred_date3:v.preferredDate3,preferred_time3:v.preferredTime3,note:document.getElementById('note').value.trim()
  })});
  const d=await r.json().catch(()=>({}));
  if(r.status===401){closeBooking();showAuth();return}
  if(!r.ok){noticeIn('bookingMsg',d.error||'申請できませんでした','error');return}
  closeBooking();[...ids,'note'].forEach(id=>document.getElementById(id).value='');
  show('希望日時を付けて申請しました。承認をお待ちください。','success');await loadMyPage();
 }finally{btn.disabled=false;btn.textContent='申請する'}
}
document.getElementById('bookingSubmitBtn')?.addEventListener('click',submitBooking);

document.getElementById('openHistoryBtn')?.addEventListener('click',()=>document.getElementById('historyModal')?.classList.add('open'));
document.getElementById('closeHistoryBtn')?.addEventListener('click',()=>document.getElementById('historyModal')?.classList.remove('open'));
document.getElementById('historyModal')?.addEventListener('click',e=>{if(e.target.id==='historyModal')e.currentTarget.classList.remove('open')});

loadDiscordLoginConfig();restoreTrainee();`;

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
 <div class="header"><div class="between"><div><span class="badge">LOMITA POLICE</span><div class="brand">研修管理本部</div><div class="sub">研修・参加申請・受講状況を一括管理</div><div class="sub" style="margin-top:6px;opacity:.78">Version ${APP_VERSION}</div><div id="adminRoleLabel" class="sub" style="margin-top:4px"></div></div><div class="row"><button class="btn small" onclick="logout()">ログアウト</button><button class="btn small" onclick="openManageMenu()">⚠️ここは触らない⚠️</button><button class="btn primary small" onclick="openTraining()">＋研修追加</button></div></div></div>
 <div id="msg"></div>
 <div class="grid"><div class="stat"><span class="sub">今後の研修</span><b id="sTrain">0</b></div><div class="stat"><span class="sub">承認待ち</span><b id="sPending">0</b></div><div class="stat"><span class="sub">予約確定</span><b id="sReserved">0</b></div><div class="stat"><span class="sub">受講済み</span><b id="sCompleted">0</b></div></div>

 <div class="menuTabs" style="grid-template-columns:repeat(2,1fr)">
   <button id="tabTraining" class="btn" type="button" onclick="showAdminSection('training')">研修管理</button>
   <button id="tabPrograms" class="btn" type="button" onclick="showAdminSection('programs')">研修プログラム管理</button>
   <button id="tabInstructors" class="btn" type="button" onclick="showAdminSection('instructors')">教官管理</button>
   <button id="tabTrainees" class="btn" type="button" onclick="showAdminSection('trainees')">研修生管理</button>
   <button id="tabReservations" class="btn dark" type="button" onclick="showAdminSection('reservations')">予約一覧</button>
   <button class="btn" type="button" onclick="openManageMenu()">⚠️ここは触らない⚠️</button>
 </div>

 <div id="trainingSection" style="display:none">
   <div class="section">研修一覧・TRAINING CONTROL</div><div id="adminList"></div>
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

 <div id="reservationsSection">
   <div class="section">予約一覧・RESERVATION CONTROL</div>
   <div class="card">
     <div class="between">
       <div>
         <div class="title" style="font-size:16px">予約ステータス管理</div>
         <div class="sub" style="margin-top:5px">新規申請は承認待ちで表示され、予約確定・受講済み・欠席へ変更できます。</div>
       </div>
       <button class="btn small" type="button" onclick="loadReservationControl()">更新</button>
     </div>
   </div>
   <div id="reservationControlList"><div class="empty">予約一覧を読み込んでいます...</div></div>
 </div>

 <div id="traineeSection" style="display:none">
   <div class="section">研修生一覧・TRAINEE STATUS</div>
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
   <div class="card" style="border:2px solid #d7ad45">
     <div class="title" style="font-size:16px">ZIPで一括更新</div>
     <div class="sub" style="margin:6px 0 12px">修正版ZIPをそのまま選択できます。ZIP内に1つの親フォルダがある場合は自動で外し、中のファイルだけをGitHubへ反映します。</div>
     <div id="zipUploadMsg"></div>
     <div class="field"><label>修正版ZIP *</label><input id="zipFile" type="file" accept=".zip,application/zip"></div>
     <div class="sub" id="zipFileInfo" style="margin:-4px 0 10px">ZIP未選択</div>
     <button id="zipUploadBtn" type="button" class="btn primary" style="width:100%" onclick="uploadZipToGitHub()">ZIPの中身をGitHubへ更新</button>
   </div>

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

<div id="resModal" class="modal"><div class="sheet"><button class="btn small" style="float:right" onclick="closeReservations()">閉じる</button><div class="title" id="resTitle">参加者管理</div><div id="resActionMsg"></div>
  <div id="resList"></div></div></div>
<div id="traineeModal" class="modal"><div class="sheet">
 <button class="btn small" style="float:right" onclick="closeTraineeDetail()">閉じる</button>
 <span class="badge">TRAINEE</span><div class="title" id="traineeDetailTitle">研修生詳細</div>
 <div id="traineeDetail"><div class="empty">読み込み中...</div></div>
</div></div>`;

const ADMIN_SCRIPT = String.raw`
let adminPassword='', trainings=[], activeTrainingId=null, buildTimer=null, currentAdminRole='owner';
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
   const d=await r.json().catch(()=>({}));
   if(!r.ok){
     document.getElementById('loginMsg').innerHTML='<div class="notice error">'+(r.status===401?'パスワードが違います':'ログイン処理に失敗しました（HTTP '+r.status+'）')+'</div>';
     return;
   }
   adminPassword='';showAdmin();await loadCurrentAdminRole();await loadAdmin();await loadReservationControl();
 }finally{btn.disabled=false;btn.textContent='管理画面を開く'}
}
async function logout(){
 adminPassword='';
 await fetch('/api/admin/logout',{method:'POST'}).catch(()=>{});
 location.href='/';
}
function showAdmin(){document.getElementById('loginView').style.display='none';document.getElementById('adminView').style.display='block'}
async function loadCurrentAdminRole(){
 currentAdminRole='owner';
 document.querySelectorAll('.ownerOnly').forEach(el=>el.style.display='');
 const label=document.getElementById('adminRoleLabel');
 if(label)label.textContent='システム管理者';
}
async function restoreAdmin(){
 const r=await fetch('/api/admin/check');
 if(r.ok){showAdmin();await loadCurrentAdminRole();await loadAdmin();await loadReservationControl()}
}
function openManageMenu(){document.getElementById('manageModal').classList.add('open');setTimeout(()=>loadBuildStatus(),150)}
function closeManageMenu(){document.getElementById('manageModal').classList.remove('open')}
function showAdminSection(section){
 const training=section==='training';
 const programs=section==='programs';
 const instructors=section==='instructors';
 const trainees=section==='trainees';
 const reservations=section==='reservations';
 document.getElementById('trainingSection').style.display=training?'block':'none';
 document.getElementById('programSection').style.display=programs?'block':'none';
 document.getElementById('instructorSection').style.display=instructors?'block':'none';
 document.getElementById('traineeSection').style.display=trainees?'block':'none';
 document.getElementById('reservationsSection').style.display=reservations?'block':'none';
 document.getElementById('tabTraining').className='btn '+(training?'dark':'');
 document.getElementById('tabPrograms').className='btn '+(programs?'dark':'');
 document.getElementById('tabInstructors').className='btn '+(instructors?'dark':'');
 document.getElementById('tabTrainees').className='btn '+(trainees?'dark':'');
 document.getElementById('tabReservations').className='btn '+(reservations?'dark':'');
 if(programs)loadPrograms();
 if(instructors)loadInstructors();
 if(trainees)loadTrainees();
 if(reservations)loadReservationControl();
}
async function loadReservationControl(){
 const e=document.getElementById('reservationControlList');
 if(!e)return;
 e.innerHTML='<div class="empty">予約一覧を読み込んでいます...</div>';

 if(!instructorRows.length){
   try{
     const ir=await fetch('/api/admin/instructors',{headers:auth()});
     const id=await ir.json().catch(()=>[]);
     if(ir.ok && Array.isArray(id))instructorRows=id;
   }catch(_){}
 }

 const r=await fetch('/api/admin/reservation-control',{headers:auth()});
 const d=await r.json().catch(()=>[]);
 if(!r.ok){
   e.innerHTML='<div class="notice error">'+esc(d.error||'予約一覧を取得できませんでした')+'</div>';
   return;
 }
 if(!d.length){
   e.innerHTML='<div class="empty">現在、予約データはありません。</div>';
   return;
 }

 e.innerHTML=d.map(x=>{
   const preferredText=[x.preferred_date||'',x.preferred_time||''].filter(Boolean).join(' ');
   const preferredText2=[x.preferred_date2||'',x.preferred_time2||''].filter(Boolean).join(' ');
   const preferredText3=[x.preferred_date3||'',x.preferred_time3||''].filter(Boolean).join(' ');
   const confirmedText=[x.confirmed_date||'',x.confirmed_time||''].filter(Boolean).join(' ');
   const preferenceOptions=[
     preferredText?'<option value="1" '+(Number(x.confirmed_preference)===1?'selected':'')+'>第1希望：'+esc(preferredText)+'</option>':'',
     preferredText2?'<option value="2" '+(Number(x.confirmed_preference)===2?'selected':'')+'>第2希望：'+esc(preferredText2)+'</option>':'',
     preferredText3?'<option value="3" '+(Number(x.confirmed_preference)===3?'selected':'')+'>第3希望：'+esc(preferredText3)+'</option>':''
   ].filter(Boolean).join('');
   const statusLabel=labels[x.status]||x.status;
   const statusOptions=[
     ['reserved','予約確定'],
     ['completed','受講済み'],
     ['absent','欠席']
   ].map(s=>'<option value="'+s[0]+'" '+(((x.status==='pending'?'reserved':x.status)===s[0])?'selected':'')+'>'+s[1]+'</option>').join('');
   const instructorOptions='<option value="">担当教官なし</option>'+
     instructorRows.map(i=>'<option value="'+esc(i.name)+'" '+(x.assigned_instructor===i.name?'selected':'')+'>'+esc(i.name)+'</option>').join('');
   const border=x.status==='pending'?'#d9b33b':x.status==='reserved'?'#0b4fa3':x.status==='completed'?'#147d43':'#a15c00';

   return '<div class="card" style="border-left:4px solid '+border+'">'+
     '<div class="between" style="gap:12px;align-items:flex-start">'+
       '<div style="min-width:0">'+
         '<span class="pill '+esc(x.status)+'">'+esc(statusLabel)+'</span>'+
         '<div class="title" style="margin-top:7px">'+esc(x.title||'研修')+'</div>'+
         '<div class="sub" style="margin-top:5px">研修生：'+esc(x.player_name||'')+'</div>'+
         (x.affiliation?'<div class="sub">所属：'+esc(x.affiliation)+'</div>':'')+
         '<div class="sub" style="margin-top:6px;font-weight:800">第1希望：'+esc(preferredText||'未入力')+'</div>'+
         (preferredText2?'<div class="sub" style="font-weight:800">第2希望：'+esc(preferredText2)+'</div>':'')+
         (preferredText3?'<div class="sub" style="font-weight:800">第3希望：'+esc(preferredText3)+'</div>':'')+
         (confirmedText?'<div style="margin-top:8px;padding:7px 9px;border-radius:10px;background:#eef6ff;font-weight:900">✅ 確定日時：'+esc(confirmedText)+'</div>':'')+
       '</div>'+
     '</div>'+
     '<div class="field" style="margin-top:12px"><label>承認する日時</label><select id="reservationPreference_'+x.id+'"><option value="">希望日時を選択</option>'+preferenceOptions+'</select></div>'+
     '<div class="field"><label>状態</label><select id="reservationStatus_'+x.id+'">'+statusOptions+'</select></div>'+
     '<div class="field"><label>担当教官</label><select id="reservationInstructor_'+x.id+'">'+instructorOptions+'</select></div>'+
     '<button class="btn primary" style="width:100%" type="button" onclick="saveReservationFromList('+Number(x.id)+')">変更を保存</button>'+
     (x.note?'<div class="sub" style="margin-top:8px">備考：'+esc(x.note)+'</div>':'')+
   '</div>';
 }).join('');
}

async function saveReservationFromList(id){
 const statusEl=document.getElementById('reservationStatus_'+id);
 const instructorEl=document.getElementById('reservationInstructor_'+id);
 const preferenceEl=document.getElementById('reservationPreference_'+id);
 const status=statusEl?statusEl.value:'';
 const assigned_instructor=instructorEl?instructorEl.value.trim():'';
 const confirmed_preference=preferenceEl?Number(preferenceEl.value||0):0;

 if(status==='reserved' && !confirmed_preference){
   alert('予約確定にする場合は、第1〜第3希望から承認する日時を選択してください。');
   return;
 }
 if(status==='reserved' && !assigned_instructor){
   alert('予約確定にする場合は担当教官を選択してください。');
   return;
 }
 const label=labels[status]||status;
 if(!confirm('この予約を「'+label+'」に変更しますか？'))return;

 try{
   const r=await fetch('/api/admin/reservations/'+id,{
     method:'PATCH',
     headers:auth(),
     body:JSON.stringify({status,assigned_instructor,confirmed_preference})
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok){
     alert((d.error||'変更できませんでした')+(d.detail?'\n'+d.detail:''));
     return;
   }
   await loadReservationControl();
   await loadAdmin();
 }catch(e){
   alert('通信エラーで変更できませんでした。');
 }
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
 e.innerHTML=programRows.map((p,i)=>'<div class="card"><div class="between"><div><div class="title">'+esc(p.display_name||p.name)+'</div>'+((p.display_description||p.description)?'<div class="sub" style="margin-top:6px;white-space:pre-wrap">'+esc(p.display_description||p.description)+'</div>':'')+'<div class="sub" style="margin-top:7px">研修生はこのプログラムへ直接申請します。</div></div><div class="row"><button class="btn small" data-move-program="'+p.id+'" data-dir="-1" '+(i===0?'disabled':'')+'>↑</button><button class="btn small" data-move-program="'+p.id+'" data-dir="1" '+(i===programRows.length-1?'disabled':'')+'>↓</button><button class="btn small" data-edit-program="'+p.id+'">編集</button><button class="btn small danger" data-delete-program="'+p.id+'">削除</button></div></div></div>').join('');
 document.querySelectorAll('[data-move-program]').forEach(b=>b.addEventListener('click',()=>moveProgram(Number(b.dataset.moveProgram),Number(b.dataset.dir))));
 document.querySelectorAll('[data-edit-program]').forEach(b=>b.addEventListener('click',()=>editProgram(Number(b.dataset.editProgram))));
 document.querySelectorAll('[data-delete-program]').forEach(b=>b.addEventListener('click',()=>deleteProgram(Number(b.dataset.deleteProgram))));
}
async function editProgram(id){
 const p=programRows.find(x=>Number(x.id)===Number(id));
 if(!p)return;
 const name=prompt('学科名を編集',p.display_name||p.name||'');
 if(name===null)return;
 const cleanName=name.trim();
 if(!cleanName){alert('学科名は空にできません');return}
 const description=prompt('フリー記入欄を編集',p.display_description||p.description||'');
 if(description===null)return;
 const r=await fetch('/api/admin/programs/'+id,{method:'PATCH',headers:auth(),body:JSON.stringify({name:cleanName,description:description.trim()})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){alert(d.error||'編集できませんでした');return}
 await loadPrograms();
 alert('学科名を更新しました');
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
async function moveProgram(id,dir){
 const r=await fetch('/api/admin/programs/'+id+'/move',{method:'POST',headers:auth(),body:JSON.stringify({direction:dir})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){alert(d.error||'並び替えできませんでした');return}
 await loadPrograms();
}
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
 const rows=traineeRows.filter(x=>!q||[x.player_name,x.login_name,x.discord_id,x.affiliation].some(v=>String(v||'').toLowerCase().includes(q)));
 const e=document.getElementById('traineeList');
 if(!rows.length){e.innerHTML='<div class="empty">該当する研修生はいません。</div>';return}
 e.innerHTML=rows.map(x=>{
   const done=Number(x.progress_completed||0),total=Number(x.progress_total||0),pct=Number(x.progress_percent||0);
   return '<div class="card traineeCard"><div class="between"><div class="profileHead"><div class="avatar">'+esc((x.player_name||'?').slice(0,1))+'</div><div><div class="title">'+esc(x.player_name||'名前未登録')+'</div>'+(x.login_name?'<div class="sub">：'+esc(x.login_name)+'</div>':'')+'</div></div><button class="btn small danger traineeDeleteBtn" data-id="'+x.id+'" data-name="'+encodeURIComponent(x.player_name||'研修生')+'">研修生を削除</button></div><div style="margin-top:14px"><div class="between"><b>研修進捗</b><b>'+done+'/'+total+' 完了</b></div><div style="height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-top:7px"><div style="height:100%;width:'+pct+'%;background:#0b4fa3"></div></div><div class="sub" style="margin-top:7px">'+(x.current_training?'次の研修：'+esc(x.current_training):'全研修修了')+'</div></div><div class="meta"><span>承認待ち '+x.pending+'</span><span>予約 '+x.reserved+'</span><span>欠席 '+x.absent+'</span></div><button class="btn small traineeOpenBtn" style="margin-top:8px" data-discord="'+encodeURIComponent(x.discord_id||x.login_name||x.player_name)+'">受講履歴を見る</button></div>';
 }).join('');
 document.querySelectorAll('.traineeOpenBtn').forEach(btn=>btn.addEventListener('click',()=>openTraineeDetail(decodeURIComponent(btn.dataset.discord))));
 document.querySelectorAll('.traineeDeleteBtn').forEach(btn=>btn.addEventListener('click',()=>deleteTrainee(Number(btn.dataset.id),decodeURIComponent(btn.dataset.name))));
}
async function deleteTrainee(id,name){
 if(!confirm(name+' を完全に削除しますか？\nアカウントと全申請・受講履歴が削除されます。'))return;
 const r=await fetch('/api/admin/trainees/'+id,{method:'DELETE',headers:auth()});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){alert(d.error||'研修生を削除できませんでした');return}
 await loadTrainees();
 await loadAdmin();
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
 e.innerHTML=trainings.map(t=>'<div class="card"><div class="between"><div><span class="pill">'+esc(t.category||'一般研修')+'</span><div class="title" style="margin-top:7px">'+esc(t.title)+(Number(t.pending_count)>0?' <span class="pill pending">申請 '+t.pending_count+'</span>':'')+'</div><div class="meta"><span>📅 '+fmt(t.training_date)+'</span><span>🕒 '+esc(t.start_time)+(t.end_time?'〜'+esc(t.end_time):'')+'</span>'+(t.location?'<span>📍 '+esc(t.location)+'</span>':'')+'</div></div><span class="pill">'+t.active_count+'/'+t.capacity+'名</span></div><div class="row" style="margin-top:12px"><button class="btn small resBtn" data-id="'+t.id+'" data-title="'+encodeURIComponent(t.title)+'">参加者管理</button><button class="btn small editBtn" data-id="'+t.id+'">編集</button><button class="btn danger small delBtn" data-id="'+t.id+'">削除</button></div></div>').join('');
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
async function loadReservations(){
 const sheet=document.querySelector('#resModal .sheet');
 const oldScroll=sheet?sheet.scrollTop:0;
 const r=await fetch('/api/admin/trainings/'+activeTrainingId+'/reservations',{headers:auth()});
 const data=await r.json().catch(()=>({}));
 const e=document.getElementById('resList');
 if(!r.ok){e.innerHTML='<div class="notice error">'+esc(data.error||'参加者を取得できませんでした')+'</div>';return}
 if(!data.length){e.innerHTML='<div class="empty">申請者はいません。</div>';return}
 e.innerHTML=data.map(x=>{
   const p1=[x.preferred_date||'',x.preferred_time||''].filter(Boolean).join(' ');
   const p2=[x.preferred_date2||'',x.preferred_time2||''].filter(Boolean).join(' ');
   const p3=[x.preferred_date3||'',x.preferred_time3||''].filter(Boolean).join(' ');
   const confirmed=[x.confirmed_date||'',x.confirmed_time||''].filter(Boolean).join(' ');
   const choices=[
     p1?'<option value="1" '+(Number(x.confirmed_preference)===1?'selected':'')+'>第1希望：'+esc(p1)+'</option>':'',
     p2?'<option value="2" '+(Number(x.confirmed_preference)===2?'selected':'')+'>第2希望：'+esc(p2)+'</option>':'',
     p3?'<option value="3" '+(Number(x.confirmed_preference)===3?'selected':'')+'>第3希望：'+esc(p3)+'</option>':''
   ].filter(Boolean).join('');
   return '<div class="res"><div class="between"><div><b>'+esc(x.player_name)+'</b> <span class="pill '+esc(x.status)+'">'+esc(labels[x.status]||x.status)+'</span><div class="sub">：'+esc(x.discord_id||'未登録')+'</div></div></div>'+
   (confirmed?'<div class="sub" style="margin-top:6px;font-weight:900">✅ 確定日時：'+esc(confirmed)+'</div>':'')+
   (x.note?'<div class="sub" style="margin-top:6px">備考：'+esc(x.note)+'</div>':'')+
   (x.status==='pending'?'<div class="field" style="margin:10px 0"><label>承認する日時</label><select id="reservationPreference_'+x.id+'"><option value="">希望日時を選択</option>'+choices+'</select></div>':'')+
   '<div class="field" style="margin:10px 0"><label>担当教官</label><select id="reservationInstructor_'+x.id+'"><option value="">担当教官を選択</option>'+instructorRows.map(i=>'<option value="'+esc(i.name)+'" '+(x.assigned_instructor===i.name?'selected':'')+'>'+esc(i.name)+'</option>').join('')+'</select></div><div class="statusButtons">'+
   (x.status==='pending'?'<button class="btn primary small statusBtn" data-id="'+x.id+'" data-status="reserved">日時を選んで承認</button>':'')+
   '<button class="btn small statusBtn" data-id="'+x.id+'" data-status="completed">受講済み</button><button class="btn small statusBtn" data-id="'+x.id+'" data-status="absent">欠席</button><button class="btn danger small statusBtn" data-id="'+x.id+'" data-status="cancelled">取消</button><button class="btn danger small hardDeleteReservationBtn" data-id="'+x.id+'">申請を完全削除</button></div></div>';
 }).join('');
 document.querySelectorAll('.statusBtn').forEach(btn=>btn.addEventListener('click',()=>setStatus(Number(btn.dataset.id),btn.dataset.status)));
 document.querySelectorAll('.hardDeleteReservationBtn').forEach(btn=>btn.addEventListener('click',()=>hardDeleteReservation(Number(btn.dataset.id))));
 if(sheet)requestAnimationFrame(()=>{sheet.scrollTop=oldScroll});
}
async function hardDeleteReservation(id){
 if(!confirm('この申請・受講履歴を完全に削除しますか？\nこの操作は元に戻せません。'))return;
 const r=await fetch('/api/admin/reservations/'+id,{method:'DELETE',headers:auth()});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){alert(d.error||'完全削除できませんでした');return}
 await loadReservations();
 await loadAdmin();
}
async function setStatus(id,status){
 let assigned_instructor='';
 let confirmed_preference=0;
 if(status==='reserved'){
   const sel=document.getElementById('reservationInstructor_'+id);
   const pref=document.getElementById('reservationPreference_'+id);
   assigned_instructor=sel?sel.value.trim():'';
   confirmed_preference=pref?Number(pref.value||0):0;
   if(!confirmed_preference){alert('第1〜第3希望から承認する日時を選択してください。');return}
   if(!assigned_instructor){alert('担当教官を選択してから承認してください。');return}
 }

 const buttons=[...document.querySelectorAll('.statusBtn[data-id="'+id+'"]')];
 buttons.forEach(b=>b.disabled=true);

 try{
   const r=await fetch('/api/admin/reservations/'+id,{
     method:'PATCH',
     headers:auth(),
     body:JSON.stringify({status,assigned_instructor,confirmed_preference})
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok){
     alert((d.error||'更新できませんでした')+(d.detail?'\n'+d.detail:''));
     return;
   }

   // 参加者管理モーダルを閉じず、その場で最新状態へ更新
   await loadReservations();

   // 背景の研修一覧にある人数・状態も同時更新
   await loadAdmin();

   // モーダルが再描画されても、同じ研修を開いたまま維持
   if(activeTrainingId){
     const t=trainings.find(x=>Number(x.id)===Number(activeTrainingId));
     if(t){
       document.getElementById('resTitle').textContent=t.title+' / 参加者管理';
     }
   }
 }catch(e){
   alert('通信エラーで更新できませんでした。');
 }finally{
   buttons.forEach(b=>b.disabled=false);
 }
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
   msgEl.innerHTML='<div class="notice success">worker.jsをGitHubへ更新しました。Cloudflareのビルド状況を確認します。</div>';
   input.value='';
   try{startBuildWatch()}catch(watchError){
     console.error('build watch error',watchError);
     msgEl.innerHTML+='<div class="notice">GitHubへの更新は成功しました。ビルド状況は手動更新でも確認できます。</div>';
   }
 }catch(e){
   msgEl.innerHTML='<div class="notice error">'+esc(e?.message||'通信エラーでアップロードできませんでした。')+'</div>';
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

function zipNotice(t,c){
 const e=document.getElementById('zipUploadMsg');
 if(e)e.innerHTML='<div class="notice '+(c||'')+'">'+esc(t)+'</div>';
}
function readU16(v,o){return v.getUint16(o,true)}
function readU32(v,o){return v.getUint32(o,true)}
async function inflateRaw(bytes){
 if(typeof DecompressionStream!=='function')throw new Error('このブラウザはZIP展開に対応していません');
 let ds;
 try{ds=new DecompressionStream('deflate-raw')}catch(_){throw new Error('このブラウザではZIPの圧縮方式を展開できません')}
 const ab=await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
 return new Uint8Array(ab);
}
async function unzipBrowser(file){
 const buf=await file.arrayBuffer();
 const u8=new Uint8Array(buf),v=new DataView(buf);
 let eocd=-1;
 for(let i=u8.length-22;i>=Math.max(0,u8.length-65557);i--){
   if(readU32(v,i)===0x06054b50){eocd=i;break}
 }
 if(eocd<0)throw new Error('ZIPの終端情報が見つかりません');
 const count=readU16(v,eocd+10);
 const cdOffset=readU32(v,eocd+16);
 const decoder=new TextDecoder('utf-8');
 const entries=[];
 let p=cdOffset;
 for(let n=0;n<count;n++){
   if(readU32(v,p)!==0x02014b50)throw new Error('ZIPのファイル一覧を読み取れません');
   const method=readU16(v,p+10);
   const compSize=readU32(v,p+20);
   const uncompSize=readU32(v,p+24);
   const nameLen=readU16(v,p+28);
   const extraLen=readU16(v,p+30);
   const commentLen=readU16(v,p+32);
   const localOffset=readU32(v,p+42);
   const name=decoder.decode(u8.slice(p+46,p+46+nameLen)).replace(/\\/g,'/');
   p+=46+nameLen+extraLen+commentLen;
   if(!name || name.endsWith('/') || name.startsWith('__MACOSX/') || name.split('/').some(x=>x==='..'))continue;
   if(readU32(v,localOffset)!==0x04034b50)throw new Error('ZIP内ファイルを読み取れません');
   const ln=readU16(v,localOffset+26),le=readU16(v,localOffset+28);
   const dataStart=localOffset+30+ln+le;
   const compressed=u8.slice(dataStart,dataStart+compSize);
   let data;
   if(method===0)data=compressed;
   else if(method===8)data=await inflateRaw(compressed);
   else throw new Error('未対応のZIP圧縮方式です（方式 '+method+'）');
   if(uncompSize && data.length!==uncompSize)throw new Error(name+' の展開サイズが一致しません');
   entries.push({name,data});
 }
 if(!entries.length)throw new Error('ZIP内に更新できるファイルがありません');

 // Strip one common top-level folder, e.g. lomita-xxx-v1.09/worker.js -> worker.js
 const firstParts=entries.map(e=>e.name.split('/'));
 const commonRoot=firstParts.every(a=>a.length>1 && a[0]===firstParts[0][0]) ? firstParts[0][0] : '';
 return entries.map(e=>({
   path: commonRoot ? e.name.slice(commonRoot.length+1) : e.name,
   data:e.data
 })).filter(e=>e.path && !e.path.endsWith('/'));
}
async function uploadZipToGitHub(){
 const input=document.getElementById('zipFile');
 const btn=document.getElementById('zipUploadBtn');
 const file=input?.files?.[0];
 if(!file){zipNotice('ZIPファイルを選択してください','error');return}
 btn.disabled=true;btn.textContent='ZIPを展開中...';
 try{
   const entries=await unzipBrowser(file);
   if(entries.length>30)throw new Error('一度に更新できるファイルは30個までです');
   const total=entries.reduce((s,e)=>s+e.data.length,0);
   if(total>10*1024*1024)throw new Error('展開後の合計サイズは10MB以下にしてください');

   btn.textContent='GitHubへ更新中...';
   const form=new FormData();
   entries.forEach((e,i)=>{
     form.append('files',new File([e.data],e.path.split('/').pop()||('file'+i)));
     form.append('paths',e.path);
   });
   form.append('message','admin zip update: '+file.name);

   const headers={};
   if(adminPassword)headers['x-admin-password']=adminPassword;
   const r=await fetch('/api/admin/github/upload-zip-contents',{method:'POST',headers,body:form});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||'GitHub更新に失敗しました');
   zipNotice('ZIP内 '+Number(d.updated||entries.length)+' ファイルをGitHubへ更新しました。Cloudflareのビルドを確認してください。','success');
   input.value='';
   const info=document.getElementById('zipFileInfo');
   if(info)info.textContent='ZIP未選択';
   loadBuildStatus(true);
 }catch(e){
   zipNotice(String(e?.message||e),'error');
 }finally{
   btn.disabled=false;btn.textContent='ZIPの中身をGitHubへ更新';
 }
}
document.getElementById('zipFile')?.addEventListener('change',e=>{
 const f=e.target.files?.[0];
 const info=document.getElementById('zipFileInfo');
 if(info)info.textContent=f?f.name+' / '+Math.ceil(f.size/1024)+'KB':'ZIP未選択';
});

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
    try{startBuildWatch()}catch(watchError){
      console.error('build watch error',watchError);
      out.innerHTML+='<div class="notice">GitHubへのアップロードは成功しました。ビルド状況は上の「更新」ボタンで確認できます。</div>';
    }
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
  if(buildTimer){clearInterval(buildTimer);buildTimer=null}
  loadBuildStatus().catch?.(()=>{});
  buildTimer=setInterval(()=>{loadBuildStatus().catch?.(()=>{})},5000);
  setTimeout(()=>{if(buildTimer){clearInterval(buildTimer);buildTimer=null}},120000);
}
document.getElementById('workerUploadBtn')?.addEventListener('click',uploadAsWorker);
document.getElementById('gitFile')?.addEventListener('change',updateFileInfo);
document.getElementById('adminLoginBtn')?.addEventListener('click',login);
document.getElementById('password')?.addEventListener('keydown',e=>{if(e.key==='Enter')login()});
restoreAdmin();
`;

async function handle(request, env) {
 const url=new URL(request.url), path=url.pathname, method=request.method;
 const adminPass=env.ADMIN_PASSWORD || "lomita2026";
 if(path==="/api/version" && method==="GET") return json({version:APP_VERSION});
 const getAdminRole=async()=>{
   if(request.headers.get("x-admin-password")===adminPass)return "owner";
   return await getAdminSessionRole(request,adminPass);
 };
 const isAdmin=async()=>Boolean(await getAdminRole());
 const isOwnerAdmin=async()=>await getAdminRole()==="owner";
 if(path==="/api/auth/discord/config" && method==="GET"){
   return json({enabled:discordConfigured(env)});
 }

 if(path==="/auth/discord" && method==="GET"){
   if(!discordConfigured(env))return new Response("Discord login is not configured",{status:503});
   const role="trainee";
   const state=randomToken(18);
   const authorize=new URL("https://discord.com/oauth2/authorize");
   authorize.searchParams.set("client_id",env.DISCORD_CLIENT_ID);
   authorize.searchParams.set("response_type","code");
   authorize.searchParams.set("redirect_uri",discordRedirectUri(request));
   authorize.searchParams.set("scope","identify");
   authorize.searchParams.set("state",state);
   return new Response(null,{status:302,headers:{
     location:authorize.toString(),
     "set-cookie":"discord_oauth_state="+encodeURIComponent(state+"."+role)+"; Max-Age=600; HttpOnly; Secure; SameSite=Lax; Path=/"
   }});
 }

 if(path==="/auth/discord/callback" && method==="GET"){
   if(!discordConfigured(env))return new Response("Discord login is not configured",{status:503});
   const codeValue=url.searchParams.get("code")||"";
   const state=url.searchParams.get("state")||"";
   const saved=cookieValue(request,"discord_oauth_state");
   const parts=saved.split(".");
   const savedState=parts[0]||"";
   const role="trainee";
   if(!codeValue||!state||!savedState||state!==savedState)return new Response("Invalid Discord OAuth state",{status:400});
   try{
     const accessToken=await discordExchangeCode(request,env,codeValue);
     const du=await discordCurrentUser(accessToken);

     await ensureTraineeProfiles(env);
     let p=await env.DB.prepare("SELECT id,player_name,login_name,discord_id,affiliation,rank FROM trainee_profiles WHERE discord_user_id=?").bind(String(du.id)).first();
     if(!p){
       const display=String(du.global_name||du.username||("Discord "+du.id)).trim();
       const loginName="discord:"+String(du.id);
       const r=await env.DB.prepare("INSERT INTO trainee_profiles(player_name,discord_id,login_name,discord_user_id,affiliation,rank,password_hash,password_salt) VALUES(?,?,?,?,?,?,?,?)")
         .bind(display,String(du.id),loginName,String(du.id),"","","","").run();
       p={id:Number(r.meta?.last_row_id||0),player_name:display,login_name:loginName,discord_id:String(du.id),affiliation:"",rank:""};
     }
     const traineeCookie=await createTraineeSessionCookie(env,p.id);
     return new Response(null,{status:302,headers:{location:"/trainee","set-cookie":traineeCookie}});
   }catch(e){
     return new Response("Discordログインに失敗しました: "+String(e?.message||e),{status:500,headers:{"content-type":"text/plain; charset=utf-8"}});
   }
 }



 if(path==="/" && method==="GET") return html("研修予約システム",LANDING_BODY,"");
 if(path==="/trainee" && method==="GET") return html("研修生ページ",PUBLIC_BODY,PUBLIC_SCRIPT);
 if(path==="/admin" && method==="GET") return html("研修管理",ADMIN_BODY,ADMIN_SCRIPT);

 // The configured training title is the source of truth for trainee-facing subject names.
 // Never overwrite trainings.title from training_programs.name.
 if(path==="/api/trainings" && method==="GET"){
   try{
     await ensureTrainingPrograms(env);
     const profile=await getTraineeSession(request,env);
     if(!profile)return json({error:"ログインが必要です"},401);
     const key=String(profile.discord_id||profile.login_name||profile.player_name||"").trim();

     const {results:programs}=await env.DB.prepare("SELECT p.id,p.training_id,t.title,COALESCE(NULLIF(t.description,''),p.description) AS description FROM training_programs p JOIN trainings t ON t.id=p.training_id WHERE p.active=1 AND p.training_id IS NOT NULL ORDER BY p.sort_order,p.id").all();
     const {results:history}=await env.DB.prepare("SELECT training_id,status FROM reservations WHERE lower(trim(COALESCE(discord_id,'')))=lower(trim(?)) ORDER BY id DESC").bind(key).all();

     const latestByTraining=new Map();
     for(const h of (history||[])){const tid=Number(h.training_id);if(!latestByTraining.has(tid))latestByTraining.set(tid,String(h.status||""))}
     for(const p of (programs||[])){
       const tid=Number(p.training_id),status=latestByTraining.get(tid)||"";
       if(status==="completed")continue;
       if(status==="pending"||status==="reserved")return json([{id:tid,title:p.title,description:p.description,current_status:status,already_applied:true}]);
       return json([{id:tid,title:p.title,description:p.description,current_status:status,already_applied:false}]);
     }
     return json([]);
   }catch(e){
     return json({error:"研修を取得できませんでした",detail:String(e?.message||e)},500);
   }
 }


 if(path==="/api/trainee/session" && method==="GET"){
   const p=await getTraineeSession(request,env);
   if(!p)return json({error:"ログインが必要です"},401);
   return json({ok:true,profile:p});
 }

 if(path==="/api/trainee/logout" && method==="POST"){
   return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json; charset=utf-8","set-cookie":"lomita_trainee=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/"}});
 }

 if(path==="/api/trainee/progress" && method==="GET"){
   await ensureTrainingPrograms(env);
   await ensureReservationInstructor(env);
   const profile=await getTraineeSession(request,env);
   if(!profile)return json({error:"ログインが必要です"},401);
   const key=String(profile.discord_id||profile.login_name||profile.player_name||"").trim();

   const q=await env.DB.prepare(`
     SELECT
       p.id AS program_id,
       p.training_id,
       COALESCE(t.title,p.name) AS title,
       COALESCE((
         SELECT r.status
         FROM reservations r
         WHERE r.training_id=p.training_id
           AND lower(trim(COALESCE(r.discord_id,'')))=lower(trim(?))
           AND r.status='completed'
         ORDER BY r.id DESC
         LIMIT 1
       ),'') AS status,
       COALESCE((
         SELECT r.assigned_instructor
         FROM reservations r
         WHERE r.training_id=p.training_id
           AND lower(trim(COALESCE(r.discord_id,'')))=lower(trim(?))
           AND r.status='completed'
         ORDER BY r.id DESC
         LIMIT 1
       ),'') AS assigned_instructor
     FROM training_programs p
     LEFT JOIN trainings t ON t.id=p.training_id
     WHERE COALESCE(p.active,1)=1
     ORDER BY COALESCE(p.sort_order,0),p.id
   `).bind(key,key).all();

   return json({programs:Array.isArray(q?.results)?q.results:[]});
 }

 if(path==="/api/trainee/profile" && method==="GET"){
   await ensureReservationInstructor(env);
   await ensureReservationPreferredSchedule(env);
   const profile=await getTraineeSession(request,env);
   if(!profile)return json({error:"ログインが必要です"},401);
   const key=String(profile.discord_id||profile.login_name||profile.player_name||"").trim();
   const q=await env.DB.prepare("SELECT r.id,r.training_id,r.player_name,r.discord_id,r.affiliation,r.note,r.status,r.assigned_instructor,r.preferred_date,r.preferred_time,r.preferred_date2,r.preferred_time2,r.preferred_date3,r.preferred_time3,r.confirmed_date,r.confirmed_time,r.confirmed_preference,t.title FROM reservations r JOIN trainings t ON t.id=r.training_id WHERE lower(trim(COALESCE(r.discord_id,'')))=lower(trim(?)) ORDER BY r.id DESC").bind(key).all();
   const results=Array.isArray(q?.results)?q.results:[];
   const stats={pending:0,reserved:0,completed:0,absent:0,cancelled:0};
   for(const x of results)if(stats[x.status]!==undefined)stats[x.status]++;
   return json({profile,stats,history:results});
 }
 if(path==="/api/reservations" && method==="POST"){
   await ensureReservationPreferredSchedule(env);
   const profile=await getTraineeSession(request,env);
   if(!profile)return json({error:"ログインが必要です"},401);
   const b=await request.json().catch(()=>({}));
   const trainingId=Number(b.training_id);
   if(!trainingId)return json({error:"研修が選択されていません"},400);
   const preferredDate=String(b.preferred_date||"").trim(), preferredTime=String(b.preferred_time||"").trim();
   const preferredDate2=String(b.preferred_date2||"").trim(), preferredTime2=String(b.preferred_time2||"").trim();
   const preferredDate3=String(b.preferred_date3||"").trim(), preferredTime3=String(b.preferred_time3||"").trim();
   if(!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)||!/^\d{2}:\d{2}$/.test(preferredTime))return json({error:"第1希望の日時は必ず入力してください"},400);
   if((preferredDate2||preferredTime2)&&(!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate2)||!/^\d{2}:\d{2}$/.test(preferredTime2)))return json({error:"第2希望は日付と時間を両方入力してください"},400);
   if((preferredDate3||preferredTime3)&&(!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate3)||!/^\d{2}:\d{2}$/.test(preferredTime3)))return json({error:"第3希望は日付と時間を両方入力してください"},400);
   const key=String(profile.discord_id||profile.login_name||profile.player_name||"").trim();
   const t=await env.DB.prepare("SELECT id FROM trainings WHERE id=?").bind(trainingId).first();
   if(!t)return json({error:"研修が見つかりません"},404);
   const dup=await env.DB.prepare("SELECT id,status FROM reservations WHERE training_id=? AND lower(trim(COALESCE(discord_id,'')))=lower(trim(?)) AND status IN ('pending','reserved','completed') ORDER BY id DESC LIMIT 1").bind(trainingId,key).first();
   if(dup)return json({error:dup.status==="completed"?"この研修は受講済みです":"すでに申請済みです"},409);
   await env.DB.prepare("INSERT INTO reservations(training_id,player_name,discord_id,affiliation,note,status,preferred_date,preferred_time,preferred_date2,preferred_time2,preferred_date3,preferred_time3) VALUES(?,?,?,?,?,'pending',?,?,?,?,?,?)").bind(trainingId,profile.player_name,key,"",String(b.note||"").trim(),preferredDate,preferredTime,preferredDate2,preferredTime2,preferredDate3,preferredTime3).run();
   return json({ok:true},201);
 }

 if(path==="/api/admin/login" && method==="POST"){
   const b=await request.json().catch(()=>({}));
   if(String(b.password||"")!==adminPass)return json({error:"unauthorized"},401);
   const expires=String(Date.now()+12*60*60*1000);
   const role="owner";
   const sig=await adminSessionSignature(adminPass,expires,role);
   return new Response(JSON.stringify({ok:true,expires:Number(expires),role}),{
     status:200,
     headers:{
       "content-type":"application/json; charset=utf-8",
       "cache-control":"no-store",
       "set-cookie":"lomita_admin="+encodeURIComponent(expires+"."+role+"."+sig)+"; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Strict"
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

 let traineeCancelMatch=path.match(/^\/api\/trainee\/reservations\/(\d+)\/cancel$/);
 if(traineeCancelMatch && method==="POST"){
   const profile=await getTraineeSession(request,env);
   if(!profile)return json({error:"ログインが必要です"},401);
   const key=String(profile.discord_id||profile.login_name||profile.player_name||"").trim();
   const row=await env.DB.prepare("SELECT id,status FROM reservations WHERE id=? AND lower(trim(COALESCE(discord_id,'')))=lower(trim(?))").bind(Number(traineeCancelMatch[1]),key).first();
   if(!row)return json({error:"申請が見つかりません"},404);
   if(!["pending","reserved"].includes(row.status))return json({error:"この申請はキャンセルできません"},409);
   await env.DB.prepare("UPDATE reservations SET status='cancelled' WHERE id=?").bind(row.id).run();
   return json({ok:true});
 }

 if(path==="/api/admin/role" && method==="GET"){
   const role=await getAdminRole();
   if(!role)return json({error:"unauthorized"},401);
   return json({ok:true,role,can_github:role==="owner"});
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
   await ensureTrainingPrograms(env);
   const {results:profiles}=await env.DB.prepare("SELECT id,player_name,login_name,discord_id,affiliation,rank FROM trainee_profiles ORDER BY player_name COLLATE NOCASE").all();
   const {results:programs}=await env.DB.prepare("SELECT training_id,name,sort_order FROM training_programs WHERE active=1 AND training_id IS NOT NULL ORDER BY sort_order,id").all();
   const out=[];
   for(const p of (profiles||[])){
     const key=String(p.discord_id||p.login_name||p.player_name||"").trim();
     const {results:hist}=await env.DB.prepare("SELECT id,training_id,status FROM reservations WHERE lower(trim(COALESCE(discord_id,'')))=lower(trim(?)) ORDER BY id DESC").bind(key).all();
     const latest=new Map();
     for(const h of (hist||[])){if(!latest.has(Number(h.training_id)))latest.set(Number(h.training_id),h)}
     let completed=0,current="";
     for(const pr of (programs||[])){
       const h=latest.get(Number(pr.training_id));
       if(h?.status==="completed"){completed++;continue}
       current=pr.name;break;
     }
     let pending=0,reserved=0,absent=0,cancelled=0;
     for(const h of (hist||[])){
       if(h.status==="pending")pending++;
       else if(h.status==="reserved")reserved++;
       else if(h.status==="absent")absent++;
       else if(h.status==="cancelled")cancelled++;
     }
     const totalPrograms=(programs||[]).length;
     out.push({...p,total:(hist||[]).length,pending,reserved,completed,absent,cancelled,progress_completed:completed,progress_total:totalPrograms,progress_percent:totalPrograms?Math.round(completed/totalPrograms*100):0,current_training:current});
   }
   return json(out);
 }

 let traineeDeleteMatch=path.match(/^\/api\/admin\/trainees\/(\d+)$/);
 if(traineeDeleteMatch && method==="DELETE"){
   await ensureTraineeProfiles(env);
   const p=await env.DB.prepare("SELECT id,player_name,login_name,discord_id FROM trainee_profiles WHERE id=?").bind(Number(traineeDeleteMatch[1])).first();
   if(!p)return json({error:"研修生が見つかりません"},404);
   const key=String(p.discord_id||p.login_name||p.player_name||"").trim();
   await env.DB.prepare("DELETE FROM reservations WHERE lower(trim(COALESCE(discord_id,'')))=lower(trim(?))").bind(key).run();
   await env.DB.prepare("DELETE FROM trainee_profiles WHERE id=?").bind(Number(traineeDeleteMatch[1])).run();
   return json({ok:true});
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

 if(path==="/api/admin/reservation-control" && method==="GET"){
   if(!(await isAdmin()))return json({error:"unauthorized"},401);
   await ensureReservationInstructor(env);
   await ensureReservationPreferredSchedule(env);
   const {results}=await env.DB.prepare(`
     SELECT
       r.id,
       r.training_id,
       r.player_name,
       r.discord_id,
       r.affiliation,
       r.note,
       r.status,
       r.assigned_instructor,
       r.preferred_date,
       r.preferred_time,
       r.preferred_date2,
       r.preferred_time2,
       r.preferred_date3,
       r.preferred_time3,
       r.confirmed_date,
       r.confirmed_time,
       r.confirmed_preference,
       r.created_at,
       t.title,
       t.training_date,
       t.start_time,
       t.instructor
     FROM reservations r
     JOIN trainings t ON t.id=r.training_id
     WHERE r.status IN ('pending','reserved','completed','absent')
     ORDER BY
       CASE r.status WHEN 'pending' THEN 0 WHEN 'reserved' THEN 1 WHEN 'completed' THEN 2 WHEN 'absent' THEN 3 ELSE 4 END,
       CASE WHEN t.training_date IS NULL OR t.training_date='' THEN 1 ELSE 0 END,
       t.training_date ASC,
       t.start_time ASC,
       r.id DESC
   `).all();
   return json(results||[]);
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
   const {results:programs}=await env.DB.prepare(`
     SELECT
       p.*,
       COALESCE(NULLIF(TRIM(t.title),''), p.name) AS display_name,
       COALESCE(t.description, p.description, '') AS display_description
     FROM training_programs p
     LEFT JOIN trainings t ON t.id=p.training_id
     ORDER BY p.sort_order,p.id
   `).all();
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

   const mx=await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) n FROM training_programs").first();
   const r=await env.DB.prepare("INSERT INTO training_programs(name,description,training_id,sort_order) VALUES(?,?,?,?)")
     .bind(name,description,trainingId,Number(mx?.n||0)+1).run();
   return json({ok:true,id:r.meta?.last_row_id||null,training_id:trainingId},201);
 }
 let pmove=path.match(/^\/api\/admin\/programs\/(\d+)\/move$/);
 if(pmove && method==="POST"){
   await ensureTrainingPrograms(env);
   const b=await request.json().catch(()=>({}));
   const dir=Number(b.direction)===-1?-1:1;
   const cur=await env.DB.prepare("SELECT id,sort_order FROM training_programs WHERE id=?").bind(Number(pmove[1])).first();
   if(!cur)return json({error:"研修プログラムが見つかりません"},404);
   const other=await env.DB.prepare(
     dir<0
      ?"SELECT id,sort_order FROM training_programs WHERE sort_order<? ORDER BY sort_order DESC,id DESC LIMIT 1"
      :"SELECT id,sort_order FROM training_programs WHERE sort_order>? ORDER BY sort_order ASC,id ASC LIMIT 1"
   ).bind(Number(cur.sort_order||0)).first();
   if(!other)return json({ok:true});
   await env.DB.batch([
     env.DB.prepare("UPDATE training_programs SET sort_order=? WHERE id=?").bind(other.sort_order,cur.id),
     env.DB.prepare("UPDATE training_programs SET sort_order=? WHERE id=?").bind(cur.sort_order,other.id)
   ]);
   return json({ok:true});
 }

 let pm=path.match(/^\/api\/admin\/programs\/(\d+)$/);
 if(pm && method==="PATCH"){
   await ensureTrainingPrograms(env);
   const id=Number(pm[1]);
   const b=await request.json().catch(()=>({}));
   const name=String(b.name||"").trim();
   const description=String(b.description||"").trim();
   if(!name)return json({error:"研修名は必須です"},400);
   const p=await env.DB.prepare("SELECT id,training_id FROM training_programs WHERE id=?").bind(id).first();
   if(!p)return json({error:"研修プログラムが見つかりません"},404);
   await env.DB.prepare("UPDATE training_programs SET name=?,description=? WHERE id=?").bind(name,description,id).run();
   if(p.training_id){
     await env.DB.prepare("UPDATE trainings SET title=?,description=? WHERE id=?").bind(name,description,Number(p.training_id)).run();
   }
   return json({ok:true,name,description});
 }
 pm=path.match(/^\/api\/admin\/programs\/(\d+)$/);
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
       COALESCE(SUM(CASE WHEN r.status IN ('pending','reserved') THEN 1 ELSE 0 END),0) active_count,
       COALESCE(SUM(CASE WHEN r.status='pending' THEN 1 ELSE 0 END),0) pending_count
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
   await ensureReservationPreferredSchedule(env);
   await ensureReservationInstructor(env);
   const {results}=await env.DB.prepare("SELECT * FROM reservations WHERE training_id=? ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'reserved' THEN 1 ELSE 2 END, created_at").bind(Number(m[1])).all(); return json(results);
 }

 m=path.match(/^\/api\/admin\/reservations\/(\d+)$/);
 if(m && method==="DELETE"){
   await env.DB.prepare("DELETE FROM reservations WHERE id=?").bind(Number(m[1])).run();
   return json({ok:true});
 }
 if(m && method==="PATCH"){
   await ensureReservationInstructor(env);
   await ensureReservationPreferredSchedule(env);
   await ensureInstructors(env);
   const b=await request.json().catch(()=>({}));
   if(!['pending','reserved','completed','absent','cancelled'].includes(b.status))return json({error:"invalid status"},400);
   const assigned=String(b.assigned_instructor||"").trim();
   const confirmedPreference=Number(b.confirmed_preference||0);
   if(b.status==="reserved" && ![1,2,3].includes(confirmedPreference))return json({error:"承認する希望日時を選択してください"},400);
   if(b.status==="reserved" && !assigned)return json({error:"担当教官を選択してください"},400);
   if(assigned){
     const ok=await env.DB.prepare("SELECT id FROM instructors WHERE lower(trim(name))=lower(trim(?))").bind(assigned).first();
     if(!ok)return json({error:"登録されていない教官です"},400);
   }
   let confirmedDate="",confirmedTime="",confirmedPref=0;
   if(b.status==="reserved"){
     const row=await env.DB.prepare("SELECT preferred_date,preferred_time,preferred_date2,preferred_time2,preferred_date3,preferred_time3 FROM reservations WHERE id=?").bind(Number(m[1])).first();
     if(!row)return json({error:"予約が見つかりません"},404);
     const map={1:[row.preferred_date,row.preferred_time],2:[row.preferred_date2,row.preferred_time2],3:[row.preferred_date3,row.preferred_time3]};
     const chosen=map[confirmedPreference]||["",""];
     confirmedDate=String(chosen[0]||"").trim();
     confirmedTime=String(chosen[1]||"").trim();
     if(!confirmedDate||!confirmedTime)return json({error:"選択した希望日時が入力されていません"},400);
     confirmedPref=confirmedPreference;
   }else{
     const existing=await env.DB.prepare("SELECT confirmed_date,confirmed_time,confirmed_preference FROM reservations WHERE id=?").bind(Number(m[1])).first();
     confirmedDate=String(existing?.confirmed_date||"");
     confirmedTime=String(existing?.confirmed_time||"");
     confirmedPref=Number(existing?.confirmed_preference||0);
   }
   await env.DB.prepare("UPDATE reservations SET status=?,assigned_instructor=?,confirmed_date=?,confirmed_time=?,confirmed_preference=? WHERE id=?")
     .bind(b.status,assigned,confirmedDate,confirmedTime,confirmedPref,Number(m[1])).run();
   return json({ok:true,confirmed_date:confirmedDate,confirmed_time:confirmedTime,confirmed_preference:confirmedPref});
 }

 if(path==="/api/admin/github/upload-zip-contents" && method==="POST"){
   if(!(await isOwnerAdmin()))return json({error:"システム管理者のみ利用できます"},403);
   if(!env.GITHUB_TOKEN)return json({error:"Cloudflareに GITHUB_TOKEN が設定されていません"},500);

   const form=await request.formData();
   const files=form.getAll("files").filter(f=>f && typeof f.arrayBuffer==="function");
   const paths=form.getAll("paths").map(x=>String(x||"").replace(/^\/+/,""));
   const message=String(form.get("message")||"admin zip update").trim().slice(0,120);

   if(!files.length)return json({error:"ZIP内ファイルがありません"},400);
   if(files.length!==paths.length)return json({error:"ZIPファイル情報が一致しません"},400);
   if(files.length>30)return json({error:"一度に更新できるファイルは30個までです"},413);

   let total=0;
   for(const f of files)total+=Number(f.size||0);
   if(total>10*1024*1024)return json({error:"展開後の合計サイズは10MB以下にしてください"},413);

   for(const p of paths){
     if(!p || p.endsWith("/") || p.split("/").some(x=>x===".."||x===""))return json({error:"ZIP内の保存先パスが不正です"},400);
     if(p.startsWith(".git/") || p===".git")return json({error:".git 配下は更新できません"},400);
   }

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

   const updated=[];
   for(let i=0;i<files.length;i++){
     const file=files[i], target=paths[i];
     const encodedPath=target.split("/").map(encodeURIComponent).join("/");
     const currentRes=await fetch(base+"/contents/"+encodedPath+"?ref="+encodeURIComponent(branch),{headers});
     let sha="";
     if(currentRes.ok){
       const current=await currentRes.json().catch(()=>({}));
       sha=current.sha||"";
     }else if(currentRes.status!==404){
       const err=await currentRes.json().catch(()=>({}));
       return json({error:(err.message||"GitHub上の現在ファイルを確認できません")+" : "+target},currentRes.status);
     }

     const bytes=new Uint8Array(await file.arrayBuffer());
     let binary="";
     for(let o=0;o<bytes.length;o+=0x8000){
       binary+=String.fromCharCode(...bytes.subarray(o,o+0x8000));
     }
     const body={
       message:message+" ["+(i+1)+"/"+files.length+"]",
       content:btoa(binary),
       branch
     };
     if(sha)body.sha=sha;

     const putRes=await fetch(base+"/contents/"+encodedPath,{
       method:"PUT",headers,body:JSON.stringify(body)
     });
     const result=await putRes.json().catch(()=>({}));
     if(!putRes.ok)return json({error:(result.message||"GitHub更新に失敗しました")+" : "+target},putRes.status);
     updated.push(target);
   }
   return json({ok:true,updated:updated.length,files:updated});
 }

if(path==="/api/admin/github/upload-worker" && method==="POST"){
   if(!(await isOwnerAdmin()))return json({error:"システム管理者のみ利用できます"},403);
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
   if(!(await isOwnerAdmin()))return json({error:"システム管理者のみ利用できます"},403);
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
