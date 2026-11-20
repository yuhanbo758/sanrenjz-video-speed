(() => {
  let generation = 0;
  async function refreshPolicy() {
    const request = ++generation;
    try {
      const result = await chrome.runtime.sendMessage({ type: "get-policy" });
      if (request !== generation || !result?.ok) return;
      document.dispatchEvent(new CustomEvent("sanrenjz-speed:policy", { detail: JSON.stringify(result.policy) }));
    } catch {
      // 扩展更新后旧页面的上下文可能失效，等待用户刷新，避免产生未处理的异常。
    }
  }
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") refreshPolicy();
  });
  document.addEventListener("sanrenjz-speed:ready", refreshPolicy);
  window.addEventListener("pageshow", refreshPolicy);
  refreshPolicy();
})();
