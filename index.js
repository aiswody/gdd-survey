const $ = id => document.getElementById(id);
// 자주 쓰는 단계부터
const BASE_ACTS = ["계단","직진","우회전","좌회전","유턴","에스컬레이터","개찰구","엘리베이터","무빙워크"];
const PRE = ["전방","왼쪽","오른쪽","뒤쪽"];
const SIGN = ["위 표지판","왼쪽 벽 표지판","오른쪽 벽 표지판","정면 표지판","바닥 표지판","표지판 없음"];
const DOORS = 4, COOLDOWN_MS = 15000;
// 호선별 칸 수와 노선색 (1~4호선 10량, 5~7호선 8량, 8·9호선 6량)
const LINES = {1:[10,"#0052A4"], 2:[10,"#00A84D"], 3:[10,"#EF7C1C"], 4:[10,"#00A5DE"], 5:[8,"#996CAC"],
  6:[8,"#CD7C2F"], 7:[8,"#747F00"], 8:[6,"#E6186C"], 9:[6,"#BDB092"]};
const DRAFT_KEY = "gdd-draft-v1", ACTS_KEY = "gdd-custom-acts", MINE_KEY = "gdd-mine-v1", NICK_KEY = "gdd-nickname";

// 동선은 항상 하차로 시작해서 도착으로 끝남. 사이 단계만 버튼으로 추가
const fixedEnds = steps => {
  const mid = (steps||[]).filter(s => s.a!=="하차" && s.a!=="도착");
  const first = (steps||[]).find(s => s.a==="하차") || {a:"하차", pre:"", mods:[]};
  const last = (steps||[]).find(s => s.a==="도착") || {a:"도착", pre:"", mods:[]};
  return [first, ...mid, last];
};
const blankDraft = () => ({car:null, door:null, opp:"", steps:fixedEnds([]), min:"", sec:"", note:""});
const clone = o => JSON.parse(JSON.stringify(o));
const load = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fallback } catch(e) { return fallback } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch(e) {} };

// 이 폰에만 남는 상태
let S = Object.assign({station:"", line:"3", prev:"", next:"", dir:0, toiletId:null, cGate:"", cDetail:"", cStalls:"", draft:blankDraft()}, load(DRAFT_KEY, {}));
S.draft.steps = fixedEnds(S.draft.steps);
let customActs = load(ACTS_KEY, []);
let mine = load(MINE_KEY, []);           // 내가 보낸 제보 (검수 대기 표시용)

// 서버 데이터
let routes = [], toilets = [];
let token = null, isTeam = false, conn = "loading", lastSubmit = 0;
let sel = null, actEdit = false;
let timer = {start:0, acc:0, run:false, raf:0};
let SUB = null, listLine = null, carCount = 0;   // data/subway.json (공공데이터로 만든 호선별 역 순서)

const normName = n => { n = n.replace(/\(.*?\)/g, "").trim(); return n.endsWith("역") && n.length>=3 ? n.slice(0,-1) : n };
const lineStations = () => SUB?.lines[S.line]?.stations || [];
const neighbors = () => SUB?.lines[S.line]?.neighbors[S.station.trim()] || null;
// 이 역의 화장실 (환승역은 화장실이 호선별로 나뉘어 있어서 이 호선 것을 앞에)
const stationToilets = () => !S.station.trim() ? [] : toilets
  .filter(t => normName(t.station)===normName(S.station))
  .sort((a,b) => (b.line===String(S.line)) - (a.line===String(S.line)));

const persist = () => store(DRAFT_KEY, S);
const sameSt = (a, line, name) => String(a.line).trim()===String(line).trim() && (a.station ?? a.name ?? "").trim()===String(name).trim();
const dirStations = d => d===0 ? [S.prev, S.next] : [S.next, S.prev];
// 저장된 경로의 방향을 지금 화면의 방향 1/2 기준으로 맞춤 (제보자마다 옆 역을 적는 순서가 달라도 되게)
const routeDir = r => r.from_station && r.from_station===S.prev.trim() ? 0
  : r.from_station && r.from_station===S.next.trim() ? 1 : r.dir;
