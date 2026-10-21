import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 号码通查 - GEO 优化静态站点
// 部署目标: Cloudflare Pages (Git 自动部署)
// 站点 URL 用于 sitemap / RSS 生成

// 薄标签页治理: 统计每个标签下的文章数, 文章数 < 3 的标签页
// 1) 在 [slug].astro 中输出 noindex,follow (退出索引竞争, 内链权重照常传递)
// 2) 从 sitemap 中排除 (不浪费抓取预算)
// 与 src/pages/tags/[slug].astro 的 isThinTag 阈值保持一致
const THIN_TAG_THRESHOLD = 3;
const blogDir = join(process.cwd(), 'src/content/blog');
const tagArticleCount = new Map();
// 博客文章 lastmod 自动派生表: slug -> frontmatter 的 updatedDate
// 目的: 根治"手写 pageLastmod 映射表漏配新文章"的长期缺陷 —— 新增文章无需再手动改此文件
const blogLastmod = new Map();
// 标签页 lastmod 自动派生: 标签名 -> 该标签下文章的最晚 updatedDate
const tagLastmod = new Map();
try {
  for (const file of readdirSync(blogDir)) {
    if (!file.endsWith('.md')) continue;
    const raw = readFileSync(join(blogDir, file), 'utf-8');
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const fm = fmMatch ? fmMatch[1] : '';
    const tags = [];
    // 兼容三种 YAML 写法:
    //   1) 行内数组带引号 tags: ["a", "b"]
    //   2) 行内数组无引号 tags: [a, b]   ← 2026-10-21 修复: 原正则只认带引号, 会漏掉无引号标签
    //   3) 分块列表 tags:\n  - a
    const inline = fm.match(/^tags:[ \t]*\[([^\]]*)\]/m);
    if (inline) {
      for (const raw of inline[1].split(',')) {
        const t = raw.trim().replace(/^["']|["']$/g, '').trim();
        if (t) tags.push(t);
      }
    } else {
      const block = fm.match(/^tags:[ \t]*\r?\n((?:[ \t]+-[ \t]*.+\r?\n?)+)/m);
      if (block) {
        for (const line of block[1].split('\n')) {
          const m = line.match(/^[ \t]*-[ \t]*(.+?)\s*$/);
          if (m) tags.push(m[1].replace(/^["']|["']$/g, '').trim());
        }
      }
    }
    for (const t of tags) tagArticleCount.set(t, (tagArticleCount.get(t) ?? 0) + 1);
    // 从 frontmatter 派生该文章的 lastmod(优先 updatedDate, 回退 pubDate)
    const slug = file.replace(/\.md$/, '');
    const updMatch = fm.match(/^updatedDate:[ \t]*(.+?)[ \t]*$/m);
    const pubMatch = fm.match(/^pubDate:[ \t]*(.+?)[ \t]*$/m);
    const rawDate = (updMatch?.[1] ?? pubMatch?.[1] ?? '').replace(/^["']|["']$/g, '').trim();
    if (rawDate) {
      const d = new Date(rawDate);
      if (!Number.isNaN(d.getTime())) {
        const iso = d.toISOString();
        blogLastmod.set(slug, iso);
        // 标签页 lastmod = 该标签下最晚的一篇文章
        for (const t of tags) {
          const cur = tagLastmod.get(t);
          if (!cur || iso > cur) tagLastmod.set(t, iso);
        }
      }
    }
  }
} catch {
  // 构建环境异常时退化为不过滤, 不阻塞构建
}
// 判断 URL 是否为薄标签页(<3篇文章的标签)
// sitemap URL 中的路径段是 tagToSlug(tag) 的编码形式, 需同样转换后比对
const isThinTagUrl = (url) => {
  const m = url.match(/\/tags\/([^/]+)\/?$/);
  if (!m) return false;
  let slug;
  try {
    slug = decodeURIComponent(m[1]);
  } catch {
    slug = m[1];
  }
  const tagToSlug = (t) => t.trim().replace(/[/\\?%#\s]+/g, '-');
  for (const [tag, count] of tagArticleCount) {
    if (tagToSlug(tag) === slug) return count < THIN_TAG_THRESHOLD;
  }
  return false;
};


// 站点内容最后修改日期映射(真实日期,非构建时间)
// Google 自 2023 起主动使用 lastmod 做抓取调度,但必须是真实内容修改日期
// 更新页面内容时同步修改此处日期
const pageLastmod = {
  '/': '2026-10-21',
  '/about/': '2026-10-19',
  '/contact/': '2026-10-05',
  '/faq/': '2026-08-24',
  '/tech-docs/': '2026-08-24',
  '/privacy/': '2026-07-06',
  '/terms/': '2026-10-05',
  '/disclaimer/': '2026-10-05',
  '/cookie-policy/': '2026-08-13',
  '/blog/2026-number-marking-clearance-guide/': '2026-10-21',
  '/blog/2026-enterprise-number-marking-solution/': '2026-07-13',
  '/blog/2026-number-marking-platform-comparison/': '2026-07-13',
  '/blog/2026-phone-marking-removal-complete-guide/': '2026-07-13',
  '/blog/2026-recycled-number-false-marking-guide/': '2026-07-07',
  '/blog/2026-enterprise-400-number-marking-clear-guide/': '2026-07-13',
  '/blog/2026-phone-attribution-accuracy-after-mnp/': '2026-07-13',
  '/blog/2026-enterprise-95-96-number-marking-clear-guide/': '2026-07-11',
  '/blog/2026-enterprise-number-marking-prevention-guide/': '2026-07-12',
  '/blog/2026-enterprise-number-auth-green-label-guide/': '2026-07-13',
  '/blog/2026-personal-number-marking-removal-guide/': '2026-07-14',
  '/blog/2026-number-marking-appeal-rejected-solutions/': '2026-07-21',
  '/blog/2026-high-frequency-outbound-number-marking-solution/': '2026-07-23',
  '/blog/2026-phone-marking-recurrence-after-clearance/': '2026-08-21',
  '/blog/2026-phone-manufacturer-local-marking-database-clear-guide/': '2026-08-12',
  '/blog/2026-scam-marking-removal-guide/': '2026-08-13',
  '/blog/2026-ai-marking-algorithm-rules-guide/': '2026-08-19',
  '/blog/2026-carrier-network-interception-guide/': '2026-08-25',
  '/blog/2026-number-false-marking-guide/': '2026-08-28',
  '/blog/2026-360-number-marking-appeal-guide/': '2026-08-31',
  '/blog/2026-number-marking-clear-price-guide/': '2026-08-31',
  '/blog/2026-mvno-170-171-marking-guide/': '2026-10-05',
  '/blog/2026-tencent-phone-manager-marking-appeal-guide/': '2026-09-03',
  '/blog/2026-teddy-bear-number-marking-appeal-guide/': '2026-09-07',
  '/blog/2026-baidu-number-marking-appeal-guide/': '2026-09-10',
  '/blog/2026-dianhua-number-marking-appeal-guide/': '2026-09-10',
  '/blog/2026-sogou-number-marking-appeal-guide/': '2026-09-10',
  '/blog/2026-carrier-anti-harassment-appeal-guide/': '2026-09-10',
  '/blog/2026-enterprise-landline-batch-marking-clear-guide/': '2026-09-10',
  '/blog/2026-400-800-number-auth-show-company-name/': '2026-10-21',
  '/blog/2026-number-marking-clear-observation-period-guide/': '2026-09-10',
  '/blog/2026-number-auth-vs-marking-clear-decision-guide/': '2026-09-10',
  '/blog/2026-self-service-vs-agency-appeal-decision/': '2026-09-10',
  '/blog/2026-number-marking-appeal-material-template/': '2026-09-10',
  '/blog/2026-iphone-caller-id-marking-clear-guide/': '2026-09-14',
  '/blog/2026-how-to-check-if-number-is-marked/': '2026-09-18',
  '/blog/2026-malicious-number-marking-guide/': '2026-09-20',
  '/blog/2026-international-call-marking-guide/': '2026-09-27',
  '/blog/2026-number-labeled-intermediary-realestate-loan-guide/': '2026-09-27',
  '/blog/2026-number-marking-affect-credit-guide/': '2026-09-27',
  '/blog/': '2026-09-20',
  '/en/faq/': '2026-08-24',
  '/en/guides/': '2026-09-20',
  '/tools/attribution/': '2026-09-10',
  '/tools/legal-number-verify/': '2026-09-10',
  '/tools/marking-check/': '2026-10-05',
  '/tools/marking-clear/': '2026-10-05',
  '/tools/registration-card/': '2026-08-20',
  '/tools/sim-cards/': '2026-09-10',
  '/tools/number-auth/': '2026-09-10',
  '/guide/what-is-number-marking/': '2026-09-21',
  '/guide/how-to-check-marking/': '2026-09-07',
  '/guide/how-to-clear-marking/': '2026-09-21',
  '/guide/landline-marking-clear/': '2026-09-07',
  '/guide/what-is-number-auth/': '2026-09-07',
  '/guide/sim-card-guide/': '2026-09-07',
  '/compare/marking-platforms/': '2026-09-10',
  '/compare/auth-providers/': '2026-09-10',
  '/compare/lookup-apis/': '2026-09-10',
  '/tags/': '2026-09-27',
  '/tags/号码标记/': '2026-09-27',
  '/tags/号码标记查询/': '2026-09-18',
  '/tags/号码标记清除/': '2026-09-27',
  '/tags/号码标记申诉/': '2026-09-14',
  '/tags/号码认证/': '2026-09-10',
  '/tags/号码误标/': '2026-09-20',
  '/tags/号码防复标/': '2026-09-10',
  '/tags/企业号码标记/': '2026-09-10',
  '/tags/标记平台/': '2026-09-07',
  '/tags/诈骗标记/': '2026-08-28',
  '/tags/骚扰电话/': '2026-09-20',
  '/tags/高频外呼/': '2026-09-10',
  '/authors/': '2026-08-24',
  '/authors/langood/': '2026-08-24',
  '/authors/haomachat/': '2026-08-24',
  '/en/': '2026-08-24',

  '/blog/2026-enterprise-number-marking-complete-guide/': '2026-10-19',
  '/authors/lvgong/': '2026-10-19',
  '/blog/2026-help-parents-clear-number-marking-remote-guide/': '2026-10-19',
  '/blog/2026-ios-android-marking-difference-guide/': '2026-10-19',
  '/blog/2026-number-marking-auto-disappear-guide/': '2026-10-19',
  '/blog/2026-number-marking-sue-platform-guide/': '2026-10-19',
  '/tags/名誉权/': '2026-10-19',
  '/tags/法律科普/': '2026-10-19',
  '/tags/维权/': '2026-10-19',};

// 内链尾斜杠归一化 (构建后处理)
// Cloudflare Pages 对目录页 /path 会 308 跳转到 /path/, 站内链接若不带尾斜杠
// 会白白损失一次重定向(浪费抓取预算、稀释链接权重、拖慢点击)。
// 源文件里的手写内链(尤其博客 Markdown)难以逐条保证, 故在构建完成后统一扫描
// dist 内的 <a href>, 凡指向真实目录页(/path/index.html 存在)且无扩展名的链接,
// 一律补上尾斜杠, 与 canonical / sitemap 保持一致。
const normalizeInternalLinks = () => ({
  name: 'normalize-internal-links',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const distDir = fileURLToPath(dir);
      // 1. 收集站内所有目录页路径(解码后, 以 / 结尾)
      const dirPages = new Set();
      const collect = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) collect(p);
          else if (e.name === 'index.html') {
            let rel = p.slice(distDir.length).replace(/\\/g, '/').replace(/index\.html$/, '');
            if (!rel.startsWith('/')) rel = '/' + rel;
            dirPages.add(rel.endsWith('/') ? rel : rel + '/');
          }
        }
      };
      collect(distDir);
      // 2. 扫描 HTML, 归一化指向目录页的内链
      let changed = 0;
      const walkHtml = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) walkHtml(p);
          else if (e.name.endsWith('.html')) {
            const raw = readFileSync(p, 'utf-8');
            const out = raw.replace(/(href=")(\/[^"?#]*)(?=["?#])/g, (m, pre, path) => {
              if (path.startsWith('//') || path.endsWith('/')) return m;
              if (/\.[a-z0-9]{2,5}$/i.test(path)) return m; // 静态资源不补斜杠
              let key = path;
              try {
                key = decodeURIComponent(path);
              } catch {
                /* 非法编码保留原值 */
              }
              const target = key.endsWith('/') ? key : key + '/';
              return dirPages.has(target) ? pre + path + '/' : m;
            });
            if (out !== raw) {
              writeFileSync(p, out);
              changed++;
            }
          }
        }
      };
      walkHtml(distDir);
      console.log(`[internal-links] 尾斜杠归一化完成: ${changed} 个页面已修正`);
    },
  },
});

