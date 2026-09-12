import core from "./worker.js";

/*
  Version 2.36 instructor slot sync fix

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

const HOTFIX_VERSION = "2.36";

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




// v2.20: 管理メニューに依存しない常設ランチャー
(async()=>{
  if(document.getElementById('testTraineeLauncher220'))return;
  try{
    const auth=await fetch('/api/admin/check',{cache:'no-store'});
    if(!auth.ok)return;
  }catch(_){return;}

  const btn=document.createElement('button');
  btn.id='testTraineeLauncher220';
  btn.textContent='🧪 テスト研修生';
  btn.style.cssText='position:fixed;right:10px;bottom:86px;z-index:10020;border:0;border-radius:999px;background:#173e69;color:#fff;padding:9px 12px;font-weight:1000;font-size:10px;box-shadow:0 6px 18px rgba(13,43,73,.28)';
  btn.style.display='none';
  document.body.appendChild(btn);

  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const openModal=async()=>{
    let modal=document.getElementById('testTraineeModal220');
    if(modal){modal.remove();return;}
    modal=document.createElement('div');
    modal.id='testTraineeModal220';
    modal.style.cssText='position:fixed;inset:0;z-index:10030;background:rgba(6,24,43,.58);display:flex;align-items:flex-end;justify-content:center;padding:12px';
    modal.innerHTML='<div style="width:min(100%,560px);max-height:82vh;overflow:auto;background:#f7f9fc;border:1px solid #d4dfeb;border-radius:18px 18px 12px 12px;padding:12px;box-shadow:0 18px 50px #0005">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><b style="font-size:17px">🧪 テスト研修生</b><div style="font-size:10px;color:#718397;margin-top:2px">申請・予約・アンケート・期限確認用</div></div><button id="ttClose220" style="border:1px solid #ccd8e4;background:#fff;border-radius:9px;padding:7px 10px;font-weight:900">閉じる</button></div>'+
      '<div id="ttModalBody220" style="margin-top:10px;background:#fff;border:1px solid #dbe4ed;border-radius:11px;padding:9px;font-size:11px">読み込み中...</div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#ttClose220').onclick=()=>modal.remove();
    modal.onclick=e=>{if(e.target===modal)modal.remove();};
    const body=modal.querySelector('#ttModalBody220');

    const refresh=async()=>{
      try{
        const r=await fetch('/api/admin/test-trainee',{cache:'no-store'});
        const d=await r.json();
        if(!d.found){
          body.innerHTML='<div style="color:#718397">テスト研修生はまだありません。</div><button id="ttCreate220" style="margin-top:9px;width:100%;border:0;border-radius:10px;background:#0b2d52;color:#fff;padding:10px;font-weight:1000">テスト研修生を作成</button>';
          body.querySelector('#ttCreate220').onclick=async()=>{
            const b=body.querySelector('#ttCreate220');b.disabled=true;b.textContent='作成中...';
            try{
              const rr=await fetch('/api/admin/test-trainee/create',{method:'POST'});
              const x=await rr.json();
              if(x.password){alert('テスト研修生を作成しました\\n\\nログイン名：'+x.login_name+'\\nパスワード：'+x.password+'\\n\\n必ず控えてください。');}
              else if(x.existing){alert('既存のテスト研修生があります。');}
              else if(x.error){alert(x.error);}
              await refresh();
            }finally{b.disabled=false;}
          };
          return;
        }
        body.innerHTML='<div style="padding:9px;border-radius:10px;background:#f4f8fc;border:1px solid #dbe6f0">'+
          '<div><span style="display:inline-block;padding:2px 6px;border-radius:999px;background:#eaf3ff;border:1px solid #a9c4e8;color:#194e85;font-size:9px;font-weight:1000">TEST</span> <b>'+esc(d.player_name||'テスト研修生')+'</b></div>'+
          '<div style="margin-top:6px">ログイン名：<b>'+esc(d.login_name||'')+'</b></div>'+
          '<div style="margin-top:9px;display:grid;grid-template-columns:1fr 1fr;gap:6px">'+
            '<button id="ttPass220" style="padding:8px;border:1px solid #cfdbe7;border-radius:9px;background:#fff;font-weight:900">パスワード再発行</button>'+
            '<button id="ttReset220" style="padding:8px;border:1px solid #d6b352;border-radius:9px;background:#fffdf4;font-weight:900">進捗リセット</button>'+
            '<button id="ttDelete220" style="grid-column:1/3;padding:8px;border:1px solid #df9992;border-radius:9px;background:#fff8f7;color:#9c3229;font-weight:900">テスト研修生を削除</button>'+
          '</div></div>';
        body.querySelector('#ttPass220').onclick=async()=>{
          const rr=await fetch('/api/admin/test-trainee/reissue-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:d.id})});
          const x=await rr.json(); if(x.password)alert('新しいパスワード\\n\\n'+x.password+'\\n\\n必ず控えてください。'); else alert(x.error||'失敗しました');
        };
        body.querySelector('#ttReset220').onclick=async()=>{
          if(!confirm('テスト研修生を初期状態に戻しますか？'))return;
          const rr=await fetch('/api/admin/test-trainee/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:d.id})});
          const x=await rr.json();alert(x.ok?'初期状態に戻しました':(x.error||'失敗しました'));
        };
        body.querySelector('#ttDelete220').onclick=async()=>{
          if(!confirm('テスト研修生を削除しますか？'))return;
          const rr=await fetch('/api/admin/test-trainee/delete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:d.id})});
          const x=await rr.json(); if(x.ok){alert('削除しました');await refresh();} else alert(x.error||'削除に失敗しました');
        };
      }catch(_){body.textContent='テスト研修生情報を取得できませんでした';}
    };
    await refresh();
  };
  btn.onclick=openModal;
})();





// v2.25: 「予約一覧」直下の空き時間登録は管理者画面だけ
(async()=>{
  try{
    const adminCheck=await fetch('/api/admin/check',{cache:'no-store',credentials:'same-origin'});
    if(!adminCheck.ok)return;
  }catch(_){return;}
  const txt=(document.body?.innerText||'');
  if(/研修生ポータル|TRAINEE PORTAL/.test(txt) && !/研修管理本部|システム管理者|ADMIN TOOLS/.test(txt))return;

  const visible=el=>{
    if(!el||!el.isConnected)return false;
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return r.width>0 && r.height>0 && s.display!=='none' && s.visibility!=='hidden';
  };

  function findReservationButton(){
    const buttons=[...document.querySelectorAll('button,a,[role="button"]')].filter(visible);
    return buttons.find(el=>(el.textContent||'').trim()==='予約一覧') ||
           buttons.find(el=>/予約一覧/.test((el.textContent||'').trim()));
  }

  function mountAvailabilityMenu(){
    if(document.getElementById('availabilityMenu224'))return true;
    const reservationBtn=findReservationButton();
    if(!reservationBtn)return false;

    const btn=document.createElement('button');
    btn.id='availabilityMenu224';
    btn.type='button';
    btn.innerHTML='<span style="font-size:14px">📅</span> 空き時間を登録';
    btn.style.cssText=
      'width:100%;min-height:56px;border:1px solid #cfd9e5;border-radius:14px;'+
      'background:#fff;color:#102b47;font-weight:1000;font-size:13px;'+
      'box-shadow:0 3px 10px rgba(20,45,70,.05);';

    btn.onclick=()=>{
      if(typeof window.openInstructorAvailability221==='function'){
        window.openInstructorAvailability221();
      }else{
        alert('空き時間管理を読み込み中です。もう一度押してください。');
      }
    };

    const cell=reservationBtn.parentElement;
    const grid=cell?.parentElement;

    // 予約一覧が2列メニュー内なら、その直下の次行に横幅いっぱいで追加。
    if(grid && getComputedStyle(grid).display==='grid'){
      const wrap=document.createElement('div');
      wrap.id='availabilityMenu224Wrap';
      wrap.style.cssText='grid-column:1/-1';
      wrap.appendChild(btn);
      cell.insertAdjacentElement('afterend',wrap);
    }else{
      reservationBtn.insertAdjacentElement('afterend',btn);
      btn.style.marginTop='8px';
    }
    return true;
  }

  mountAvailabilityMenu();
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    const ok=mountAvailabilityMenu();
    if(ok||tries>120)clearInterval(timer);
  },500);

  const ob=new MutationObserver(()=>mountAvailabilityMenu());
  ob.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
})();


// v2.26: 研修生画面の安全クリーンアップ
// D1 bind修正により進捗取得エラーも解消

(()=>{
  const txt=(document.body?.innerText||'');
  if(/研修生ポータル|TRAINEE PORTAL/.test(txt) && !/研修管理本部|システム管理者|ADMIN TOOLS/.test(txt)){
    document.getElementById('secureTools221')?.remove();
    document.getElementById('availabilityMenu224')?.remove();
    document.getElementById('availabilityMenu224Wrap')?.remove();
    document.getElementById('testTraineeLauncher220')?.remove();
  }
})();


// v2.28: 教官側・研修生側の時刻を15分単位に統一
(()=>{
  function applyQuarterHour(){
    const nowJst=new Date(Date.now()+9*60*60*1000);
    const today=nowJst.toISOString().slice(0,10);
    document.querySelectorAll('input[type="time"]').forEach(el=>{
      el.step='900';
      if(el.dataset.quarter228)return;
      el.dataset.quarter228='1';
      el.addEventListener('change',()=>{
        const v=String(el.value||'');
        const p=v.split(':');
        const hh=Number(p[0]),mm=Number(p[1]);
        const ok=p.length>=2&&Number.isInteger(hh)&&Number.isInteger(mm)&&hh>=0&&hh<=23&&[0,15,30,45].includes(mm);
        if(v&&!ok){
          alert('時刻は15分単位（00・15・30・45分）で選択してください');
          el.value='';
          el.dispatchEvent(new Event('input',{bubbles:true}));
        }
      });
    });
    document.querySelectorAll('input[type="date"]').forEach(el=>{
      if(!el.min||el.min<today)el.min=today;
    });
    document.querySelectorAll('form').forEach(form=>{
      if(form.dataset.quarterSubmit228)return;
      form.dataset.quarterSubmit228='1';
      form.addEventListener('submit',e=>{
        const bad=[...form.querySelectorAll('input[type="time"]')].find(el=>{
          if(!el.value)return false;
          const p=String(el.value).split(':');
          const hh=Number(p[0]),mm=Number(p[1]);
          return !(p.length>=2&&Number.isInteger(hh)&&Number.isInteger(mm)&&hh>=0&&hh<=23&&[0,15,30,45].includes(mm));
        });
        if(bad){
          e.preventDefault();
          alert('申請時刻は15分単位（00・15・30・45分）で選択してください');
          bad.focus();
        }
      },true);
    });
  }
  applyQuarterHour();
  const ob=new MutationObserver(()=>applyQuarterHour());
  ob.observe(document.documentElement,{childList:true,subtree:true});
})();

// v2.36: 研修生予約画面 - 登録済み教官枠との同期を強化
(()=>{
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let mounting=false;
  let lastKey='';

  const toMin=t=>{
    const p=String(t||'').split(':');
    if(p.length<2)return null;
    const h=Number(p[0]),m=Number(p[1]);
    if(!Number.isInteger(h)||!Number.isInteger(m))return null;
    return h*60+m;
  };
  const fromMin=n=>{
    n=((Number(n)%1440)+1440)%1440;
    return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  };

  function ctx(){
    const candidates=[...document.querySelectorAll('div,section,form')].filter(el=>{
      const t=(el.textContent||'');
      return /第1希望/.test(t)&&/申請する/.test(t)&&/日付/.test(t)&&/時間/.test(t);
    });
    const modal=candidates.sort((a,b)=>a.getBoundingClientRect().width-b.getBoundingClientRect().width)[0];
    if(!modal)return null;

    const dates=[...modal.querySelectorAll('input[type="date"]')];
    const times=[...modal.querySelectorAll('input[type="time"]')];
    if(!dates.length||!times.length)return null;

    const titleEl=[...modal.querySelectorAll('h1,h2,h3,h4,strong,b')].find(el=>{
      const t=(el.textContent||'').trim();
      return /申請$/.test(t)&&/学科|研修|オリエンテーション|テスト/.test(t);
    });

    return {
      modal,
      date1:modal.querySelector('[name="preferred_date"],#preferred_date,#preferredDate')||dates[0],
      time1:modal.querySelector('[name="preferred_time"],#preferred_time,#preferredTime')||times[0],
      title:(titleEl?.textContent||'').replace(/\s*申請\s*$/,'').trim()
    };
  }

  async function durationFor(title){
    try{
      const r=await fetch('/api/trainee/training-duration?title='+encodeURIComponent(title||''),{cache:'no-store'});
      const d=await r.json();
      return Math.max(15,Number(d.duration_minutes||30));
    }catch(_){return 30;}
  }

  async function availability(){
    try{
      const r=await fetch('/api/trainee/instructor-availability',{cache:'no-store'});
      const d=await r.json();
      return Array.isArray(d.availability)?d.availability:[];
    }catch(_){return [];}
  }

  function slotsFor(windows,duration,dateFilter){
    const rows=[];
    for(const w of windows){
      if(dateFilter && String(w.available_date||'')!==dateFilter)continue;
      const s=toMin(w.start_time),e=toMin(w.end_time);
      if(s==null||e==null||e<=s)continue;

      // 「確実な枠」なので所要時間が収まる場合だけ候補化。
      if(e-s<duration)continue;

      for(let cur=s;cur+duration<=e;cur+=15){
        rows.push({...w,slot_start:fromMin(cur),slot_end:fromMin(cur+duration)});
        if(rows.length>=8)return rows;
      }
    }
    return rows;
  }

  function setValue(el,val){
    if(!el)return;
    el.value=val;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }

  async function render(force=false){
    if(mounting)return;
    const c=ctx();
    if(!c)return;

    const dateValue=String(c.date1.value||'');
    const key=(c.title||'')+'|'+dateValue;
    if(!force && key===lastKey && c.modal.querySelector('#prioritySlots236'))return;

    mounting=true;
    try{
      const duration=await durationFor(c.title);
      const windows=await availability();
      const filtered=slotsFor(windows,duration,dateValue);

      c.modal.querySelectorAll('#prioritySlots222,#prioritySlots227,#prioritySlots229,#prioritySlots230,#prioritySlots235,#prioritySlots236').forEach(x=>x.remove());

      const box=document.createElement('section');
      box.id='prioritySlots236';
      box.style.cssText='display:block;width:100%;box-sizing:border-box;margin:8px 0 12px;padding:10px;border:1px solid #d6bb5d;border-radius:13px;background:#fffdf7';

      let html=
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">'+
          '<div><div style="font-size:14px;font-weight:1000;color:#17314d">教官確定枠</div>'+
          '<div style="font-size:9px;color:#7d6c3b;margin-top:2px">所要時間 '+duration+'分 ／ 登録済みの教官枠を優先表示</div></div>'+
          '<span style="padding:3px 6px;border-radius:999px;background:#edf7ef;border:1px solid #9bc9a3;color:#28703a;font-size:8px;font-weight:1000">優先</span>'+
        '</div>';

      if(filtered.length){
        html+='<div style="display:grid;grid-template-columns:1fr;gap:6px;margin-top:8px">';
        filtered.forEach((x,i)=>{
          html+='<button type="button" data-slot236="'+i+'" style="width:100%;text-align:left;padding:9px 10px;border:1px solid #d4dee8;border-radius:10px;background:#fff;color:#17314d">'+
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">'+
              '<div><div style="font-size:12px;font-weight:1000">'+esc(x.available_date)+'　'+esc(x.slot_start)+'〜'+esc(x.slot_end)+'</div>'+
              '<div style="font-size:9px;color:#74869a;margin-top:2px">担当可能：'+esc(x.instructor_name)+'</div></div>'+
              '<span style="font-size:9px;font-weight:1000;color:#826b20">選ぶ</span>'+
            '</div></button>';
        });
        html+='</div>';
      }else{
        const msg=dateValue
          ? dateValue+' に、この研修を完了できる教官確定枠はありません。'
          : '日付を選ぶと、その日の教官確定枠を表示します。';
        html+='<div style="margin-top:8px;padding:8px;border-radius:9px;background:#fff;color:#778797;font-size:10px">'+esc(msg)+'</div>';
      }

      html+='<div id="selected236" style="display:none;margin-top:7px;padding:7px 8px;border-radius:8px;background:#eef8f0;color:#2d6d3e;font-size:9px;font-weight:900"></div>'+
        '<button type="button" id="custom236" style="width:100%;margin-top:7px;padding:8px;border:1px dashed #aebdcb;border-radius:9px;background:#fff;color:#54677b;font-weight:900;font-size:10px">別の日程を希望する</button>';

      box.innerHTML=html;

      const heading=[...c.modal.querySelectorAll('h1,h2,h3,h4,strong,b,div,span')].find(el=>/^第1希望/.test((el.textContent||'').trim()));
      if(heading)heading.insertAdjacentElement('afterend',box);
      else{
        const wrap=c.date1.closest('.row,.field,.form-group,div')||c.date1;
        wrap.parentElement?.insertBefore(box,wrap);
      }

      box.querySelectorAll('[data-slot236]').forEach(btn=>{
        btn.onclick=()=>{
          const x=filtered[Number(btn.dataset.slot236||0)];
          if(!x)return;
          setValue(c.date1,String(x.available_date||''));
          setValue(c.time1,String(x.slot_start||''));
          box.querySelectorAll('[data-slot236]').forEach(z=>{z.style.background='#fff';z.style.borderColor='#d4dee8';z.style.boxShadow='none';});
          btn.style.background='#fff9df';
          btn.style.borderColor='#d0a93e';
          btn.style.boxShadow='0 0 0 2px rgba(208,169,62,.18)';
          const s=box.querySelector('#selected236');
          s.style.display='block';
          s.textContent='✓ 選択中：'+x.instructor_name+' / '+x.available_date+' '+x.slot_start+'〜'+x.slot_end;
        };
      });

      box.querySelector('#custom236').onclick=()=>{
        box.querySelectorAll('[data-slot236]').forEach(z=>{z.style.background='#fff';z.style.borderColor='#d4dee8';z.style.boxShadow='none';});
        box.querySelector('#selected236').style.display='none';
        c.time1.focus();
      };

      if(!c.date1.dataset.slotSync236){
        c.date1.dataset.slotSync236='1';
        c.date1.addEventListener('input',()=>setTimeout(()=>render(true),20));
        c.date1.addEventListener('change',()=>setTimeout(()=>render(true),20));
      }

      lastKey=key;
    }finally{
      mounting=false;
    }
  }

  render(true);
  const ob=new MutationObserver(()=>render(false));
  ob.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','open']});
  document.addEventListener('click',()=>setTimeout(()=>render(false),60),true);
  setInterval(()=>render(false),1000);
})();

// v2.25: 「ここは触らない」の管理ユーティリティは管理者画面だけに限定
(async()=>{
  try{
    const adminCheck=await fetch('/api/admin/check',{cache:'no-store',credentials:'same-origin'});
    if(!adminCheck.ok)return;
  }catch(_){return;}

  const bodyText=(document.body?.innerText||'');
  const traineePortal=/研修生ポータル|TRAINEE PORTAL/.test(bodyText);
  const adminPortal=/研修管理本部|システム管理者|ADMIN TOOLS/.test(bodyText);
  if(traineePortal && !adminPortal)return;

  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const visible=el=>{if(!el||!el.isConnected)return false;const r=el.getBoundingClientRect();const st=getComputedStyle(el);return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden';};

  function findDoNotTouch(){
    const all=[...document.querySelectorAll('h1,h2,h3,h4,summary,button,div,span')];
    return all.filter(visible).find(x=>/ここは触らない/.test((x.textContent||'').trim()));
  }

  function makeModal(id,title,subtitle){
    document.getElementById(id)?.remove();
    const m=document.createElement('div');m.id=id;
    m.style.cssText='position:fixed;inset:0;z-index:10050;background:rgba(7,25,44,.6);display:flex;align-items:flex-end;justify-content:center;padding:10px';
    m.innerHTML='<div style="width:min(94vw,460px);max-height:78vh;overflow:auto;background:#f7f9fc;border-radius:16px;padding:10px;border:1px solid #d4dfeb">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><b style="font-size:17px">'+title+'</b><div style="font-size:10px;color:#718397;margin-top:2px">'+subtitle+'</div></div><button class="close" style="border:1px solid #ced9e4;background:#fff;border-radius:9px;padding:7px 10px;font-weight:900">閉じる</button></div>'+
      '<div class="body" style="margin-top:10px"></div></div>';
    document.body.appendChild(m);
    m.querySelector('.close').onclick=()=>m.remove();
    m.onclick=e=>{if(e.target===m)m.remove();};
    return m.querySelector('.body');
  }

  async function openAvailability(){
    const body=makeModal('availabilityModal221','教官の空き時間管理','開始時刻を選ぶと終了時刻は30分後に自動設定されます');
    body.innerHTML='<div style="color:#75869a">読み込み中...</div>';
    try{
      const r=await fetch('/api/admin/instructor-availability',{cache:'no-store'});const d=await r.json();
      const opts=(d.instructors||[]).map(x=>'<option value="'+Number(x.id||0)+'" data-name="'+esc(x.name)+'">'+esc(x.name)+'</option>').join('');
      body.innerHTML='<div style="background:#fff;border:1px solid #dbe4ed;border-radius:12px;padding:10px">'+
        '<select id="iaInstructor221" style="width:100%;padding:9px;border:1px solid #ccd8e4;border-radius:9px"><option value="">教官を選択</option>'+opts+'</select>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px">'+
          '<div><div style="font-size:9px;color:#66798d;margin:0 0 3px 2px">日付</div><input id="iaDate221" type="date" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccd8e4;border-radius:9px"></div>'+
          '<div><div style="font-size:9px;color:#66798d;margin:0 0 3px 2px">開始</div><select id="iaStart221" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccd8e4;border-radius:9px;background:#fff"></select></div>'+
        '</div>'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;padding:7px 9px;border:1px solid #dde5ed;border-radius:9px;background:#f5f8fb">'+
          '<span style="font-size:9px;color:#66798d">終了時刻</span>'+
          '<strong id="iaEndDisplay221" style="font-size:12px;color:#17314d">--:--</strong>'+
        '</div>'+
        '<div style="margin-top:5px;font-size:9px;color:#7a8998">開始は15分刻み。終了は30分後を自動表示。</div>'+
        '<input id="iaNote221" placeholder="メモ（任意）" style="width:100%;box-sizing:border-box;margin-top:7px;padding:8px;border:1px solid #ccd8e4;border-radius:9px">'+
        '<button id="iaSave221" style="width:100%;margin-top:7px;border:0;border-radius:9px;background:#0b2d52;color:#fff;padding:9px;font-weight:1000;font-size:11px">空き時間を登録</button></div>'+
        '<div id="iaList221" style="margin-top:8px"></div>';
      const render=rows=>{
        const list=body.querySelector('#iaList221');
        list.innerHTML=(rows||[]).length?(rows||[]).map(x=>'<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;background:#fff;border:1px solid #dbe4ed;border-radius:10px;padding:8px;margin-top:5px"><div><b>'+esc(x.instructor_name)+'</b><div style="font-size:10px;color:#6f8193">'+esc(x.available_date)+' '+esc(x.start_time)+'〜'+esc(x.end_time)+(x.note?' / '+esc(x.note):'')+'</div></div><button data-del="'+Number(x.id||0)+'" style="border:1px solid #df9992;background:#fff8f7;color:#9c3229;border-radius:8px;padding:5px 7px;font-weight:900">削除</button></div>').join(''):'<div style="padding:10px;color:#7b8a99">登録済みの空き時間はありません。</div>';
        list.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{await fetch('/api/admin/instructor-availability/delete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:Number(b.dataset.del)})});openAvailability();});
      };
      render(d.availability||[]);

      const startSel=body.querySelector('#iaStart221');
      const endDisplay=body.querySelector('#iaEndDisplay221');
      const qopts=[];
      for(let h=0;h<24;h++){
        for(const m of [0,15,30,45]){
          const v=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
          qopts.push('<option value="'+v+'">'+v+'</option>');
        }
      }
      startSel.innerHTML='<option value="">開始時刻</option>'+qopts.join('');

      const add30=v=>{
        const parts=String(v||'').split(':');
        if(parts.length<2)return '';
        const hh=Number(parts[0]),mm=Number(parts[1]);
        if(!Number.isInteger(hh)||!Number.isInteger(mm)||hh<0||hh>23||![0,15,30,45].includes(mm))return '';
        let total=hh*60+mm+30;
        total%=1440;
        return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
      };
      const refreshEnd=()=>{
        const end=add30(startSel.value);
        endDisplay.textContent=end?end:'--:--';
        endDisplay.dataset.value=end||'';
      };
      startSel.addEventListener('input',refreshEnd);
      startSel.addEventListener('change',refreshEnd);
      refreshEnd();

      body.querySelector('#iaSave221').onclick=async()=>{
        const sel=body.querySelector('#iaInstructor221');const opt=sel.options[sel.selectedIndex];
        const startValue=body.querySelector('#iaStart221').value;
        const endValue=add30(startValue);
        const payload={instructor_id:Number(sel.value||0),instructor_name:opt?.dataset?.name||'',available_date:body.querySelector('#iaDate221').value,start_time:startValue,end_time:endValue,note:body.querySelector('#iaNote221').value};
        const valid15=v=>{
          const p=String(v||'').split(':');
          if(p.length<2)return false;
          const hh=Number(p[0]),mm=Number(p[1]);
          return Number.isInteger(hh)&&Number.isInteger(mm)&&hh>=0&&hh<=23&&[0,15,30,45].includes(mm);
        };
        if(!valid15(payload.start_time))return alert('開始時刻を15分単位で選択してください');
        if(!payload.end_time)return alert('終了時刻を計算できませんでした。開始時刻を選び直してください');
        const rr=await fetch('/api/admin/instructor-availability',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const x=await rr.json();
        if(!x.ok)return alert(x.error||'登録できませんでした');
        openAvailability();
      };
    }catch(_){body.textContent='空き時間情報を取得できませんでした';}
  }

  window.openInstructorAvailability221=openAvailability;
  // 管理者の空き時間登録モーダルでは研修生向け「教官確定枠」UIを表示しない。
  const hideTraineePriorityInAdmin=()=>{
    document.querySelectorAll('#prioritySlots222,#prioritySlots227,#prioritySlots229,#prioritySlots230').forEach(x=>{
      if(x.closest('#availabilityModal221'))x.remove();
    });
  };


  async function openDeadline(){
    const body=makeModal('deadlineModal221','期限延長','研修生の30日期限を最大90日まで延長できます');
    body.innerHTML='<div style="color:#75869a">読み込み中...</div>';
    try{
      const r=await fetch('/api/admin/deadline-extensions',{cache:'no-store'});const rows=await r.json();
      if(!Array.isArray(rows))throw new Error('load');
      const opts=rows.map(x=>'<option value="'+Number(x.id||0)+'" data-days="'+Number(x.extra_days||0)+'" data-reason="'+esc(x.reason||'')+'">'+esc(x.player_name||'研修生')+(Number(x.extra_days||0)>0?'（+'+Number(x.extra_days)+'日）':'')+'</option>').join('');
      body.innerHTML='<div style="background:#fff;border:1px solid #dbe4ed;border-radius:12px;padding:10px">'+
        '<select id="deProfile221" style="width:100%;padding:9px;border:1px solid #ccd8e4;border-radius:9px"><option value="">研修生を選択</option>'+opts+'</select>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px;margin-top:7px">'+
          '<button data-days="3">+3日</button><button data-days="7">+7日</button><button data-days="14">+14日</button><button data-days="30">+30日</button>'+
        '</div>'+
        '<input id="deDays221" type="number" min="0" max="90" placeholder="延長日数（0で解除）" style="width:100%;margin-top:7px;padding:8px;border:1px solid #ccd8e4;border-radius:9px">'+
        '<input id="deReason221" placeholder="延長理由" style="width:100%;margin-top:7px;padding:8px;border:1px solid #ccd8e4;border-radius:9px">'+
        '<button id="deSave221" style="width:100%;margin-top:7px;border:0;border-radius:9px;background:#0b2d52;color:#fff;padding:9px;font-weight:1000">期限延長を保存</button>'+
        '<div style="margin-top:7px;font-size:9px;color:#7a8998">※ 延長は表示だけでなく、自動期限リセット判定にも反映されます。</div></div>';
      body.querySelectorAll('[data-days]').forEach(b=>{b.style.cssText='padding:7px;border:1px solid #d5b356;border-radius:8px;background:#fffdf4;font-weight:900';b.onclick=()=>body.querySelector('#deDays221').value=b.dataset.days;});
      body.querySelector('#deProfile221').onchange=e=>{const o=e.target.options[e.target.selectedIndex];body.querySelector('#deDays221').value=o?.dataset?.days||0;body.querySelector('#deReason221').value=o?.dataset?.reason||'';};
      body.querySelector('#deSave221').onclick=async()=>{
        const payload={profile_id:Number(body.querySelector('#deProfile221').value||0),extra_days:Number(body.querySelector('#deDays221').value||0),reason:body.querySelector('#deReason221').value};
        if(!payload.profile_id)return alert('研修生を選択してください');
        const rr=await fetch('/api/admin/deadline-extensions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const x=await rr.json();
        if(!x.ok)return alert(x.error||'保存できませんでした');
        alert(payload.extra_days>0?x.player_name+' の期限を +'+x.extra_days+'日 延長しました':'期限延長を解除しました');
        document.getElementById('deadlineModal221')?.remove();
        location.reload();
      };
    }catch(_){body.textContent='研修生情報を取得できませんでした';}
  }

  function mountSecureTools(){
    const txt=(document.body?.innerText||'');
    if(/研修生ポータル|TRAINEE PORTAL/.test(txt) && !/研修管理本部|システム管理者|ADMIN TOOLS/.test(txt))return false;
    if(!/研修管理本部|システム管理者|ADMIN TOOLS/.test(txt))return false;
    const h=findDoNotTouch(); if(!h)return false;
    if(document.getElementById('secureTools221'))return true;
    const box=document.createElement('div');box.id='secureTools221';
    box.style.cssText='margin:8px 0;padding:9px;border:1px solid #d9c16f;border-radius:12px;background:#fffdf6';
    box.innerHTML='<div style="font-size:10px;color:#806913;font-weight:900;margin-bottom:6px">管理者専用ツール</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'+
        '<button id="stTest221">🧪 テスト研修生</button><button id="stDeadline221">⏳ 期限延長</button>'+
      '</div>';
    box.querySelectorAll('button').forEach(b=>b.style.cssText='padding:8px;border:1px solid #d4deea;border-radius:9px;background:#fff;color:#102b47;font-weight:1000;font-size:10px');
    const host=h.closest('details,.card,section,div')||h.parentElement||h;
    host.appendChild(box);
    box.querySelector('#stTest221').onclick=()=>document.getElementById('testTraineeLauncher220')?.click();
    box.querySelector('#stDeadline221').onclick=openDeadline;
    return true;
  }

  mountSecureTools();
  const ob=new MutationObserver(()=>mountSecureTools());
  ob.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open','class','style']});
  document.addEventListener('click',()=>setTimeout(mountSecureTools,80),true);
})();

// v2.18: テスト研修生管理（管理モーダルが後から開かれても表示）
const mountTestTrainee217=async()=>{
  const titles=[...document.querySelectorAll('h1,h2,h3')].filter(x=>/管理メニュー/.test(x.textContent||''));
  const visible=el=>{
    if(!el || !el.isConnected)return false;
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return r.width>0 && r.height>0 && s.display!=='none' && s.visibility!=='hidden' && Number(s.opacity||1)!==0;
  };
  const adminTitle=titles.find(visible) || titles[titles.length-1];
  if(!adminTitle)return false;

  let card=document.getElementById('testTraineeCard217');
  if(card){
    // hidden template側へ入っていた場合は、現在表示中の管理メニューへ移動する。
    if(card.previousElementSibling!==adminTitle) adminTitle.insertAdjacentElement('afterend',card);
    return true;
  }

  card=document.createElement('div');
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
  return true;
};

mountTestTrainee217();
let testMountTries217=0;
const testMountTimer217=setInterval(async()=>{
  testMountTries217++;
  await mountTestTrainee217();
  if(testMountTries217>240)clearInterval(testMountTimer217);
},500);

const testObserver217=new MutationObserver(()=>{ mountTestTrainee217(); });
testObserver217.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','open']});
document.addEventListener('click',()=>setTimeout(()=>mountTestTrainee217(),50),true);

// v2.15: compact operations tools
(async()=>{
  const isAdmin = !!document.querySelector('body');
  if(!isAdmin)return;

  
  document.querySelectorAll('.traineeCompactCard,.trainee-card,[data-trainee-id]').forEach(el=>{
    const t=(el.textContent||'').trim();
    if(!t.includes('テスト研修生') || el.querySelector('.testBadge219'))return;
    const badge=document.createElement('span');
    badge.className='testBadge219';
    badge.textContent='TEST';
    badge.style.cssText='display:inline-block;margin-left:5px;padding:2px 5px;border-radius:999px;background:#eef5ff;border:1px solid #9cbbe4;color:#184f88;font-size:8px;font-weight:1000';
    const target=el.querySelector('b,strong,h3,h4,.name')||el;
    target.appendChild(badge);
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


function isQuarterHourTime(v){
  const m=String(v||"").match(/^(\d{2}):(\d{2})$/);
  if(!m)return false;
  const hh=Number(m[1]),mm=Number(m[2]);
  return hh>=0&&hh<=23&&[0,15,30,45].includes(mm);
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
  for(const k of keys){
    if(body[k]!==undefined&&String(body[k]||"").trim()!==""&&!isQuarterHourTime(body[k])){
      return json({error:"時刻は15分単位（00・15・30・45分）で選択してください"},400);
    }
  }
  return null;
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
  const start=String(b?.start_time||"").trim();
  const end=String(b?.end_time||"").trim();
  const note=String(b?.note||"").trim().slice(0,200);
  if(!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)){
    return {ok:false,error:"教官・日付・開始/終了時刻を入力してください"};
  }
  if(!isQuarterHourTime(start)||!isQuarterHourTime(end)){
    return {ok:false,error:"開始時刻・終了時刻は15分単位で登録してください"};
  }
  if(start>=end)return {ok:false,error:"終了時刻は開始時刻より後にしてください"};
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
  const quarterError=await enforceQuarterHourReservationRequest(request);
  if(quarterError)return quarterError;
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
        if(!isQuarterHourTime(s)||!isQuarterHourTime(e))return false;
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
