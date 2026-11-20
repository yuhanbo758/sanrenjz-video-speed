import test from "node:test";
import assert from "node:assert/strict";

let listener;
const stored = Object.create(null);
globalThis.chrome = {
  runtime: {
    getURL: (file) => `chrome-extension://test/${file}`,
    onMessage: { addListener: (callback) => { listener = callback; } },
  },
  tabs: { query: async () => [{ url: "https://www.bilibili.com/video/test" }] },
  storage: {
    local: {
      get: async () => ({ ...stored }),
      set: async (values) => Object.assign(stored, values),
      remove: async (key) => { delete stored[key]; },
    },
  },
};
await import("../extension/background.js");
const popupSender = { url: "chrome-extension://test/popup.html" };
const frameSender = { url: "https://cdn.test/player", tab: { url: "https://www.bilibili.com/video/test" } };
function request(message, sender = popupSender) {
  return new Promise((resolve) => listener(message, sender, resolve));
}
test("后台存储与来源校验", async (t) => {
  await t.test("内容脚本不能写入设置", async () => {
    assert.equal((await request({ type: "set-global", speed: 3 }, frameSender)).ok, false);
    assert.equal(stored.globalSpeed, undefined);
  });
  await t.test("独立站点写入不覆盖其他规则", async () => {
    const results = await Promise.all([
      request({ type: "set-site", host: "bilibili.com", speed: 1.5 }),
      request({ type: "set-site", host: "v.qq.com", speed: 2 }),
    ]);
    assert.ok(results.every((result) => result.ok));
    assert.equal(stored["site:bilibili.com"], 1.5);
    assert.equal(stored["site:v.qq.com"], 2);
  });
  await t.test("跨域 iframe 按顶层标签页选择规则", async () => {
    const result = await request({ type: "get-policy" }, frameSender);
    assert.equal(result.ok, true);
    assert.equal(result.policy.speed, 1.5);
    assert.equal(result.policy.matchedHost, "bilibili.com");
  });
  await t.test("无效倍速或开关参数不落盘", async () => {
    assert.equal((await request({ type: "set-site", host: "bilibili.com", speed: 99 })).ok, false);
    assert.equal((await request({ type: "set-enabled", enabled: "false" })).ok, false);
    assert.equal(stored["site:bilibili.com"], 1.5);
    assert.equal(stored.enabled, undefined);
  });
  await t.test("弹窗解析顶层当前域名及删除后的全局回退", async () => {
    await request({ type: "set-global", speed: 1.25 });
    await request({ type: "remove-site", host: "bilibili.com" });
    const state = await request({ type: "get-state" });
    assert.equal(state.host, "bilibili.com");
    assert.equal(state.policy.speed, 1.25);
    assert.equal(stored["site:v.qq.com"], 2);
  });
});