const hereRoutes = d => routes.filter(r => sameSt(r, S.line, S.station) && routeDir(r)===d);
const hereMine = d => mine.filter(r => sameSt(r, S.line, S.station) && routeDir(r)===d);
const allActs = () => BASE_ACTS.concat(customActs);
const draftSeconds = D => (D.min==="" && D.sec==="") ? null : (parseInt(D.min)||0)*60 + (parseInt(D.sec)||0);

/* ---------- 역 선택 시 자동 채우기 ---------- */
function onStationPicked(){
  const nb = neighbors();
  const key = S.line + "|" + S.station.trim();
  if (S.picked !== key) {               // 다른 역으로 바꾸면 화장실 선택을 새로
    S.picked = key; S.toiletId = null;
    const list = stationToilets();
    if (list.length===1) S.toiletId = list[0].id;
  }
  if (!nb) {                              // 목록에 없는 역은 양옆 역을 직접 입력
    if (S.autoNb) { S.autoNb = false; S.prev = ""; S.next = ""; S.dir = 0; fillInputs() }
    return;
  }
  if (!(nb.includes(S.prev) && (nb.includes(S.next) || (!S.next && nb.length===1)))) {
    S.prev = nb.length<=2 ? nb[0] : ""; S.next = nb.length===2 ? nb[1] : "";
    S.dir = 0;
  }
  S.autoNb = true;
  fillInputs();
}

/* ---------- 렌더 ---------- */
function renderStatic(){
  $("linePick").innerHTML = Object.entries(LINES).map(([n,[,c]]) => `<button data-line="${n}" style="--lc:${c}">${n}</button>`).join("");
  $("doorPick").innerHTML = Array.from({length:DOORS},(_,i)=>`<button data-door="${i+1}">${i+1}번 문</button>`).join("");
  $("preMods").innerHTML = PRE.map(p=>`<button data-pre="${p}">${p}</button>`).join("");
  $("signMods").innerHTML = SIGN.map(m=>`<button data-mod="${m}">${m}</button>`).join("");
  $("nickname").value = load(NICK_KEY, "");
  fillInputs();
}
function fillInputs(){
  ["station","prev","next","cDetail","cStalls"].forEach(k => $(k).value = S[k]||"");
  ["opp","min","sec","note"].forEach(k => $(k).value = S.draft[k]||"");
}

