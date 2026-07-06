import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';

// 号码通查 - GEO 优化静态站点
// 部署目标: Cloudflare Pages (Git 自动部署)
// 站点 URL 用于 sitemap / RSS 生成
export default defineConfig({
  site: 'https://haomachat.com',
  output: 'static',
  integrations: [
    tailwind({ applyBaseStyles: true }),
    sitemap({
      i18n: {
        defaultLocale: 'zh',
        locales: { zh: 'zh-CN', en: 'en' },
      },
    }),
  ],
  build: {
    // 内联小样式表以减少请求数,提升 FCP(GEO 速度信号)
    inlineStylesheets: 'auto',
  },
});
