# 三人聚智 · 视频倍速

一个精简的 Chrome / Edge Manifest V3 扩展。参考 [Global Speed](https://github.com/polywock/globalSpeed) 的核心思路，独立实现全局默认倍速和站点倍速记忆。无运行时第三方依赖、无账号、无遥测。

**文档与更多工具：[docs.sanrenjz.com](https://docs.sanrenjz.com)** · 源码仓库：[sanrenjz-video-speed](https://github.com/yuhanbo758/sanrenjz-video-speed)

弹窗顶部提供文档站和开发者 GitHub 主页入口，由用户主动点击访问。

## 安装

前往 [GitHub Releases 下载最新版](https://github.com/yuhanbo758/sanrenjz-video-speed/releases/latest)，在发布页的附件中按浏览器选择文件：

- **Chrome／Edge**：选择 `sanrenjz-video-speed-<版本>.zip`，解压后按下方步骤加载。需要浏览器 119 或更高版本。
- **360 浏览器**：选择 `sanrenjz-video-speed-<版本>-360.crx`。能否直接安装取决于浏览器版本和安装策略。

1. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`。
2. 开启「开发者模式」，点击「加载已解压的扩展程序」。
3. 选择 ZIP 解压后包含 `manifest.json` 的文件夹。从源码安装时，可选择 **extension** 或构建后的 **dist/unpacked** 文件夹。
4. 将扩展固定到工具栏。安装前已打开的视频页面需刷新一次。

可分发 ZIP：运行 `npm run build`，得到 `dist/sanrenjz-video-speed-1.0.1.zip`。ZIP 解压后再通过上述方式加载。商店是否已提交、审核或上架以对应平台状态为准，此 ZIP 不包含签名 CRX。

## 使用

- 在 B 站打开插件，点击 **1.5×**：立即应用并记住 `bilibili.com`，之后打开、刷新、换集都使用 1.5×。
- 在腾讯视频打开插件，点击 **2×**：记住 `v.qq.com`，与 B 站设置分别保存。
- 修改「全局默认倍速」并保存：没有站点规则的网页使用此倍速，已有站点规则保留。
- 支持 **0.25～4×** 自定义倍速；常用按钮点击后自动保存，不用再点一次保存。
- 「站点倍速」中可以预先添加域名、覆盖已有设置、删除规则。
- 点击「恢复跟随全局倍速」删除当前匹配规则。如果还存在父域规则，则继续继承父域；可在规则列表删除相应父域规则。
- 关闭右上角开关：当前受控媒体恢复 1×，停止强制倍速；保留全部设置，重新开启时恢复。

规则包含子域名，更具体的域名优先。例如 `bilibili.com` 包含 `m.bilibili.com`；添加 `live.bilibili.com = 1` 可单独让直播使用原速。`www.` 视为同一个站点。不会把所有腾讯服务合并为 `qq.com`，以免影响其他腾讯站点。

网页自带播放器菜单的倍速可能被插件覆盖；请通过插件设置需要长期记住的倍速。支持标准 HTML 视频和音频，包括动态加入的媒体、单页应用换集、Shadow DOM 以及 iframe。iframe 使用顶层网页的规则，不以视频 CDN 域名决定倍速。

## 开发和验证

```powershell
npm test
npm run build
npm run test:e2e
```

前两条命令只需要 Node.js 20+，无需 npm install。E2E 使用 Playwright 和可加载扩展的 Chromium：优先使用本项目已安装的 `playwright`，也支持环境变量 `PLAYWRIGHT_MODULE` 指定模块入口、`CHROMIUM_PATH` 指定浏览器，以及本机已有的全局 Playwright CLI 环境。Windows 下默认浏览器缺失时会尝试已有的 Chromium 缓存。其他电脑可先执行 `npm install --no-save playwright` 和 `npx playwright install chromium`。

浏览器测试使用临时独立配置与拦截的站点测试页，不访问用户账号、不修改日常浏览器配置。截图保存到系统临时目录；可通过 `E2E_ARTIFACT_DIR` 指定目录。

```text
extension/      可直接加载的扩展源码
  background.js 存储写入校验、顶层站点策略解析
  policy.js     倍速校验、域名规范化、规则优先级
  content.js    隔离世界读取并转发策略
  media.js      主世界控制媒体、处理动态视频与倍速重置
  popup.*       中文设置弹窗
tests/          单元测试和真实扩展浏览器测试
tools/          无依赖打包脚本
docs/           来源与实现说明
dist/           生成的加载目录和 ZIP
```

## 权限与限制

仅请求 `storage` 和 HTTP/HTTPS 站点访问权限。站点访问用于自动控制网页媒体，并识别顶层站点。配置仅保存在 `chrome.storage.local`，不上传、不跨设备同步，关闭浏览器后仍保留，卸载扩展会清除。资源链接仅在用户点击时打开外部网站，外部网站的访问适用其自身隐私政策。完整说明见 [隐私政策](https://docs.sanrenjz.com/extensions/sanrenjz-video-speed/privacy.html)。

浏览器内部页面、扩展商店、未授权的页面和本地文件不注入。非标准自研解码器、浏览器或 DRM 管线限制的媒体不保证可调速。第三方播放器显示的倍速标签可能与原生媒体实际速度不同。Firefox、手机浏览器和 B 站/腾讯线上账号场景尚需单独验证；具体已执行检查见测试输出与交付说明。

参考与授权边界见 [docs/upstream.md](docs/upstream.md)。

本项目的源码采用 [MIT 许可证](LICENSE)。

<!-- sanrenjz-promotion:start -->

## 👨‍💻 作者信息

**余汉波** - 编程爱好者-量化交易和效率工具开发

- **GitHub**: [@yuhanbo758](https://github.com/yuhanbo758)

- **Email**: yuhanbo@sanrenjz.com

- **Website**: [三人聚智](https://www.sanrenjz.com)

## 🌐 相关链接

- 🏠 [项目主页](https://www.sanrenjz.com)

- 📚 [在线文档](https://docs.sanrenjz.com)（财经、代码和库文档等）

- 🛒 [插件商店](https://shop.sanrenjz.com)（所有程序，包括开源和不开源）


## 联系我们

[联系我们 - 三人聚智-余汉波](https://www.sanrenjz.com/contact_us/)

证券开户（+V：yuhanbo758）：[证券开户免5万0.854，无门槛开量化QMT，送框架策略，支持VIP快速通道，也可开Ptrade | 余汉波 文档](https://docs.sanrenjz.com/article/%E8%AF%81%E5%88%B8%E5%BC%80%E6%88%B7%E5%85%8D5%20%E4%B8%870.854%EF%BC%8C%E6%97%A0%E9%97%A8%E6%A7%9B%E5%BC%80%E9%87%8F%E5%8C%96QMT%EF%BC%8C%E9%80%81%E6%A1%86%E6%9E%B6%E7%AD%96%E7%95%A5%EF%BC%8C%E6%94%AF%E6%8C%81VIP%E5%BF%AB%E9%80%9F%E9%80%9A%E9%81%93%EF%BC%8C%E4%B9%9F%E5%8F%AF%E5%BC%80Ptrade)

三人聚智下载：[sanrenjz - 三人聚智](https://www.sanrenjz.com/sanrenjz/)

codebot 下载：[sanrenjz-codebot - 三人聚智-余汉波](https://www.sanrenjz.com/sanrenjz-codebot/)

![三码合一](https://gdsx.sanrenjz.com/image/sanrenjz_yuhanbolh_yuhanbo758.png?imageSlim&t=1ab9b82c-e220-8022-beff-e265a194292a)

![余汉波打赏码](https://gdsx.sanrenjz.com/image/%E6%89%93%E8%B5%8F%E7%A0%81%E5%90%88%E4%B8%80.png?imageSlim)
<!-- sanrenjz-promotion:end -->