function render(){
  const D = S.draft, d = S.dir;
  const st = $("status");
  st.className = "status " + ({ok:"ok", team:"team", error:"warn", config:"warn"}[conn] || "");
  st.textContent = {
    loading:"불러오는 중…",
    ok:"● 연결됨 · 등록하면 팀 검수 후 반영돼요",
    team:`● 팀 모드 (${API.email()}) · 등록하면 바로 반영돼요`,
    error:"서버에 연결이 안 돼요. 입력한 내용은 이 폰에 남아 있어요",
    config:"config.js에 Supabase 주소와 키를 넣어주세요",
  }[conn];
  $("save").disabled = conn==="loading" || conn==="config";
  $("saveHint").textContent = isTeam ? "팀 모드라 검수 없이 바로 반영돼요." : "등록한 경로는 팀이 확인한 뒤 앱에 반영돼요.";

  // 호선·역 목록
  document.querySelectorAll("#linePick button").forEach(b=>b.setAttribute("aria-pressed", b.dataset.line===String(S.line)));
  if (listLine !== S.line + !!SUB) {
    listLine = S.line + !!SUB;
    $("stationList").innerHTML = lineStations().map(n=>`<option value="${esc(n)}">`).join("");
  }
  const cars = (LINES[S.line]||[10])[0];
  if (carCount !== cars) {
    carCount = cars;
    $("carPick").innerHTML = Array.from({length:cars},(_,i)=>`<button data-car="${i+1}">${i+1}</button>`).join("");
    if (S.draft.car > cars) S.draft.car = null;
  }

  // 목적지 화장실
  const tl = stationToilets();
  $("toiletPick").innerHTML = !S.station.trim() ? '<span class="sub">역을 먼저 골라줘.</span>'
    : tl.map(t => `<button class="ptoilet" data-tid="${t.id}" aria-pressed="${S.toiletId===t.id}">
        <b>${esc(t.line)}호선 쪽 · ${esc(t.floor||"")} · ${esc(gateShort(t.gate))}</b><br>
        ${esc([t.exit_no && t.exit_no+"번 출구", t.detail].filter(Boolean).join(" · "))}<br>
        남자 대변기 ${t.male_stalls ?? "?"} · 여자 ${t.female_stalls ?? "?"}${t.source==="team" ? " · 팀 확인" : ""}</button>`).join("")
      + (tl.length ? "" : '<span class="sub">이 역은 공공데이터에 화장실 정보가 없어. 아래에 직접 적어줘.</span>')
      + `<button class="ptoilet" data-tid="custom" aria-pressed="${S.toiletId==="custom"}"><b>+ 목록에 없는 화장실</b></button>`;
  $("customToilet").hidden = S.toiletId!=="custom";
  document.querySelectorAll("#cGate button").forEach(b=>b.setAttribute("aria-pressed", b.dataset.v===S.cGate));

  // 양옆 역: 목록에 있는 역이면 자동, 갈림길이면 고르기, 목록에 없으면 직접 입력
  const nb = neighbors();
  $("manualDir").hidden = !!nb;
  $("nbRow").hidden = !(nb && nb.length>2);
  if (nb && nb.length>2) $("nbPick").innerHTML = nb.map(n=>`<button data-nb="${esc(n)}" class="${n===S.prev||n===S.next?"on":""}">${esc(n)}</button>`).join("");

  document.querySelectorAll("#dirSeg button").forEach(b=>{
    const from = +b.dataset.d===0 ? S.prev : S.next;
    b.setAttribute("aria-pressed", +b.dataset.d===d);
    b.textContent = from ? `${from}에서 오는 열차` : (+b.dataset.d===0 ? "방향 1" : "방향 2 (반대)");
    b.disabled = !!nb && !from;
  });
  const [a,b] = dirStations(d);
  $("dirLine").innerHTML = `${esc(a||"○○")} → <b>${esc(S.station||"○○")}</b> → ${esc(b||"○○")}`;
  $("editorTitle").textContent = `방향 ${d+1} · 새 경로`;

  document.querySelectorAll("#carPick button").forEach(b=>b.setAttribute("aria-pressed", +b.dataset.car===D.car));
  document.querySelectorAll("#doorPick button").forEach(b=>b.setAttribute("aria-pressed", +b.dataset.door===D.door));
  $("doorOut").textContent = doorText(D) || (D.car ? D.car+"-?" : "–");

  // 동선
  if (sel!=null && sel>=D.steps.length) sel=null;
  const cur = sel!=null ? sel : Math.max(0, D.steps.length-2);
  $("strip").innerHTML = D.steps.length
    ? D.steps.map((s,i)=>(i?'<span class="arrow">→</span>':'')+
        `<button class="step ${s.a==="하차"?"s-start":s.a==="도착"?"s-end":""}" data-i="${i}" aria-pressed="${i===cur}">${esc(s.pre?s.pre+" ":"")}${esc(s.a)}${s.mods.length?` <small>(${esc(s.mods.join(", "))})</small>`:""}</button>`).join("")
    : '';
  $("target").innerHTML = D.steps.length ? `붙일 대상: <b>${esc(D.steps[cur].a)}</b> (단계를 눌러서 바꾸기)` : "";
  const cs = D.steps[cur];
  document.querySelectorAll("#preMods button").forEach(b=>b.classList.toggle("on", !!cs && cs.pre===b.dataset.pre));
  document.querySelectorAll("#signMods button").forEach(b=>b.classList.toggle("on", !!cs && cs.mods.includes(b.dataset.mod)));

  // 단계 버튼
  $("acts").classList.toggle("editing", actEdit);
  $("editActs").textContent = actEdit ? "편집 끝" : "내 버튼 편집";
  const actBtn = (a, cls) => `<button data-act="${esc(a)}" class="${cls}">${esc(a)}${cls==="custom"?`<span class="x" data-rm="${esc(a)}" aria-label="${esc(a)} 삭제">✕</span>`:""}</button>`;
  $("acts").innerHTML = BASE_ACTS.map(a => actBtn(a, "")).join("")
    + customActs.map(a => actBtn(a, "custom")).join("")
    + `<button class="add" id="addAct">+ 단계 추가</button>`;

  // 이 역 경로
  $("savedTitle").textContent = `${S.station||"이 역"} · 방향 ${d+1} 경로`;
  const list = hereRoutes(d), pend = isTeam ? [] : hereMine(d);
  const item = (r, label) => `
    <div class="item"><div class="t"><strong>${doorText(r)||"?-?"} 하차${r.seconds!=null?" · "+secText(r.seconds):""}</strong> ${label}
<span class="meta">→ ${esc(toiletLabel(r, toilets))}</span>
${esc(r.steps.map(stepText).join(" → "))}${r.note?"\n"+esc("비고: "+r.note):""}${r.nickname?`\n<span class="meta">${esc(r.nickname)} 제보</span>`:""}</div></div>`;
  const html = list.map(r => item(r, r.status==="pending" ? '<span class="pill pending">검수 대기</span>' : r.source==="team" ? '<span class="pill team">팀 답사</span>' : ""))
    .concat(pend.map(r => item(r, '<span class="pill pending">내 제보 · 검수 대기</span>')));
  $("saved").innerHTML = html.length ? html.join("")
    : `<span class="sub">${conn==="loading" ? "불러오는 중…" : `방향 ${d+1}에 등록된 경로가 아직 없어요. 첫 경로를 알려주세요!`}</span>`;
  persist();
}

