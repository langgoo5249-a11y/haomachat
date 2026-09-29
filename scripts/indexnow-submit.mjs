#!/usr/bin/env node
/**
 * IndexNow 提交脚本 - 构建后自动调用 / 每日定时调用
 * 向 Bing/Yandex/Naver 等搜索引擎通知 URL 变更, 告知"内容有更新", 提升抓取与推荐意愿
 * 用法:
 *   npm run indexnow          增量模式: 只提交 lastmod >= 昨日的 URL (无变化则跳过)
 *   npm run indexnow -- --all 全量模式: 提交 sitemap 中所有 URL
 *
 * 排障记录 (2026-09-03): 曾持续收到 403 UserForbiddedToAccessSite,
 * 即便 key 文件线上 200/内容精确/任意UA可访问。结论: 客户端一切正常,
 * 问题在 Bing 侧验证爬虫被 Cloudflare 机器人防护拦截, 或 key 在 Bing
 * 系统内失效(需到 Bing Webmaster Tools 重新生成 key 并替换本文件)。
 * 教训来自 dev.to/samtj: 1) 提交前先自检 key 文件 2) 必须读响应体而非只看状态码
 *
 * 排障记录 (2026-09-16): 经 Cloudflare GraphQL 防火墙日志确认 bingbot 抓取
 * key 文件已被 skip 放行(非拦截), 旧 key 8413a9f4... 仍 403 → 判定为 Bing 侧
 * 负缓存(旧 key 验证失败状态被长期缓存)。处置: 轮换新 key 505d00e4..., 并在
 * Cloudflare 新增 "Allow IndexNow key files" 规则(精确匹配两个 key 文件路径,
 * skip 托管规则+SBFM+浏览器完整性检查+安全级别)。旧 key 文件保留观察。
 *
 * 2026-09-29: 默认改为增量模式。全量重复提交 86 条 URL 无新鲜度价值, 搜索引擎
 * 只关注"近期更新过的"。增量以 sitemap lastmod 为判据: 有 URL 的 lastmod >= 北京时间
 * 今日 00:00 就提交这批; 否则打印提示并跳过, 避免无意义请求。
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SITE = 'https://zangxixitech.cn';
const KEY = '505d00e42f759e5c536b2ecd36c03d63';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;

const FULL_MODE = process.argv.includes('--all');
// 增量阈值: 北京时间今日 00:00 (UTC+8)。
// 推导: now(+8h)=北京时间今日时刻 → now(-8h)=今日 00:00 的 UTC 表达
const THRESHOLD = new Date(Date.now() - 8 * 3600000);
THRESHOLD.setUTCHours(0, 0, 0, 0);

// 从 sitemap-0.xml 提取 { url, lastmod } (lastmod 可能缺失, 缺失视为未更新)
function extractUrlsFromSitemap() {
  const sitemapPath = join(process.cwd(), 'dist', 'sitemap-0.xml');
  if (!existsSync(sitemapPath)) {
    console.error('[IndexNow] sitemap-0.xml not found, skipping (先执行 npm run build)');
    return [];
  }
  const xml = readFileSync(sitemapPath, 'utf-8');
  const urls = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g)].map((m) => {
    const loc = m[1];
    const lm = m[0].match(/<lastmod>([^<]+)<\/lastmod>/);
    return { url: loc, lastmod: lm ? lm[1] : null };
  });
  return urls;
}

function filterRecent(entries) {
  return entries.filter((e) => e.lastmod && new Date(e.lastmod) >= THRESHOLD);
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

async function main() {
  const all = extractUrlsFromSitemap();
  if (all.length === 0) process.exit(1);

  let urls;
  if (FULL_MODE) {
    urls = all.map((e) => e.url);
    console.log(`[IndexNow] 全量模式: 提交全部 ${urls.length} 条 URL`);
  } else {
    const recent = filterRecent(all);
    if (recent.length === 0) {
      console.log('[IndexNow] 增量模式: 无 lastmod >= 北京今日 00:00 的 URL, 跳过提交 (无内容变化, 属正常)');
      process.exit(0);
    }
    urls = recent.map((e) => e.url);
    console.log(`[IndexNow] 增量模式: 提交 ${urls.length}/${all.length} 条 (lastmod >= ${THRESHOLD.toISOString()})`);
  }

  if (!(await verifyKeyFile())) process.exit(1);
  const ok = await submitToIndexNow(urls);
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error('[IndexNow] fatal:', err.message);
  process.exit(1);
});

