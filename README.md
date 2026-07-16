# HiTranslator Browser Extension

HiTranslator 的浏览器端网页翻译插件。插件负责读取网页、展示双语译文、处理动态内容与划词操作；模型调用由本机运行的 HiTranslator 桌面应用完成。

当前为早期版本，支持 Chromium Manifest V3，包括 Google Chrome、Microsoft Edge 和 Dia。

## 功能

- 网页双语对照与仅译文模式
- 动态网页和单页应用内容翻译
- 页面上下文、批量请求、失败重试与本地译文缓存
- 划词后打开 HiTranslator 浮窗
- 文本朗读
- YouTube 双语字幕基础能力
- 由桌面端统一管理目标语言、模型与网页翻译偏好

学习系统、Notebase、EPUB、账号体系和云同步不属于本项目范围。

## 使用

1. 安装并启动 HiTranslator 桌面应用。
2. 从 Releases 下载插件 ZIP 并解压。
3. 解压下载的插件 ZIP。
4. 打开 `chrome://extensions`，启用开发者模式并选择“加载已解压的扩展程序”。
5. 选择包含 `manifest.json` 的解压目录。
6. 在 HiTranslator 的“设置 → 网页翻译”中准备浏览器连接。

插件自身不保存模型密钥。未启动桌面应用时，模型翻译功能不可用。

## 本地开发

需要 Node.js 22.22 或更高版本，以及仓库声明的 pnpm 版本。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm type-check
pnpm build
pnpm zip
```

构建结果位于：

```text
dist/chrome-mv3
```

`pnpm zip` 同时生成可安装的 Chromium ZIP 和对应源码 ZIP。当前发布测试只覆盖实际注册的公开功能；保留的上游退役模块可用 `pnpm test:legacy` 单独审计，说明见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

完整的构建与审核步骤见 [SOURCE_CODE_REVIEW.md](./SOURCE_CODE_REVIEW.md)，发布流程见 [RELEASE.md](./RELEASE.md)。

## 隐私

网页中需要翻译的文本通过 Chromium Native Messaging 发送给本机 HiTranslator。插件公开构建不启用统计、账号、广告、Notebase 或上游云 API。具体说明见 [PRIVACY.md](./PRIVACY.md)。

## 上游与许可证

本项目基于 Read Frog `1.39.4` 修改，原始项目及版本信息记录在 [UPSTREAM.md](./UPSTREAM.md) 和 [NOTICE](./NOTICE) 中。

浏览器插件源码以 [GNU GPL version 3](./LICENSE) 发布。发布的每一个二进制版本都应对应一个公开源码标签。HiTranslator 桌面应用不包含在本仓库中，其许可证单独决定。

Read Frog 及其贡献者不为本修改版本背书。
