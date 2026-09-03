#!/usr/bin/env node
/**
 * IndexNow 提交脚本 - 构建后手动调用
 * 向 Bing/Yandex/Naver 等搜索引擎通知 URL 变更,加速收录
 * 用法: npm run indexnow
 *
 * 排障记录 (2026-09-03): 曾持续收到 403 UserForbiddedToAccessSite,
 * 即便 key 文件线上 200/内容精确/任意UA可访问。结论: 客户端一切正常,
 * 问题在 Bing 侧验证爬虫被 Cloudflare 机器人防护拦截, 或 key 在 Bing
 * 系统内失效(需到 Bing Webmaster Tools 重新生成 key 并替换本文件)。
 * 教训来自 dev.to/samtj: 1) 提交前先自检 key 文件 2) 必须读响应体而非只看状态码
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SITE = 'https://zangxixitech.cn';
const KEY = '8413a9f41d034daa94eef1027c6ca5c2';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;

// 从 sitemap-0.xml 提取所有 URL
function extractUrlsFromSitemap() {
  const sitemapPath = join(process.cwd(), 'dist', 'sitemap-0.xml');
  if (!existsSync(sitemapPath)) {
    console.error('[IndexNow] sitemap-0.xml not found, skipping (先执行 npm run build)');
    return [];
  }
  const xml = readFileSync(sitemapPath, 'utf-8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return urls;
}

// 提交前自检 key 文件: 状态码 200 且内容与 KEY 完全一致(容忍首尾空白)
async function verifyKeyFile() {
  try {
    const res = await fetch(KEY_LOCATION, { redirect: 'follow' });
    const body = (await res.text()).trim();
    if (res.status !== 200) {
      console.error(`[IndexNow] ✗ key 文件 HTTP ${res.status} — IndexNow 验证必然失败, 先修复再提交`);
      return false;
    }
    if (body !== KEY) {
      console.error(`[IndexNow] ✗ key 文件内容不匹配 (线上: ${body.slice(0, 12)}..., 期望: ${KEY.slice(0, 12)}...)`);
      return false;
    }
    console.log(`[IndexNow] ✓ key 文件自检通过 (${KEY_LOCATION})`);
    return true;
  } catch (err) {
    console.error(`[IndexNow] ✗ key 文件无法访问: ${err.message}`);
    return false;
  }
}

async function submitToIndexNow(urls) {
  if (urls.length === 0) {
    console.log('[IndexNow] No URLs to submit');
    return;
  }
  const body = {
    host: 'zangxixitech.cn',
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };
  console.log(`[IndexNow] Submitting ${urls.length} URLs to IndexNow...`);

  const endpoints = [
    'https://api.indexnow.org/indexnow',
    'https://www.bing.com/indexnow',
  ];
  let allOk = true;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      });
      // 关键: 必须读响应体。Yandex 对失败也返回 202, 状态码不可信 (dev.to/samtj 教训)
      const text = (await res.text().catch(() => '')).slice(0, 200);
      console.log(`[IndexNow] ${ep} -> HTTP ${res.status} ${text}`);
      if (res.status === 403) {
        allOk = false;
        console.error('[IndexNow] ✗ 403 UserForbiddedToAccessSite = Bing侧验证失败。');
        console.error('    key文件客户端已自检通过, 排查方向:');
        console.error('    1) Cloudflare 控制台 → Security → Bots: 关闭 Bot Fight Mode, 或加 WAF 例外放行 /' + KEY + '.txt');
        console.error('    2) Bing Webmaster Tools → 设置 → IndexNow: 重新生成 key, 替换 public/' + KEY + '.txt 与本脚本 KEY 常量');
        console.error('    3) 换 key 后等待 24h 再重试 (Bing 有负缓存)');
      }
    } catch (err) {
      allOk = false;
      console.error(`[IndexNow] ${ep} error: ${err.message}`);
    }
  }
  return allOk;
}

(async () => {
  const urls = extractUrlsFromSitemap();
  if (!(await verifyKeyFile())) process.exit(1);
  await submitToIndexNow(urls);
})();
