const $ = id => document.getElementById(id);
let routes = [], toilets = [], tab = "pending", confirmDel = null;

function setStatus(text, cls){ $("status").textContent = text; $("status").className = "status " + (cls||"") }

async function start(){
  const token = await API.token();
  if (!token){ $("loginCard").hidden = false; $("app").hidden = true; setStatus("로그인이 필요해요"); return }
  let ok = false;
  try { ok = await API.isAdmin(token) } catch(e) {}
  if (!ok){
    API.logout();
    $("loginCard").hidden = false; $("app").hidden = true;
    setStatus("이 계정은 팀원으로 등록되어 있지 않아요", "warn");
    return;
  }
  $("loginCard").hidden = true; $("app").hidden = false;
  setStatus(`● ${API.email()} 로그인됨`, "team");
  await refresh();
}

async function refresh(){
  try {
    const token = await API.token();
    [routes, toilets] = await Promise.all([API.allRoutes(token), API.toilets()]);
    render();
  } catch(e) { toast("불러오기 실패. 새로고침 해줘") }
}

function dirLabel(r){ return `${r.from_station||"?"} → ${r.station} → ${r.to_station||"?"}` }

function render(){
  $("cPending").textContent = routes.filter(r=>r.status==="pending").length;
  $("cApproved").textContent = routes.filter(r=>r.status==="approved").length;
  $("cStations").textContent = new Set(routes.filter(r=>r.status==="approved").map(r=>r.line+"|"+r.station)).size;
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-pressed", b.dataset.t===tab));

  const q = $("filter").value.trim();
  const list = routes.filter(r => r.status===tab && (!q || r.station.includes(q)));
  $("list").innerHTML = list.length ? list.map(r => {
    return `
    <div class="item">
      <div class="t"><strong>${esc(r.line)}호선 ${esc(r.station)} · ${doorText(r)||"?-?"} 하차${r.seconds!=null?" · "+secText(r.seconds):""}</strong>
      ${r.source==="team" ? '<span class="pill team">팀</span>' : '<span class="pill">사용자</span>'}
${esc(dirLabel(r))}${r.opp_door?` (맞은편 ${esc(r.opp_door)})`:""}
→ 화장실: ${esc(toiletLabel(r, toilets))}${!r.toilet_id && r.stalls!=null ? ` · 남자 대변기 ${r.stalls}` : ""}
${esc(r.steps.map(stepText).join(" → "))}${r.note?"\n"+esc("비고: "+r.note):""}
<span class="meta">${esc(r.nickname||"익명")} · ${esc(r.created_at.slice(0,16).replace("T"," "))}</span></div>
      <div class="actions">
        ${r.status!=="approved" ? `<button class="secondary" data-approve="${r.id}">승인</button>` : ""}
        ${r.status!=="rejected" ? `<button data-reject="${r.id}">반려</button>` : ""}
        ${r.status!=="pending" ? `<button class="ghost" data-pending="${r.id}">대기로</button>` : ""}
        ${confirmDel===r.id ? `<button class="ghost danger" data-del="${r.id}">정말 삭제</button>` : `<button class="ghost" data-askdel="${r.id}">삭제</button>`}
      </div>
    </div>`;
  }).join("") : `<span class="sub">${{pending:"검수할 제보가 없어요.", approved:"승인된 경로가 없어요.", rejected:"반려한 제보가 없어요."}[tab]}</span>`;
}

$("list").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  const token = await API.token();
  if (!token){ start(); return }
  try {
    if (b.dataset.approve){
      const r = routes.find(x => x.id==b.dataset.approve);
      await API.setStatus(r.id, "approved", token);
      toast("승인했어");
    }
    if (b.dataset.reject){ await API.setStatus(b.dataset.reject, "rejected", token); toast("반려했어") }
    if (b.dataset.pending){ await API.setStatus(b.dataset.pending, "pending", token); toast("대기로 돌렸어") }
    if (b.dataset.askdel){
      confirmDel = +b.dataset.askdel; render();
      setTimeout(() => { if (confirmDel===+b.dataset.askdel){ confirmDel=null; render() } }, 4000);
      return;
    }
    if (b.dataset.del){ await API.deleteRoute(b.dataset.del, token); confirmDel=null; toast("삭제했어") }
    await refresh();
  } catch(err) { toast("처리 실패. 다시 눌러줘") }
});
$("tabs").addEventListener("click", e => { const b=e.target.closest("button"); if(b){ tab=b.dataset.t; render() } });
$("filter").addEventListener("input", render);

$("loginCard").addEventListener("submit", async e => {
  e.preventDefault();
  try { await API.login($("email").value.trim(), $("password").value); $("password").value=""; start() }
  catch(err) { setStatus("이메일이나 비밀번호가 맞지 않아요", "warn") }
});
$("logout").addEventListener("click", () => { API.logout(); start() });

/* 내보내기: 승인된 경로 한 줄씩 */
const HEADERS = ["호선","역명","이전역","다음역","하차문","맞은편 문","화장실 층","개찰구","화장실 근처 출구","화장실 위치","남자 대변기",
  "동선","단계 수","표지판 있는 단계","소요(초)","소요시간","비고","출처","제보자","등록일"];
function rows(){
  return routes.filter(r => r.status==="approved")
    .sort((a,b) => a.line.localeCompare(b.line) || a.station.localeCompare(b.station) || (a.from_station||"").localeCompare(b.from_station||"") || a.created_at.localeCompare(b.created_at))
    .map(r => {
      const t = toilets.find(x => x.id===r.toilet_id) || {floor:"", gate:r.gate, exit_no:"", detail:r.toilet_detail, male_stalls:r.stalls};
      const signs = r.steps.filter(s => (s.mods||[]).some(m => m.includes("표지판") && m!=="표지판 없음")).length;
      return [r.line, r.station, r.from_station||"", r.to_station||"", doorText(r), r.opp_door||"",
        t.floor||"", gateShort(t.gate), t.exit_no||"", t.detail||"", t.male_stalls??"", r.steps.map(stepText).join(" -> "), r.steps.length, signs,
        r.seconds??"", secText(r.seconds), r.note||"", r.source==="team"?"팀":"사용자", r.nickname||"", r.created_at.slice(0,10)];
    });
}
$("csv").addEventListener("click", () => {
  const q = v => { const s=String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s };
  const csv = "﻿" + [HEADERS, ...rows()].map(r => r.map(q).join(",")).join("\r\n");   // BOM: 엑셀 한글 깨짐 방지
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
  a.download = `급똥답사_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("tsv").addEventListener("click", async () => {
  const clean = v => String(v).replace(/[\t\n\r]+/g, " ");
  try { await navigator.clipboard.writeText([HEADERS, ...rows()].map(r => r.map(clean).join("\t")).join("\n")); toast("복사했어! 구글 시트 A1에 붙여넣기") }
  catch(e) { toast("복사가 막혔어요. 엑셀 파일 받기를 써줘") }
});

if (!window.CONFIG || CONFIG.SUPABASE_ANON_KEY.startsWith("YOUR-")) setStatus("config.js에 Supabase 주소와 키를 넣어주세요", "warn");
else start();
