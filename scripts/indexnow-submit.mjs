#!/usr/bin/env node
/**
 * IndexNow 提交脚本 - 构建后在 package.json scripts 中调用
 * 向 Bing/Yandex/Naver 等搜索引擎通知 URL 变更,加速收录
 * 用法: node scripts/indexnow-submit.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SITE = 'https://zangxixitech.cn';
const KEY = 'ccedc595064b44739a755c334e11f295';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;

// 从 sitemap-0.xml 提取所有 URL
function extractUrlsFromSitemap() {
  const sitemapPath = join(process.cwd(), 'dist', 'sitemap-0.xml');
  if (!existsSync(sitemapPath)) {
    console.error('[IndexNow] sitemap-0.xml not found, skipping');
    return [];
  }
  const xml = readFileSync(sitemapPath, 'utf-8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  return urls;
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

  // Bing IndexNow endpoint
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    console.log(`[IndexNow] api.indexnow.org -> HTTP ${res.status}`);
    if (res.status === 200) {
      console.log('[IndexNow] URLs submitted successfully');
    } else if (res.status === 202) {
      console.log('[IndexNow] Accepted - URLs will be processed shortly');
    } else if (res.status === 422) {
      console.log('[IndexNow] Key validation pending - ensure key file is accessible');
    }
  } catch (err) {
    console.error(`[IndexNow] api.indexnow.org error: ${err.message}`);
  }

  // Also ping Bing's direct endpoint
  try {
    const res = await fetch('https://www.bing.com/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    console.log(`[IndexNow] bing.com/indexnow -> HTTP ${res.status}`);
  } catch (err) {
    console.error(`[IndexNow] bing.com error: ${err.message}`);
  }
}

const urls = extractUrlsFromSitemap();
submitToIndexNow(urls);
