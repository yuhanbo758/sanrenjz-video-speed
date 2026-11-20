import { parseHost, parseSpeed } from "./policy.js";

const $ = (id) => document.getElementById(id);
const presets = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];
let state;
let busy = false;

async function request(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error ?? "操作失败，请重新打开插件");
  return result;
}

function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}

function render() {
  const { host, settings, policy } = state;
  $("enabled").checked = settings.enabled;
  document.body.classList.toggle("paused", !settings.enabled);
  $("host").textContent = host ?? "此页面不支持倍速控制";
  $("current-speed").textContent = settings.enabled ? String(policy.speed) : "—";
  $("source").textContent = !settings.enabled ? "已暂停" : policy.matchedHost ? "站点专属" : "跟随全局";
  $("site-help").textContent = !settings.enabled ? "开启开关后，恢复已保存的倍速" : host ? "选择倍速，自动记住此站点" : "请打开普通 HTTP / HTTPS 视频网页";
  $("site-speed").value = policy.speed;
  $("global-speed").value = settings.globalSpeed;
  $("follow-global").disabled = !host || !policy.matchedHost;
  $("follow-global").textContent = policy.matchedHost && policy.matchedHost !== host ? `移除 ${policy.matchedHost} 规则` : "恢复跟随全局倍速";
  $("site-form").querySelectorAll("input, button").forEach((element) => { element.disabled = !host; });
  $("presets").replaceChildren(...presets.map((speed) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    button.textContent = `${speed}×`;
    button.setAttribute("aria-pressed", String(speed === policy.speed));
    button.disabled = !host;
    button.addEventListener("click", () => mutate({ type: "set-site", host, speed }, `已记住 ${host}：${speed}×`));
    return button;
  }));

  const rules = Object.entries(settings.rules).sort(([a], [b]) => a.localeCompare(b));
  $("rule-count").textContent = rules.length;
  $("rules").replaceChildren(...rules.map(([host, speed]) => {
    const row = document.createElement("li");
    const domain = document.createElement("span");
    domain.className = "domain";
    domain.textContent = host;
    const value = document.createElement("span");
    value.className = "rule-speed";
    value.textContent = `${speed}×`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "删除";
    remove.setAttribute("aria-label", `删除 ${host} 规则`);
    remove.addEventListener("click", () => mutate({ type: "remove-site", host }, `已删除 ${host} 规则`));
    row.append(domain, value, remove);
    return row;
  }));
  if (!rules.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "还没有专属设置，所有站点跟随全局倍速。";
    $("rules").append(empty);
  }
}

async function refresh() {
  state = await request({ type: "get-state" });
  render();
}

async function mutate(message, text) {
  if (busy) return;
  busy = true;
  document.body.setAttribute("aria-busy", "true");
  document.querySelector("main").inert = true;
  $("enabled").disabled = true;
  try {
    await request(message);
    await refresh();
    status(state.settings.enabled ? text : `${text}；当前已暂停`);
  } catch (error) {
    status(error.message, true);
    if (state) render();
  } finally {
    busy = false;
    document.body.removeAttribute("aria-busy");
    document.querySelector("main").inert = false;
    $("enabled").disabled = false;
  }
}

$("enabled").addEventListener("change", (event) => mutate({ type: "set-enabled", enabled: event.target.checked }, event.target.checked ? "已启用，设置立即生效" : "已暂停，当前媒体恢复 1×"));
$("site-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const speed = parseSpeed($("site-speed").value);
    mutate({ type: "set-site", host: state.host, speed }, `已记住 ${state.host}：${speed}×`);
  } catch (error) { status(error.message, true); }
});
$("global-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const speed = parseSpeed($("global-speed").value);
    mutate({ type: "set-global", speed }, `全局默认倍速已设为 ${speed}×`);
  } catch (error) { status(error.message, true); }
});
$("follow-global").addEventListener("click", () => mutate({ type: "remove-site", host: state.policy.matchedHost }, "已移除规则，按剩余规则或全局倍速播放"));
$("add-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const host = parseHost($("add-host").value);
    const speed = parseSpeed($("add-speed").value);
    mutate({ type: "set-site", host, speed }, `已记住 ${host}：${speed}×`);
  } catch (error) { status(error.message, true); }
});
refresh().catch((error) => status(error.message, true));
