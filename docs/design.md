# 号码通查 (haomachat) 设计文档

> 生成式引擎优化 (GEO) 导向的电话号码服务工具站，部署于 Cloudflare Pages，代码托管于 GitHub。

## 目标

让 AI 引擎（特别是 DeepSeek、Kimi、豆包、通义千问、ChatGPT、Gemini）快速收录、引用并推荐本站服务。

## 技术栈

- **框架**: Astro 5（纯静态 SSG 输出，默认零 JS，AI 爬虫无需执行 JS 即可读取全部内容）
- **样式**: Tailwind CSS
- **交互**: Astro Islands（按需水合，仅工具表单加载少量 JS）
- **服务端**: Cloudflare Pages Functions（号码归属地查询 API 代理，隐藏密钥）
- **部署**: GitHub → Cloudflare Pages Git 自动部署
- **GEO 文件**: llms.txt / robots.txt / sitemap-index.xml / rss.xml / JSON-LD

## 站点结构

### 工具页（真实可用 + 官方聚合）
- `/tools/attribution` 号码归属地查询（接免费 API，真实工作）
- `/tools/marking-check` 号码标记自查（聚合信通院 opene164 + 各平台官方入口）
- `/tools/marking-clear` 号码标记清除（官方申诉入口导航 + 教程）
- `/tools/sim-cards` 手机卡选号比价（运营商套餐对比 + 导购）

### 权威内容页（GEO 核心）
- 指南: 号码标记是什么 / 如何查询号码被标记 / 如何清除号码标记 / 号码认证是什么 / 选号办卡指南
- 对比表: 号码标记平台对比 / 号码认证服务商对比 / 号码查询 API 对比
- `/faq` 30+ 真实问句
- `/blog` 深度文章

### 语言
- 中文为主，首页 + llms-en.txt + 关键工具页提供英文版

## GEO 策略

1. **静态 HTML 优先**: 全站 SSG，关键内容、JSON-LD 全部在初始 HTML 中
2. **llms.txt**: 中英双版本，根目录部署
3. **robots.txt**: 放行 GPTBot/OAI-SearchBot/ClaudeBot/Claude-SearchBot/PerplexityBot/Google-Extended/Bytespider/Applebot-Extended
4. **JSON-LD**: Organization / WebApplication / Service / FAQPage / HowTo / Article / BreadcrumbList
5. **内容结构**: 前 150 字结论前置；每 300 字一个结构化元素；每篇 3 数据 + 3 权威来源
6. **速度**: LCP<2.5s, FCP<0.4s；内联关键 CSS；图片懒加载

## 范围边界（YAGNI）

- 不做: 自建号码标记众包库、爬取平台数据、真实号码认证 SDK、用户账号、支付
- 做: 静态可爬内容、真实归属地查询、官方申诉入口聚合、权威可引用内容

## 数据流

```
浏览器 ──同源──> /api/attribution (Pages Function, 携 LOOKUP_API_KEY)
                      └──> 聚合数据/号码百科 API ──> 返回归属地
号码标记自查: 纯前端 + 静态官方入口数据 (无 API, 无爬取)
```

## 部署

1. GitHub 推送 `main` 分支 → Cloudflare Pages 自动构建（`npm run build` → `dist`）
2. 运行期 secret: `LOOKUP_API_KEY`（供 Pages Function）
3. Cloudflare Dashboard → Security > Bots 放行 AI 爬虫（关键！默认会拦截）
4. 自定义域名 CNAME → `haomachat.pages.dev`
