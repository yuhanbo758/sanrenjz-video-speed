import test from "node:test";
import assert from "node:assert/strict";
import { hostFromUrl, parseHost, parseSpeed, readSettings, resolvePolicy } from "../extension/policy.js";

test("默认全局 1×，开启控制", () => {
  assert.deepEqual(resolvePolicy(readSettings(), "example.com"), { enabled: true, speed: 1, matchedHost: null });
});
test("B 站 1.5×，腾讯 2×，其他站点 1.25×", () => {
  const settings = readSettings({ globalSpeed: 1.25, "site:bilibili.com": 1.5, "site:v.qq.com": 2 });
  for (const [url, speed] of [["https://www.bilibili.com/video/BV1", 1.5], ["https://v.qq.com/x/cover/1", 2], ["https://example.com", 1.25]]) {
    assert.equal(resolvePolicy(settings, hostFromUrl(url)).speed, speed);
  }
});
test("精确子域覆盖父域，匹配完整域名边界", () => {
  const settings = readSettings({ "site:bilibili.com": 1.5, "site:live.bilibili.com": 1, globalSpeed: 2 });
  assert.equal(resolvePolicy(settings, "m.bilibili.com").speed, 1.5);
  assert.equal(resolvePolicy(settings, "live.bilibili.com").speed, 1);
  assert.equal(resolvePolicy(settings, "evilbilibili.com").speed, 2);
  assert.equal(resolvePolicy(settings, "bilibili.com.evil.com").speed, 2);
});
test("更改全局不覆盖站点，删除站点后回退", () => {
  const raw = { "site:v.qq.com": 2, globalSpeed: 1.5 };
  assert.equal(resolvePolicy(readSettings({ ...raw, globalSpeed: 3 }), "v.qq.com").speed, 2);
  delete raw["site:v.qq.com"];
  assert.equal(resolvePolicy(readSettings(raw), "v.qq.com").speed, 1.5);
});
test("关闭时保留规则", () => {
  assert.deepEqual(resolvePolicy(readSettings({ enabled: false, "site:v.qq.com": 2 }), "v.qq.com"), { enabled: false, speed: 2, matchedHost: "v.qq.com" });
});
test("倍速边界、自定义两位小数与无效数据", () => {
  for (const speed of [0.25, 1.33, 4]) assert.equal(parseSpeed(String(speed)), speed);
  assert.equal(parseSpeed(1.333), 1.33);
  for (const bad of [null, [], true, "", "bad", NaN, Infinity, 0, -1, 0.24, 4.01]) assert.throws(() => parseSpeed(bad));
});
test("损坏存储回退默认值，忽略无效规则", () => {
  const settings = readSettings({ globalSpeed: "2", "site:bilibili.com": 100, "site:": 2, "site:evil.com/path": 1.5 });
  assert.equal(settings.globalSpeed, 1);
  assert.deepEqual(Object.keys(settings.rules), []);
});
test("域名规范化，排除内部页面和视频路径", () => {
  assert.equal(parseHost("https://WWW.BILIBILI.COM/"), "bilibili.com");
  assert.equal(parseHost("HTTPS://WWW.BILIBILI.COM/"), "bilibili.com");
  assert.equal(parseHost("v.qq.com"), "v.qq.com");
  assert.equal(parseHost("localhost:8080"), "localhost");
  assert.equal(hostFromUrl("https://www.bilibili.com.:443/a"), "bilibili.com");
  for (const url of ["chrome://extensions", "edge://newtab", "file:///tmp/video.mp4", "about:blank"]) assert.equal(hostFromUrl(url), null);
  for (const host of ["", "a b.com", "evil.com@bilibili.com", "bilibili.com/video/a", "ftp://example.com", "*.bilibili.com", "-invalid.com", "bad_name.com"]) assert.throws(() => parseHost(host));
});