/* ---------- 서버 ---------- */
async function refresh(){
  try {
    const [tl, rt] = await Promise.all([API.toilets(), isTeam ? API.allRoutes(token) : API.approvedRoutes()]);
    toilets = tl;
    if (S.picked && S.toiletId==null) { const l = stationToilets(); if (l.length===1) S.toiletId = l[0].id }
    routes = rt.filter(r => r.status!=="rejected" && Array.isArray(r.steps))
      .sort((a,b)=>a.created_at.localeCompare(b.created_at));
    // 승인되어 공개된 내 제보는 대기 목록에서 뺌
    const key = r => [r.line, r.station, r.car, r.door, JSON.stringify(r.steps)].join("|");
    const live = new Set(routes.map(key));
    const before = mine.length;
    mine = mine.filter(r => !live.has(key(r)) && Date.now()-r.at < 1000*60*60*24*60);
    if (mine.length!==before) store(MINE_KEY, mine);
    conn = isTeam ? "team" : "ok";
  } catch(e) {
    conn = "error";
  }
  render();
}
async function init(){
  if (!window.CONFIG || CONFIG.SUPABASE_ANON_KEY.startsWith("YOUR-")) { conn="config"; render(); return }
  fetch("data/subway.json").then(r=>r.json()).then(j=>{ SUB=j; onStationPicked(); render() }).catch(()=>{});
  token = await API.token();
  if (token) { try { isTeam = await API.isAdmin(token) } catch(e) { isTeam = false } }
  await refresh();
}

/* ---------- 입력 이벤트 ---------- */
["prev","next"].forEach(k => $(k).addEventListener("input", e => { S[k]=e.target.value; render() }));
["cDetail","cStalls"].forEach(k => $(k).addEventListener("input", e => { S[k]=e.target.value; persist() }));
$("toiletPick").addEventListener("click", e => {
  const b=e.target.closest("[data-tid]"); if(!b) return;
  S.toiletId = b.dataset.tid==="custom" ? "custom" : +b.dataset.tid; render();
});
$("cGate").addEventListener("click", e => { const b=e.target.closest("button"); if(!b) return; S.cGate = S.cGate===b.dataset.v ? "" : b.dataset.v; render() });
$("station").addEventListener("input", e => { S.station=e.target.value; onStationPicked(); render() });
$("linePick").addEventListener("click", e => {
  const b=e.target.closest("button"); if(!b) return;
  S.line=b.dataset.line; onStationPicked(); render();
});
$("nbPick").addEventListener("click", e => {
  const b=e.target.closest("[data-nb]"); if(!b) return;
  const n=b.dataset.nb;
  if (S.prev===n) S.prev=""; else if (S.next===n) S.next="";
  else if (!S.prev) S.prev=n; else if (!S.next) S.next=n; else { S.prev=S.next; S.next=n }
  render();
});
$("dirSeg").addEventListener("click", e => { const b=e.target.closest("button"); if(!b) return; S.dir=+b.dataset.d; render() });
$("carPick").addEventListener("click", e => { const b=e.target.closest("button"); if(b){ S.draft.car=+b.dataset.car; render() } });
$("doorPick").addEventListener("click", e => { const b=e.target.closest("button"); if(b){ S.draft.door=+b.dataset.door; render() } });
["opp","min","sec","note"].forEach(k => $(k).addEventListener("input", e => { S.draft[k]=e.target.value; persist() }));
$("nickname").addEventListener("input", e => store(NICK_KEY, e.target.value.trim()));

