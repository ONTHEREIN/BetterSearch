# BetterSearch

一个增强 Google、Bing、百度搜索结果页的油猴脚本：去广告、屏蔽站点、防范仿冒官网、拦截重定向、自动翻页，以及可自定义的双列布局。

> 开发中，尚未发布到 Greasy Fork。设计见 [docs/DESIGN.md](docs/DESIGN.md)。

## 安装

1. 安装脚本管理器：[Tampermonkey](https://www.tampermonkey.net/)（Chrome、Edge、Firefox、Safari）或 [Violentmonkey](https://violentmonkey.github.io/)。Safari 也可以用 [Userscripts](https://github.com/quoid/userscripts)。
2. 发布前：从 [CI 的构建产物](https://github.com/ONTHEREIN/BetterSearch/actions/workflows/ci.yml) 下载 `bettersearch.user.js`，拖进脚本管理器安装；或者按下面的「开发」自己构建。

在搜索结果页点搜索框旁边的齿轮，或按 `Alt+,` 打开设置。

脚本在「全部 / 网页」和「新闻 / 资讯」两个 tab 上生效。Bing 的资讯 tab 只有国际版（www.bing.com）有。新闻报道不是网站自己的页面，所以资讯 tab 上不做官网核对和仿冒提示；Google 新闻不显示网址，也就不能按域名屏蔽。

## 官网核对

标题自称官网或官方、网站却既不是 [Wikidata](https://www.wikidata.org/) 登记过的官网、也不是常见网站的结果，会显示 ⚠️ 提示；搜索词提到的品牌的官网标上「✓ 官方网站」。名单由 [bettersearch-rules](https://github.com/ONTHEREIN/bettersearch-rules) 每周生成，分成 4096 片，只下载所查域名所在的那一片，国内走 Gitee 镜像。第一次下载时脚本管理器会请你允许访问 `gitee.com` 和 `raw.giteeusercontent.com`。官网写错了，请到 Wikidata 上修改对应条目。

## 主题和自定义 CSS

设置的「外观」里可以写自己的 CSS，在所有引擎上生效。结果卡片的间距、颜色等用 CSS 变量控制，例如 `html { --bs-gap: 20px; --bs-card: #fffdf5; }`。只改一个引擎时，选择器前加 `html[data-bs-engine='bing']`（`google`、`bing`、`baidu`）。

「复制主题」把卡片样式、密度和自定义 CSS 复制成一段 JSON，发给别人后对方用「导入主题」粘贴即可。为了不让主题把搜索词发出去，导入时会拒绝从别的网站加载内容的 CSS（`@import`、外部 `url()` 等），图片请用 `data:` 地址内嵌。

## 仿冒站名单

社区维护的仿冒站名单在 [bettersearch-rules](https://github.com/ONTHEREIN/bettersearch-rules)，默认不开启。想用的话，在设置的「屏蔽 → 订阅列表」里添加：

```
https://raw.githubusercontent.com/ONTHEREIN/bettersearch-rules/main/lookalike.txt
```

结果卡片右上角的旗子按钮可以举报仿冒网站，会打开名单仓库的举报表单，域名和搜索词已经填好。

## 开发

需要 Node 22+ 和 pnpm。

```bash
pnpm install
pnpm test        # 运行单元测试（测试数据在 fixtures/）
pnpm dev         # 启动开发服务器，按提示在 Tampermonkey 中安装开发版脚本（支持热更新）
                 # Edge/Chrome 需要给每个搜索网站开「本机回环地址」权限，见 DESIGN.md 第 3 节
pnpm build       # 输出 apps/userscript/dist/bettersearch.user.js
pnpm typecheck
```

## 目录

```
packages/core     引擎适配器、规则引擎与设置
apps/userscript   油猴脚本入口、页面处理与设置面板（Svelte 5）
fixtures/         搜索结果页 HTML 快照（已去掉 script 和 style）
docs/             设计文档
```

## 许可证

GPL-3.0-or-later
