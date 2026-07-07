# 号码通查 (zangxixitech)

> GEO(生成式引擎优化)导向的电话号码服务工具站，部署于 Cloudflare Pages。

## 功能

- **号码归属地查询**：真实可用，接聚合数据 API（通过 Cloudflare Pages Function 代理隐藏密钥）
- **号码标记自查**：聚合中国信通院码号服务推进组及 360/腾讯/百度/华为等各平台官方查询入口
- **号码标记清除**：各平台官方申诉入口导航与分平台图文教程
- **手机卡选号比价**：移动/联通/电信套餐对比与选号指南
- **权威内容**：5 篇指南、3 篇对比表、17 条 FAQ、博客

## 技术栈

- **框架**：Astro 5（纯静态 SSG，默认零 JS，AI 爬虫无需执行 JS 即可读取全部内容）
- **样式**：Tailwind CSS
- **服务端**：Cloudflare Pages Functions（号码归属地查询 API 代理）
- **部署**：GitHub → Cloudflare Pages Git 自动部署

## 本地开发

```bash
npm install
npm run dev
```

### 归属地查询 API（可选）

归属地查询需要聚合数据 API Key。本地开发时创建 `.dev.vars` 文件：

```
LOOKUP_API_KEY=你的聚合数据API密钥
```

未配置时工具降级为本地格式校验。在 Cloudflare Pages Dashboard → Settings → Environment variables 中将 `LOOKUP_API_KEY` 设为加密 secret。

## 部署到 Cloudflare Pages

1. Fork 或推送本仓库到 GitHub
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
3. 选择本仓库，设置：
   - Framework preset: `Astro`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Production branch: `main`
4. 在 Environment variables 中设置 `NODE_VERSION=20` 和 `LOOKUP_API_KEY`（加密 secret）
5. **关键**：Security → Bots → 放行 AI 爬虫（GPTBot、OAI-SearchBot、ClaudeBot、PerplexityBot 等），Cloudflare 默认会拦截 AI 爬虫
6. 绑定自定义域名：在 Pages 项目 → Custom domains 中添加 `zangxixitech.cn`

## GEO 优化清单

- [x] 全站 SSG，关键内容在初始 HTML 中（AI 爬虫不执行 JS）
- [x] `/llms.txt` + `/llms-full.txt` + `/llms-en.txt`（中英双版本 + 完整内容版）
- [x] `/robots.txt` 放行 AI 检索爬虫（24 个爬虫白名单）
- [x] `/sitemap-index.xml` + `/rss.xml`（含真实 lastmod）
- [x] JSON-LD：Organization / WebApplication / FAQPage / HowTo / Article / BreadcrumbList
- [x] 每页前 150 字结论前置
- [x] 语义化 HTML（table / ul / h2 / h3）
- [x] `/_headers` 安全头（CSP + HSTS）+ 预览域名 noindex
- [x] 中文 AI 模型强化：sameAs 中文权威源 / FAQ microdata / datePublished+dateModified

## 项目结构

```
zangxixitech/
├── astro.config.mjs
├── public/              # llms.txt, robots.txt, _headers, _redirects
├── functions/api/       # Pages Functions (归属地查询代理)
├── src/
│   ├── pages/           # 页面路由
│   ├── content/blog/    # 博客 Markdown
│   ├── data/            # 平台/服务商/API 对比数据
│   ├── components/      # Header, Footer
│   ├── layouts/         # BaseLayout (JSON-LD 注入)
│   └── styles/          # 全局样式
└── docs/                # 设计文档
```

## License

MIT
