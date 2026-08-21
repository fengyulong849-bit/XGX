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
    if (reason === "appearance_locked") return "当前领导状态正常，重新捏领导需在其倒地后进行";
    if (reason === "invalid_request") return "请求参数无效，请重试";
    return ({ invalid_input: "请检查填写内容", account_unavailable: "该账号不可用或已存在", invalid_credentials: "账号或密码不正确", invalid_recovery: "恢复码无效、已使用或已过期", rate_limited: "尝试过于频繁，请稍后再试", pet_down: "领导已经倒下，请先复活或重新捏一位", pet_locked: "领导正在缓冲中，请稍等几秒", pet_not_down: "领导目前没有倒下", insufficient_points: "积分不足，先去签到或完成其他任务赚积分", invalid_action: "无效的互动动作", invalid_work_preferences: "下班时间或提醒间隔不符合规则", preferences_unavailable: "设置暂未同步，请稍后重试", invalid_content: "吐槽内容需为 1–50 个字符", sensitive_content: "内容可能含有联系方式或身份信息，请修改后再发布", limit_exceeded: "今天的次数已用完", rant_unavailable: "这条吐槽已不可共鸣", self_resonance: "不能给自己的吐槽共鸣", nothing_to_claim: "暂时没有可领取的共鸣", service_unavailable: "请求未完成，请稍后再试" })[reason] || "请求未完成，请稍后重试";
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
  async function callPublicGet(name, query = {}) {
    if (!ready()) throw new Error("missing_config");
    const url = new URL(`${config().supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const response = await fetch(url, { headers: { apikey: config().supabaseAnonKey } });
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
    async checkin() { return callAuthenticated("checkin-sign", {}); },
    async petAction(action, requestId) { return callAuthenticated("pet-action", { action, request_id: requestId }); },
    async petRevive(requestId) { return callAuthenticated("pet-revive", { request_id: requestId }); },
    async createRant(content, requestId) { return callAuthenticated("rants-create", { content, request_id: requestId }); },
    async resonance(rantId, requestId) { return callAuthenticated("resonance-create", { rant_id: rantId, request_id: requestId }); },
    async randomRants(limit = 9) { return callPublicGet("rants-random", { limit }); },
    async myRants() { return callAuthenticated("rants-mine", {}); },
    async pointsLedger(limit = 50) { return callAuthenticated("points-ledger", { limit }); },
    async claimResonance(rantId, requestId) { return callAuthenticated("resonance-claim", { rant_id: rantId, request_id: requestId }); },
    async completeCare(careType, requestId) { return callAuthenticated("care-complete", { care_type: careType, request_id: requestId }); },
    async completeRelease(rantId, requestId) { return callAuthenticated("release-complete", { rant_id: rantId, request_id: requestId }); },
    async profile() {
      const data = await callAuthenticated("profile-me", {});
      return data.profile || null;
    },
    async pet() { return callAuthenticated("pet-get", {}); },
    async saveAppearance(appearance, requestId) { return callAuthenticated("profile-save-appearance", { appearance, request_id: requestId || uuid() }); },
    async saveWorkPreferences(preferences) { return callAuthenticated("work-preferences-save", preferences); },
  };
})();
