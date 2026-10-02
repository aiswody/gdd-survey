// Supabase REST API를 fetch로 직접 호출 (라이브러리 없이)
const SESSION_KEY = "gdd-session";

const API = {
  async req(path, { method = "GET", body, token, prefer } = {}) {
    // 로그인 안 한 사용자는 apikey만 보냄 (publishable key는 Bearer 토큰으로 쓰면 안 됨)
    const headers = { apikey: CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(CONFIG.SUPABASE_URL + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = new Error(await res.text());
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  // 공개 데이터
  stations(token) { return this.req("/rest/v1/stations?select=*&order=line,name", { token }) },
  approvedRoutes(token) { return this.req("/rest/v1/routes?select=*&status=eq.approved&order=created_at", { token }) },
  submitRoute(row, token) { return this.req("/rest/v1/routes", { method: "POST", body: row, token, prefer: "return=minimal" }) },

  // 팀 전용
  allRoutes(token) { return this.req("/rest/v1/routes?select=*&order=created_at.desc", { token }) },
  setStatus(id, status, token) {
    return this.req(`/rest/v1/routes?id=eq.${id}`, {
      method: "PATCH", token, prefer: "return=minimal",
      body: { status, reviewed_at: status === "pending" ? null : new Date().toISOString() },
    });
  },
  deleteRoute(id, token) { return this.req(`/rest/v1/routes?id=eq.${id}`, { method: "DELETE", token }) },
  upsertStation(row, token) {
    return this.req("/rest/v1/stations?on_conflict=line,name", {
      method: "POST", body: row, token, prefer: "resolution=merge-duplicates,return=minimal",
    });
  },
  async isAdmin(token) {
    const rows = await this.req("/rest/v1/admins?select=user_id", { token });
    return rows.length > 0;
  },

  // 로그인 (팀원만. 가입은 Supabase 대시보드에서 직접 만듦)
  async login(email, password) {
    const s = await this.req("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
    this.saveSession(s);
    return s;
  },
  logout() { try { localStorage.removeItem(SESSION_KEY) } catch (e) {} },
  saveSession(s) {
    const session = { access_token: s.access_token, refresh_token: s.refresh_token,
      expires_at: Date.now() + (s.expires_in - 60) * 1000, email: s.user?.email || "" };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch (e) {}
    return session;
  },
  // 저장된 로그인이 있으면 유효한 토큰을 돌려줌. 없으면 null
  async token() {
    let s;
    try { s = JSON.parse(localStorage.getItem(SESSION_KEY)) } catch (e) {}
    if (!s) return null;
    if (Date.now() < s.expires_at) return s.access_token;
    try {
      const fresh = await this.req("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh_token } });
      return this.saveSession(fresh).access_token;
    } catch (e) {
      this.logout();
      return null;
    }
  },
  email() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)).email } catch (e) { return "" } },
};

// 두 페이지가 같이 쓰는 표시용 함수
const stepText = s => (s.pre ? s.pre + " " : "") + s.a + (s.mods && s.mods.length ? " (" + s.mods.join(", ") + ")" : "");
const doorText = r => r.car && r.door ? `${r.car}-${r.door}` : "";
const secText = sec => {
  if (sec == null || sec === "") return "";
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m}분${s ? " " + s + "초" : ""}` : `${s}초`;
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 1800);
}