$("acts").addEventListener("click", e => {
  const rm=e.target.closest("[data-rm]");
  if (rm){ e.stopPropagation(); customActs=customActs.filter(a=>a!==rm.dataset.rm); store(ACTS_KEY, customActs); render(); return }
  if (e.target.closest("#addAct")){ $("newActRow").hidden=false; $("newAct").focus(); return }
  const b=e.target.closest("button[data-act]"); if(!b || actEdit) return;
  S.draft.steps.splice(S.draft.steps.length-1, 0, {a:b.dataset.act, pre:"", mods:[]}); sel=null; render();
});
$("editActs").addEventListener("click", () => { actEdit=!actEdit; if(actEdit && !customActs.length) toast("직접 추가한 버튼만 지울 수 있어요"); render() });
function addAct(){
  const v=$("newAct").value.trim(); if(!v) return;
  if (allActs().includes(v)){ toast("이미 있는 버튼이에요"); return }
  customActs.push(v); store(ACTS_KEY, customActs);
  $("newAct").value=""; $("newActRow").hidden=true; render(); toast(`'${v}' 버튼 추가`);
}
$("newActOk").addEventListener("click", addAct);
$("newAct").addEventListener("keydown", e => { if(e.key==="Enter"){ e.preventDefault(); addAct() } });
$("newActCancel").addEventListener("click", () => { $("newAct").value=""; $("newActRow").hidden=true });

$("strip").addEventListener("click", e => {
  const b=e.target.closest(".step"); if(!b) return;
  const i=+b.dataset.i; sel = sel===i ? null : i; render();
});
const curStep = () => { const st=S.draft.steps; return st[sel!=null?sel:Math.max(0, st.length-2)] };
$("preMods").addEventListener("click", e => {
  const b=e.target.closest("button"), s=curStep(); if(!b||!s) return;
  s.pre = s.pre===b.dataset.pre ? "" : b.dataset.pre; render();
});
$("signMods").addEventListener("click", e => {
  const b=e.target.closest("button"), s=curStep(); if(!b||!s) return;
  const m=b.dataset.mod, i=s.mods.indexOf(m);
  i>=0 ? s.mods.splice(i,1) : s.mods.push(m); render();
});
function addCustom(){
  const v=$("custom").value.trim(), s=curStep(); if(!v) return;
  if(!s){ toast("먼저 동선 단계를 추가해줘"); return }
  s.mods.push(v); $("custom").value=""; render();
}
$("addCustom").addEventListener("click", addCustom);
$("custom").addEventListener("keydown", e => { if(e.key==="Enter"){ e.preventDefault(); addCustom() } });
$("undo").addEventListener("click", () => {
  const st=S.draft.steps, i = sel!=null ? sel : st.length-2;
  if (i<=0 || i>=st.length-1){ toast("하차와 도착은 고정이라 못 지워. 붙인 내용만 눌러서 빼줘"); return }
  st.splice(i, 1); sel=null; render();
});
$("clearSteps").addEventListener("click", () => { S.draft.steps=fixedEnds([]); sel=null; render() });

