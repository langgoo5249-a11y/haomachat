import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  // 注意: 如果没有blog collection,返回空items的RSS
  let items = [];
  try {
    const posts = await getCollection('blog');
    items = posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/blog/${post.slug}/`,
    }));
  } catch (e) {
    // blog collection 不存在时返回空
  }
  return rss({
    title: '号码通查博客',
    description: '电话号码服务深度文章 - 号码标记、号码认证、选号办卡',
    site: context.site,
    items,
  });
}
