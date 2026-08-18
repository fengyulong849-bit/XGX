// P1 认证降级桥：3D 外部模块加载失败时，账号功能仍保持可用。
(function () {
  if (window.switchAuthTab) return;
  const $ = (id) => document.getElementById(id);
  function toast(message, type = "amber") {
    const wrap = $("toastWrap");
    if (!wrap) return;
    const el = document.createElement("div"); el.className = `toast ${type}`; el.textContent = message; wrap.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
  function closeModal(id) { const modal = $(id); if (modal) modal.classList.remove("show"); document.body.style.overflow = ""; }
  function openModal(id) { const modal = $(id); if (modal) { modal.classList.add("show"); document.body.style.overflow = "hidden"; } }
  function switchAuthTab(tab) {
    document.querySelectorAll("#modal-auth .modal-body").forEach((body) => body.classList.add("hidden"));
    $(tab === "login" ? "auth-login" : "auth-register")?.classList.remove("hidden");
  }
  function genAccount() { $("reg-account").value = `xqx${Math.random().toString(36).slice(2, 13)}`.replace(/[^a-z0-9]/g, ""); }
  function validPassword(value) { return value.length >= 8 && value.length <= 32 && Number(/[a-zA-Z]/.test(value)) + Number(/\d/.test(value)) + Number(/[^a-zA-Z\d]/.test(value)) >= 2; }
  async function doLogin() {
    const account = $("login-account").value.trim().toLowerCase(), password = $("login-password").value;
    if (!/^[a-z0-9_]{4,20}$/.test(account) || !validPassword(password)) { toast("账号或密码格式不正确", "rose"); return; }
    try { const result = await XQXAuth.login(account, password); document.documentElement.dataset.state = "auth"; $("nav-cta")?.style.setProperty("display", "none"); $("nav-avatar")?.style.setProperty("display", "flex"); closeModal("modal-auth"); toast(`登录成功 · ${result.profile.points_balance} 积分`, "calm"); } catch (error) { toast(XQXAuth.message(error.message), "rose"); }
  }
  async function doRegister() {
    const account = $("reg-account").value.trim().toLowerCase(), password = $("reg-password").value;
    if (!/^[a-z0-9_]{4,20}$/.test(account) || !validPassword(password)) { toast("账号或密码格式不正确", "rose"); return; }
    try { const result = await XQXAuth.register(account, password); $("recovery-code").textContent = result.recovery_code; document.querySelectorAll("#modal-auth .modal-body").forEach((body) => body.classList.add("hidden")); $("auth-recovery").classList.remove("hidden"); } catch (error) { toast(XQXAuth.message(error.message), "rose"); }
  }
  function copyRecovery() { navigator.clipboard?.writeText($("recovery-code").textContent).then(() => toast("恢复码已复制", "calm")); }
  function downloadRecovery() { const blob = new Blob([`小确闲恢复码\n${$("recovery-code").textContent}\n请妥善保存，丢失无法找回`], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "小确闲_恢复码.txt"; a.click(); }
  function recoverySaved() { document.querySelectorAll("#modal-auth .modal-body").forEach((body) => body.classList.add("hidden")); $("auth-welcome").classList.remove("hidden"); document.documentElement.dataset.state = "auth"; }
  Object.assign(window, { openModal, closeModal, switchAuthTab, genAccount, doLogin, doRegister, copyRecovery, downloadRecovery, recoverySaved });
})();