export default defineConfig({
  site: 'https://zangxixitech.cn',
  output: 'static',
  trailingSlash: 'ignore',
  compressHTML: true,
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  integrations: [
    tailwind({ applyBaseStyles: true }),
    normalizeInternalLinks(),
    sitemap({
      i18n: {
        defaultLocale: 'zh',
        locales: { zh: 'zh-CN', en: 'en' },
      },
      // 薄标签页(文章数<3)不进 sitemap, 配合页面级 noindex,follow 治理索引膨胀
      filter: (page) => !isThinTagUrl(page),
      // 注入真实 lastmod(来自内容修改日期,非构建时间)
      // Google 会验证 lastmod 真实性,虚假日期会导致整站 lastmod 被忽略
      serialize(item) {
        // 中文标签页 URL 为百分号编码, pageLastmod 的键为解码后的中文, 需先解码再匹配
        let path = item.url.replace('https://zangxixitech.cn', '');
        try {
          path = decodeURIComponent(path);
        } catch {
          // 非法编码时保留原值
        }
        const normalizedPath = path === '' ? '/' : path;
        // 博客文章页: 优先用 frontmatter 自动派生的 lastmod(随内容走, 永不漏配);
        // 手写映射表仅作回退, 避免历史条目因缺少 frontmatter 而丢失日期
        const blogMatch = normalizedPath.match(/^\/blog\/([^/]+)\/?$/);
        if (blogMatch) {
          const derived = blogLastmod.get(blogMatch[1]);
          if (derived) {
            item.lastmod = derived;
            return item;
          }
        }
        // 标签页: lastmod 取该标签下最晚文章的日期(随内容自动更新)
        const tagMatch = normalizedPath.match(/^\/tags\/(.+?)\/?$/);
        if (tagMatch) {
          const tagSlug = tagMatch[1];
          const derivedTag = tagLastmod.get(tagSlug);
          if (derivedTag) {
            item.lastmod = derivedTag;
            return item;
          }
        }
        // 博客列表页: lastmod 取全站最晚文章日期
        if (normalizedPath === '/blog/' || normalizedPath === '/blog') {
          let latest = null;
          for (const iso of blogLastmod.values()) {
            if (!latest || iso > latest) latest = iso;
          }
          if (latest) {
            item.lastmod = latest;
            return item;
          }
        }
        // 尝试精确匹配,再尝试去掉末尾斜杠匹配
        const date = pageLastmod[normalizedPath] || pageLastmod[normalizedPath.replace(/\/$/, '') + '/'];
        if (date) {
          item.lastmod = new Date(date).toISOString();
        }
        return item;
      },
    }),
  ],
  build: {
    // 内联小样式表以减少请求数,提升 FCP(GEO 速度信号)
    inlineStylesheets: 'auto',
  },
});
