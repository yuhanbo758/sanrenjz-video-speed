import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const candidates = [process.env.PLAYWRIGHT_MODULE];
try { candidates.push(require.resolve("playwright")); } catch { /* 支持复用全局 CLI 安装。 */ }
if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs"));
let playwright;
for (const candidate of candidates.filter(Boolean)) {
  try { playwright = await import(pathToFileURL(candidate).href); break; } catch { /* 尝试下一个明确的模块入口。 */ }
}
if (!playwright) throw new Error("需要 Playwright；请安装或设置 PLAYWRIGHT_MODULE，参见 README");
let chromiumPath = process.env.CHROMIUM_PATH || playwright.chromium.executablePath();
if (!existsSync(chromiumPath) && !process.env.CHROMIUM_PATH && process.platform === "win32") {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const installed = (await readdir(cache).catch(() => [])).filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const dir of installed) {
    const candidate = path.join(cache, dir, "chrome-win64/chrome.exe");
    if (existsSync(candidate)) { chromiumPath = candidate; break; }
  }
}
const profile = await mkdtemp(path.join(os.tmpdir(), "sanrenjz-speed-profile-"));
const artifacts = process.env.E2E_ARTIFACT_DIR || await mkdtemp(path.join(os.tmpdir(), "sanrenjz-speed-qa-"));
await mkdir(artifacts, { recursive: true });
const errors = [];
let context;

function wav() {
  const samples = 16000 * 20;
  const data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF", 0); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(samples * 2, 40);
  return data;
}
const sound = wav();
const media = '<video id="video" src="/tone.wav" muted controls></video><audio id="audio" src="/tone.wav" muted></audio>';
const fixture = `<!doctype html><html><head><title>倍速扩展测试页</title></head><body><h1>倍速扩展测试页</h1>${media}
<div id="open-host"></div><div id="closed-host"></div>
<iframe id="cross" src="http://player.cdn.test/frame"></iframe>
<iframe id="same" src="/frame"></iframe>
<iframe id="blank" srcdoc="&lt;video id='video'&gt;&lt;/video&gt;"></iframe>
<script>
document.getElementById('open-host').attachShadow({mode:'open'}).innerHTML = '<video id="shadow-video"></video>';
window.closedRoot = document.getElementById('closed-host').attachShadow({mode:'closed'});
closedRoot.innerHTML = '<video id="closed-video"></video>';
<\/script></body></html>`;

async function start() {
  context = await playwright.chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: chromiumPath,
    viewport: { width: 1100, height: 850 },
    args: [`--disable-extensions-except=${path.join(root, "extension")}`, `--load-extension=${path.join(root, "extension")}`, "--autoplay-policy=no-user-gesture-required"],
  });
  await context.route(/^http:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/tone.wav") return route.fulfill({ status: 200, contentType: "audio/wav", body: sound });
    return route.fulfill({ status: 200, contentType: "text/html", body: url.pathname === "/frame" ? `<!doctype html><title>播放器</title>${media}` : fixture });
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") errors.push(message.text()); });
  });
  return context.serviceWorkers()[0] || context.waitForEvent("serviceworker");
}

