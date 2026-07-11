# GOODMOOD / Visual Field

赵卢鑫（好心情）的个人视觉实验与 AI 创作流程网站。

[在线访问](https://youren248-rgb.github.io/)

生产版本是仓库根目录的原生 HTML、CSS 和 JavaScript 静态站点，由 `main` 分支通过 GitHub Pages 发布。

## 网站内容

- 以“赵卢鑫 × GOODMOOD”为主角的个人价值首屏与轨道印记
- WebGL2 实时宇宙、章节场景变化与 Canvas 2D 降级
- 三张代表作的自动 / 手动轮播与精简创作证据
- 个人宣言、合作价值、工作方法、介绍与联系方式
- 独立的 AI 创作教程页面与 Markdown 版本

## 本地预览

```powershell
python -m http.server 4173
```

然后打开 <http://127.0.0.1:4173/>。仓库中未跟踪的 Next / Vinext 脚手架不是生产站点，不要用它的脚本构建或发布本网站。

## 生产文件

- `index.html`：主页内容与语义结构
- `ai-tutorial.html` / `AI_TUTORIAL.md`：教程页面与源文档
- `style.css` / `tutorial.css`：基础布局与页面样式
- `effects.css`：入场、轨道印记、章节动效和减弱动态模式
- `cosmos.js`：WebGL2 宇宙引擎、动态质量控制和 Canvas 2D 降级
- `script.js`：场景编排、导航、方法标签和作品轮播
- `assets/`：首屏、作品视觉与联系二维码
- `.nojekyll`：GitHub Pages 静态发布配置

## 验证

```powershell
node --check script.js
node --check cosmos.js
git diff --check
rg -n -i "\x{59}\x{61}\x{6e}\x{63}\x{68}\x{65}\x{6e}\x{67}|\x{76d0}\x{57ce}" index.html ai-tutorial.html README.md AI_TUTORIAL.md
```

视觉改动还需要在桌面端和手机端检查：首次打开停在顶部、没有横向溢出、轮播可自动和手动切换，并且减弱动态模式可用。

## 发布

只显式暂存本次修改的生产文件并推送到 `main`，GitHub Pages 会自动发布。不要使用 `git add -A`，以免带入工作区内无关的未跟踪脚手架。
