(function () {
  const storageKey = "xqx.auth.session.v1";
  const config = () => window.XQX_CONFIG || {};
  const ready = () => Boolean(config().supabaseUrl && config().supabaseAnonKey);
  const now = () => Math.floor(Date.now() / 1000);

  function session() {
    try { return JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { return null; }
  }
  function save(next) { localStorage.setItem(storageKey, JSON.stringify(next)); }
  function clear() { localStorage.removeItem(storageKey); }
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
  function decodeExpiry(token) {
    try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp || 0; } catch { return 0; }
  }
  function message(reason) {
    return ({ invalid_input: "请检查填写内容", account_unavailable: "该账号不可用或已存在", invalid_credentials: "账号或密码不正确", invalid_recovery: "恢复码无效、已使用或已过期", rate_limited: "尝试过于频繁，请稍后再试", service_unavailable: "服务暂时不可用，请稍后重试" })[reason] || "请求未完成，请稍后重试";
  }
  async function call(name, body) {
    if (!ready()) throw new Error("missing_config");
    const response = await fetch(`${config().supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: config().supabaseAnonKey }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) { const error = new Error(data.reason || "request_failed"); error.status = response.status; error.data = data; throw error; }
    return data;
  }
  async function callAuthenticated(name, body) {
    const token = await accessToken();
    if (!token) { const error = new Error("invalid_session"); error.status = 401; throw error; }
    if (!ready()) throw new Error("missing_config");
    const response = await fetch(`${config().supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: config().supabaseAnonKey, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) { const error = new Error(data.reason || "request_failed"); error.status = response.status; error.data = data; throw error; }
    return data;
  }
  async function accessToken() {
    const current = session();
    if (!current) return null;
    if (decodeExpiry(current.access_token) > now() + 45) return current.access_token;
    if (!ready() || !current.refresh_token) { clear(); return null; }
    const response = await fetch(`${config().supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: config().supabaseAnonKey, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: current.refresh_token }) });
    const refreshed = await response.json().catch(() => null);
    if (!response.ok || !refreshed?.access_token) { clear(); return null; }
    save({ access_token: refreshed.access_token, refresh_token: refreshed.refresh_token });
    return refreshed.access_token;
  }
  window.XQXAuth = {
    configured: ready,
    message,
    session,
    clear,
    async register(account, password) { const data = await call("auth-register", { account, password, request_id: uuid() }); save({ access_token: data.access_token, refresh_token: data.refresh_token }); return data; },
    async login(account, password) { const data = await call("auth-login", { account, password }); save({ access_token: data.access_token, refresh_token: data.refresh_token }); return data; },
    async resetPassword(account, recoveryCode, newPassword) { return call("auth-reset-password", { account, recovery_code: recoveryCode, new_password: newPassword, request_id: uuid() }); },
    async changePassword(currentPassword, newPassword) { return callAuthenticated("auth-change-password", { current_password: currentPassword, new_password: newPassword }); },
    async profile() {
      const token = await accessToken(); if (!token) return null;
      const response = await fetch(`${config().supabaseUrl.replace(/\/$/, "")}/rest/v1/profiles?select=points_balance,free_diy_available,appearance,created_at`, { headers: { apikey: config().supabaseAnonKey, Authorization: `Bearer ${token}` } });
      if (!response.ok) return null; const rows = await response.json(); return rows[0] || null;
    },
    async saveAppearance(appearance) { return callAuthenticated("profile-save-appearance", { appearance }); },
  };
})();
