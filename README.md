# BetterSearch

一个增强 Google、Bing、百度搜索结果页的油猴脚本：去广告、屏蔽站点、防范仿冒官网、拦截重定向、自动翻页，以及可自定义的双列布局。

> 开发中，尚未发布。设计见 [docs/DESIGN.md](docs/DESIGN.md)。

## 开发

需要 Node 22+ 和 pnpm。

```bash
pnpm install
pnpm test        # 运行单元测试（测试数据在 fixtures/）
pnpm dev         # 启动开发服务器，按提示在 Tampermonkey 中安装开发版脚本（支持热更新）
pnpm build       # 输出 apps/userscript/dist/bettersearch.user.js
pnpm typecheck
```

## 目录

```
packages/core     引擎适配器与功能逻辑
apps/userscript   油猴脚本入口
fixtures/         搜索结果页 HTML 快照（已去掉 script 和 style）
docs/             设计文档
```

## 许可证

GPL-3.0-or-later