/* 스톱워치 */
const elapsed = () => timer.acc + (timer.run ? performance.now()-timer.start : 0);
const fmt = ms => { const t=Math.floor(ms/100), m=Math.floor(t/600), s=Math.floor(t/10)%60; return `${m}:${String(s).padStart(2,"0")}.${t%10}` };
function tick(){ $("clock").textContent = fmt(elapsed()); if(timer.run) timer.raf=requestAnimationFrame(tick) }
$("go").addEventListener("click", () => {
  if (!timer.run){
    timer.start=performance.now(); timer.run=true; $("go").textContent="멈춤"; $("go").classList.add("run"); tick();
  } else {
    timer.acc=elapsed(); timer.run=false; cancelAnimationFrame(timer.raf); tick();
    $("go").textContent="이어서"; $("go").classList.remove("run");
    const total=Math.round(timer.acc/1000);
    S.draft.min=String(Math.floor(total/60)); S.draft.sec=String(total%60);
    $("min").value=S.draft.min; $("sec").value=S.draft.sec; persist();
    toast(`${secText(total)} 기록했어`);
  }
});
function resetWatch(){ cancelAnimationFrame(timer.raf); timer={start:0,acc:0,run:false,raf:0}; $("clock").textContent="0:00.0"; $("go").textContent="시작"; $("go").classList.remove("run") }
$("resetWatch").addEventListener("click", resetWatch);

/* 등록 */
const intOrNull = v => { const n=parseInt(v); return Number.isFinite(n) ? n : null };
$("save").addEventListener("click", async () => {
  const D=S.draft;
  if ($("website").value) return;                                   // 스팸 봇 걸러내기
  if (!S.station.trim() || !String(S.line).trim()){ toast("역 이름이랑 호선을 먼저 적어줘"); return }
  const nb = neighbors(), terminal = nb && nb.length===1;
  if (!S.prev.trim() || (!S.next.trim() && !terminal)){ toast("양옆 역을 정해줘. 방향 구분에 필요해"); return }
  if (S.toiletId==null){ toast("도착한 화장실을 골라줘"); return }
  const custom = S.toiletId==="custom";
  if (custom && (!S.cGate || !S.cDetail.trim())){ toast("목록에 없는 화장실은 개찰구 안/밖이랑 위치를 적어줘"); return }
  if (!D.car || !D.door){ toast("하차 문(칸, 문)을 골라줘"); return }
  if (D.steps.length<3){ toast("하차와 도착 사이에 동선을 한 단계 이상 넣어줘"); return }
  if (!isTeam && Date.now()-lastSubmit < COOLDOWN_MS){ toast("조금만 있다가 다시 등록해줘"); return }

  const [from,to] = dirStations(S.dir);
  const row = {
    line:String(S.line).trim(), station:S.station.trim(), dir:S.dir, from_station:from.trim(), to_station:to.trim(),
    car:D.car, door:D.door, opp_door:D.opp.trim()||null, steps:clone(D.steps), seconds:draftSeconds(D),
    note:D.note.trim()||null, toilet_id: custom ? null : S.toiletId,
    gate: custom ? S.cGate : null, toilet_detail: custom ? S.cDetail.trim() : null, stalls: custom ? intOrNull(S.cStalls) : null,
    nickname:$("nickname").value.trim()||null,
    source: isTeam ? "team" : "user", status: isTeam ? "approved" : "pending",
  };
  if (isTeam) row.reviewed_at = new Date().toISOString();

  $("save").disabled = true;
  try {
    token = await API.token();
    await API.submitRoute(row, isTeam ? token : null);
    if (!isTeam) { mine.push({...row, at:Date.now()}); store(MINE_KEY, mine) }
    lastSubmit = Date.now();
    toast(isTeam ? "등록 완료! 바로 반영됐어" : "고마워! 팀 확인 후 반영할게");
    S.draft=blankDraft(); sel=null; resetWatch();
    const tl = stationToilets(); S.toiletId = tl.length===1 ? tl[0].id : null;   // 다음 경로는 다른 화장실일 수 있음
    S.cGate=""; S.cDetail=""; S.cStalls=""; fillInputs();
    await refresh();
  } catch(e) {
    toast(e.status===400 ? "입력값을 다시 확인해줘 (글자 수가 너무 길 수도 있어)" : "등록 실패. 잠시 후 다시 눌러줘");
  }
  $("save").disabled = false;
  render();
});

document.addEventListener("visibilitychange", () => { if (document.visibilityState==="visible" && conn!=="config") refresh() });

renderStatic(); render(); init();
