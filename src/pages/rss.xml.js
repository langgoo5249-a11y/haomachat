import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

const SITE_URL = 'https://zangxixitech.cn';

export async function GET(context) {
  // 注意: 如果没有blog collection,返回空items的RSS
  let items = [];
  try {
    const posts = await getCollection('blog');
    // 仅输出最新 20 篇 + 摘要(description), 不输出全文:
    // 全文 feed 曾达 650KB+, 拖慢爬虫抓取、稀释新鲜度信号且浪费带宽
    items = posts
      .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime())
      .slice(0, 20)
      .map((post) => ({
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.pubDate,
        link: `/blog/${post.id}/`,
        categories: post.data.tags,
        author: post.data.author,
      }));
  } catch (e) {
    // blog collection 不存在时返回空
  }
  return rss({
    title: '号码通查号码百科',
    description: '电话号码服务深度文章 - 号码标记清除、号码认证、选号办卡、平台对比实测',
    site: context.site,
    items,
    customData: `<language>zh-CN</language><copyright>© 2026 号码通查 · 运营</copyright><generator>Astro</generator><ttl>60</ttl><atom:link href="https://zangxixitech.cn/rss.xml" rel="self" type="application/rss+xml" xmlns:atom="http://www.w3.org/2005/Atom" />`,
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
    },
  });
}
