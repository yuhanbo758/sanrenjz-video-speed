import { hostFromUrl, parseHost, parseSpeed, readSettings, resolvePolicy, RULE_PREFIX } from "./policy.js";

async function handleMessage(message, sender) {
  if (message.type === "get-policy") {
    const settings = readSettings(await chrome.storage.local.get(null));
    // 内嵌播放器使用顶层标签页的站点规则，不能让 CDN/iframe 域名抢走站点设置。
    const host = hostFromUrl(sender.tab?.url);
    return { policy: resolvePolicy(settings, host) };
  }

  // 网页内容脚本只能读取策略；写入设置必须来自扩展自己的弹窗。
  if (sender.url !== chrome.runtime.getURL("popup.html")) throw new Error("不支持的请求来源");
  switch (message.type) {
    case "get-state": {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const settings = readSettings(await chrome.storage.local.get(null));
      const host = hostFromUrl(tab?.url);
      return { settings, host, policy: resolvePolicy(settings, host) };
    }
    case "set-enabled":
      if (typeof message.enabled !== "boolean") throw new Error("开关参数无效");
      await chrome.storage.local.set({ enabled: message.enabled });
      break;
    case "set-global":
      await chrome.storage.local.set({ globalSpeed: parseSpeed(message.speed) });
      break;
    case "set-site":
      await chrome.storage.local.set({ [RULE_PREFIX + parseHost(message.host)]: parseSpeed(message.speed) });
      break;
    case "remove-site":
      await chrome.storage.local.remove(RULE_PREFIX + parseHost(message.host));
      break;
    default:
      throw new Error("未知操作");
  }
  return {};
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;
  handleMessage(message, sender).then(
    (result) => sendResponse({ ok: true, ...result }),
    (error) => sendResponse({ ok: false, error: error.message }),
  );
  return true;
});