async function eventually(callback, message) {
  const until = Date.now() + 10000;
  let cause;
  while (Date.now() < until) {
    try { await callback(); return; } catch (error) { cause = error; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${message}: ${cause?.message}`);
}

async function expectRates(page, speed) {
  await eventually(async () => {
    assert.equal(await page.locator("#video").evaluate((video) => video.playbackRate), speed);
    assert.equal(await page.locator("#audio").evaluate((audio) => audio.playbackRate), speed);
    assert.equal(await page.locator("#video").evaluate((video) => video.defaultPlaybackRate), speed);
  }, `顶层媒体应为 ${speed}×`);
}

async function expectFrames(page, speed) {
  await eventually(async () => {
    const frames = page.frames().filter((frame) => frame !== page.mainFrame());
    assert.equal(frames.length, 3);
    for (const frame of frames) assert.equal(await frame.locator("#video").evaluate((video) => video.playbackRate), speed);
  }, `iframe 应继承顶层 ${speed}×`);
}

async function setGlobal(popup, speed) {
  await popup.locator("#global-speed").fill(String(speed));
  await popup.locator("#global-form").getByRole("button", { name: "保存", exact: true }).click();
  await eventually(async () => assert.match(await popup.locator("#status").innerText(), new RegExp(`全局默认倍速已设为 ${speed}`)), "全局保存反馈");
}

try {
  const worker = await start();
  console.log(`Chromium: ${context.browser()?.version()}\nBrowser plugin not available；使用 Playwright 隔离配置加载实际扩展`);
  await worker.evaluate(() => chrome.storage.local.clear());
  const extensionId = new URL(worker.url()).host;
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  const popup = await context.newPage();
  const bili = await context.newPage();
  await bili.goto("http://www.bilibili.com/video/test");
  await popup.goto(popupUrl);
  assert.equal(await popup.title(), "三人聚智 · 视频倍速");
  await popup.locator("#host").filter({ hasText: "bilibili.com" }).waitFor();
  assert.ok(await popup.getByRole("heading", { name: "视频倍速", exact: true }).isVisible());
  await expectRates(bili, 1);

  await setGlobal(popup, 1.25);
  await expectRates(bili, 1.25);
  await popup.getByRole("button", { name: "1.5×", exact: true }).click();
  await expectRates(bili, 1.5);
  await expectFrames(bili, 1.5);
  await eventually(async () => {
    assert.deepEqual(await bili.evaluate(() => [document.querySelector("#open-host").shadowRoot.querySelector("video").playbackRate, closedRoot.querySelector("video").playbackRate]), [1.5, 1.5]);
  }, "开放/关闭 Shadow DOM 媒体");
  console.log("PASS 全局默认、B 站专属、跨域/同域/srcdoc iframe、Shadow DOM");

  await bili.evaluate(() => {
    window.rateEvents = 0;
    const video = document.querySelector("#video");
    video.addEventListener("ratechange", () => { window.rateEvents++; video.playbackRate = 1; });
    for (let i = 0; i < 20; i++) { video.playbackRate = 1; video.defaultPlaybackRate = 1; }
  });
  await expectRates(bili, 1.5);
  assert.ok(await bili.evaluate(() => window.rateEvents < 10), "不应陷入倍速事件循环");
  await bili.evaluate(() => {
    document.querySelector("#video").remove();
    const video = document.createElement("video"); video.id = "video"; video.src = "/tone.wav"; video.muted = true;
    document.body.append(video);
    history.pushState({}, "", "/video/next");
    document.querySelector("#open-host").shadowRoot.innerHTML = '<video id="new-shadow"></video>';
  });
  await expectRates(bili, 1.5);
  await eventually(async () => assert.equal(await bili.locator("#new-shadow").evaluate((video) => video.playbackRate), 1.5), "动态 Shadow DOM 视频");
  await bili.evaluate(() => {
    window.closedHost = document.querySelector("#closed-host");
    closedHost.remove();
  });
  // 等待移除记录被处理后重挂载，覆盖关闭 Shadow DOM 观察器的恢复路径。
  await bili.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await bili.evaluate(() => {
    document.body.append(closedHost);
    closedRoot.innerHTML = '<video id="remounted"></video>';
  });
  await eventually(async () => assert.equal(await bili.evaluate(() => closedRoot.querySelector("video").playbackRate), 1.5), "关闭 Shadow DOM 重挂载后动态媒体");
  await bili.locator("#video").evaluate((video) => video.play());
  const before = await bili.locator("#video").evaluate((video) => video.currentTime);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const elapsed = await bili.locator("#video").evaluate((video) => video.currentTime);
  assert.ok(elapsed - before > 1.15 && elapsed - before < 2, `实际媒体时钟增量：${elapsed - before}`);
  await bili.locator("#video").evaluate((video) => video.pause());
  await bili.reload();
  await expectRates(bili, 1.5);
  console.log("PASS 网站强制重置、无事件循环、SPA 换集、动态媒体、实际播放时钟、刷新记忆");

  const tencent = await context.newPage();
  await tencent.goto("http://v.qq.com/x/cover/test");
  await popup.reload();
  await popup.locator("#host").filter({ hasText: "v.qq.com" }).waitFor();
  await popup.getByRole("button", { name: "2×", exact: true }).click();
  await expectRates(tencent, 2);
  await expectFrames(tencent, 2);
  await expectRates(bili, 1.5);
  await setGlobal(popup, 1.75);
  await expectRates(tencent, 2);
  await expectRates(bili, 1.5);
  const other = await context.newPage();
  await other.goto("http://other.test/watch");
  await expectRates(other, 1.75);
  console.log("PASS 腾讯 2× 与 B 站 1.5× 独立保存，全局变更只影响未设规则的站点");

  await tencent.bringToFront();
  await popup.reload();
  await popup.locator("#host").filter({ hasText: "v.qq.com" }).waitFor();
  await popup.locator("#rules-panel").evaluate((details) => { details.open = true; });
  await popup.locator("#add-host").fill("live.bilibili.com");
  await popup.locator("#add-speed").fill("1");
  await popup.getByRole("button", { name: "添加", exact: true }).click();
  await popup.getByLabel("删除 live.bilibili.com 规则", { exact: true }).waitFor();
  await popup.setViewportSize({ width: 390, height: 760 });
  await popup.screenshot({ path: path.join(artifacts, "popup-tencent-rules.png"), fullPage: true });
  assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const live = await context.newPage();
  await live.goto("http://live.bilibili.com/room");
  await expectRates(live, 1);

  await tencent.bringToFront();
  await popup.reload();
  await popup.locator("#enabled").uncheck();
  await expectRates(tencent, 1);
  await expectRates(bili, 1);
  await expectFrames(tencent, 1);
  await tencent.locator("#video").evaluate((video) => { video.playbackRate = 1.2; });
  assert.equal(await tencent.locator("#video").evaluate((video) => video.playbackRate), 1.2);
  await popup.locator("#enabled").check();
  await expectRates(tencent, 2);
  await expectRates(bili, 1.5);
  console.log("PASS 子域优先、规则管理、暂停恢复与停止强制控制");

  await popup.locator("#follow-global").click();
  await expectRates(tencent, 1.75);
  await expectFrames(tencent, 1.75);
  await popup.locator("#site-speed").fill("1.33");
  await popup.locator("#site-form").getByRole("button", { name: "保存到此站点" }).click();
  await expectRates(tencent, 1.33);
  await eventually(async () => assert.equal(await popup.locator("#current-speed").innerText(), "1.33"), "自定义倍速界面更新");
  await popup.screenshot({ path: path.join(artifacts, "popup-custom.png"), fullPage: true });
  console.log("PASS 移除站点后跟随全局、自定义 1.33×");

  await context.close();
  const restarted = await start();
  const persisted = await restarted.evaluate(() => chrome.storage.local.get(null));
  assert.equal(persisted["site:bilibili.com"], 1.5);
  assert.equal(persisted["site:v.qq.com"], 1.33);
  assert.equal(persisted.globalSpeed, 1.75);
  const reopened = await context.newPage();
  await reopened.goto("http://v.qq.com/x/cover/reopened");
  await expectRates(reopened, 1.33);
  const internalPopup = await context.newPage();
  await internalPopup.goto(popupUrl);
  await internalPopup.locator("#host").filter({ hasText: "此页面不支持倍速控制" }).waitFor();
  assert.equal(await internalPopup.locator("#site-speed").isDisabled(), true);
  console.log("PASS 浏览器重启后配置持久化并自动生效");
  assert.deepEqual(errors, [], "控制台不应有相关警告或错误");
  console.log(`PASS 页面身份、非空界面、控制台健康、截图、操作结果\n截图目录：${artifacts}\n测试配置：${profile}`);
} finally {
  if (context) await context.close();
}
