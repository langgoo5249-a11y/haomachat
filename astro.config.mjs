import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';

// 号码通查 - GEO 优化静态站点
// 部署目标: Cloudflare Pages (Git 自动部署)
// 站点 URL 用于 sitemap / RSS 生成

// 站点内容最后修改日期映射(真实日期,非构建时间)
// Google 自 2023 起主动使用 lastmod 做抓取调度,但必须是真实内容修改日期
// 更新页面内容时同步修改此处日期
const pageLastmod = {
  '/': '2026-08-19',
  '/about/': '2026-08-19',
  '/contact/': '2026-08-19',
  '/faq/': '2026-07-08',
  '/tech-docs/': '2026-07-06',
  '/privacy/': '2026-07-06',
  '/terms/': '2026-08-19',
  '/disclaimer/': '2026-08-19',
  '/cookie-policy/': '2026-07-06',
  '/blog/2026-number-marking-clearance-guide/': '2026-07-13',
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
  '/blog/': '2026-08-21',
  '/tools/attribution/': '2026-07-08',
  '/tools/legal-number-verify/': '2026-07-06',
  '/tools/marking-check/': '2026-07-06',
  '/tools/marking-clear/': '2026-07-06',
  '/tools/registration-card/': '2026-08-20',
  '/tools/sim-cards/': '2026-07-06',
  '/tools/number-auth/': '2026-07-13',
  '/guide/what-is-number-marking/': '2026-07-09',
  '/guide/how-to-check-marking/': '2026-07-06',
  '/guide/how-to-clear-marking/': '2026-07-06',
  '/guide/landline-marking-clear/': '2026-07-08',
  '/guide/what-is-number-auth/': '2026-07-09',
  '/guide/sim-card-guide/': '2026-07-06',
  '/compare/marking-platforms/': '2026-07-06',
  '/compare/auth-providers/': '2026-07-06',
  '/compare/lookup-apis/': '2026-07-06',
  '/tags/': '2026-08-24',
  '/tags/号码标记/': '2026-08-24',
  '/authors/': '2026-08-24',
  '/authors/langood/': '2026-08-24',
  '/authors/haomachat/': '2026-08-24',
  '/en/': '2026-07-14',
};

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
    sitemap({
      i18n: {
        defaultLocale: 'zh',
        locales: { zh: 'zh-CN', en: 'en' },
      },
      // 注入真实 lastmod(来自内容修改日期,非构建时间)
      // Google 会验证 lastmod 真实性,虚假日期会导致整站 lastmod 被忽略
      serialize(item) {
        const path = item.url.replace('https://zangxixitech.cn', '');
        const normalizedPath = path === '' ? '/' : path;
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
