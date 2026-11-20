# 参考来源与实现边界

- 项目：Global Speed，作者 polywock。
- 地址：https://github.com/polywock/globalSpeed
- 本次查阅快照：`8e37a47597b702142cd4a5ff8e8c3f12511c8feb`，查阅日期 2026-11-04。
- 参考范围：全局默认倍速、URL 规则、主世界媒体属性兼容处理、动态媒体发现。

本插件为独立实现，没有复制上游源码、图片、图标、翻译或打包产物。查阅快照的仓库根目录未见 LICENSE 文件，package.json 也未声明 license，因此不把公开可访问等同于已获得源码再分发授权。

为满足精简目标，没有沿用 React、Tailwind、音效/滤镜、媒体列表、快捷键配置、复杂 URL 规则引擎和上游构建链。站点规则使用域名边界匹配，存储采用每个站点独立的键，避免多个设置窗口对整张规则表进行读改写而互相覆盖。

Chrome 官方接口依据：
- https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
- https://developer.chrome.com/docs/extensions/reference/api/storage
