#!/usr/bin/env node
/**
 * IndexNow 提交脚本 — 通用版, 5 个站点共用
 * 向 Bing/Yandex/Naver 等搜索引擎通知 URL「新增 / 修改 / 删除」
 *
 * ── 设计目标 ──
 *  1) 只提交本次发布真正影响到的 URL, 不重复轰炸全量 sitemap
 *  2) 覆盖三种变更: 新增 / 修改 / 删除(删页面也必须通知, 否则搜索引擎
 *     会长时间继续抓 404, 浪费抓取预算且拖慢新页面发现)
 *  3) 不依赖人工登记 lastmod — 各站 sitemap 的 lastmod 可靠性参差不齐
 *  4) 提交前自检 key 文件; 必须读响应体(Yandex 失败也返回 202)
 *
 * ── 数据来源(按优先级) ──
 *   A. git 变更文件集   — 最精确。本地 push 可跑 `git diff --name-only HEAD~1 HEAD`;
 *                         CI 里 actions/checkout 是浅克隆, 改用下述 B
 *   B. sitemap 快照 diff — 上一版 sitemap 与当前 sitemap 的 URL 集合差异,
 *                         由 CI artifact 在每次部署间传递
 *   C. 都没有           — 判定首次接入, 退化为全量提交
 *
 * ── 用法 ──
 *   node scripts/indexnow-submit.mjs [--config <file>] [--all] [--dry-run] [--changed-files f1 f2 ...]
 *
 * ── 各站接入 ──
 *   只需改 .indexnow.json 里的 host / key / sitemap 三处, 脚本本身零改动。
 *   站点域名不同 → key 必须不同(IndexNow 按 host 验证 key 归属);
 *   但同一 host 下的多个仓库(如 www.524900.xyz 的 free-api-hub 与 numbertool)
 *   必须共用同一个 key, 否则后部署的一方会把对方的 key 验证搞乱。
 */
import { readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_URLS_PER_POST = 10000;
const ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
];

/* ── 参数解析 ── */
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const optVal = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const FULL_MODE = flag('--all');
const DRY_RUN = flag('--dry-run');

const filesIdx = argv.indexOf('--changed-files');
const CHANGED_FILES = filesIdx >= 0 ? argv.slice(filesIdx + 1).filter((a) => !a.startsWith('--')) : null;

/* ── 站点配置 ── */
function loadConfig() {
  const cfgPath = optVal('--config') ? join(root, optVal('--config')) : join(root, '.indexnow.json');
  if (!existsSync(cfgPath)) {
    console.error(`[IndexNow] 缺少配置文件 ${cfgPath}`);
    console.error('  请创建 .indexnow.json, 参考:');
    console.error(JSON.stringify({
      host: 'www.example.com',
      key: 'your-32-char-hex-key',
      sitemap: 'sitemap.xml',
      snapshotDir: 'scripts/.indexnow-snapshot',
    }, null, 2));
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8').replace(/^\uFEFF/, ''));
  for (const f of ['host', 'key']) {
    if (!cfg[f]) {
      console.error(`[IndexNow] 配置缺少必填字段: ${f}`);
      process.exit(1);
    }
  }
  return cfg;
}

const cfg = loadConfig();
const SITE = `https://${cfg.host}`;
const KEY = cfg.key;
const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const SITEMAP_PATH = join(root, cfg.sitemap || 'sitemap.xml');
const SNAPSHOT_DIR = join(root, cfg.snapshotDir || 'scripts/.indexnow-snapshot');
const SNAPSHOT = join(SNAPSHOT_DIR, 'snapshot.xml');

/* ── URL / 文件 映射规则 ── */
/**
 * 把一个被改动的仓库内路径映射成线上 URL, 不是页面/站点配置文件则返回 null。
 * 各站页面形态不同, 故按站点类型分支:
 *   - 静态 HTML 站(tokennexus): index.html → 根, foo.html → /foo, blog/x.html → /blog/x
 *   - 目录型静态站(numbertool): public/tools/x.html → /tools/x.html
 *   - 构建型站(haomachat/math-worksheet/free-api-hub): 源码变更不直接映射为 URL,
 *     这类站改为依赖 sitemap 快照 diff, 本函数直接返回 null
 */
function mapPathToUrl(relPath) {
  if (!relPath) return null;
  const base = basename(relPath);

  // 1) 站点级配置文件: 变更时提交该文件本身(顺序必须在扩展名黑名单之前,
  //    否则 sitemap.xml / robots.txt 会被 .xml/.txt 黑名单吃掉)
  if (/^(robots\.txt|sitemap[^/]*\.xml|_headers|_redirects|ai\.xml|llms[^/]*\.txt|rss\.xml)$/i.test(base)) {
    return `${SITE}/${base}`;
  }

  // 2) 明确非页面文件
  if (/^(README|LICENSE|CLAUDE|CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY)/i.test(base)) return null;
  if (/\.(md|json|toml|ya?ml|lock|svg|png|jpe?g|webp|gif|ico|css|mjs|cjs|ts|tsx|jsx|py|sh|pyc)$/i.test(base)) return null;

  // 3) 页面: 静态 HTML 站把 <path>/x.html → /<path>/x.html
  //    tokennexus 的 index.html → 根; numbertool 的 public/tools/x.html → /tools/x.html
  if (!/\.html?$/i.test(base)) return null;
  const html = relPath.replace(/^public\//, '').replace(/\.html?$/i, '');
  if (html === 'index' || html === '') return `${SITE}/`;
  return `${SITE}/${html}`;
}

/* ── sitemap 提取 ── */
function parseSitemapUrls(path) {
  if (!existsSync(path)) return null;
  const xml = readFileSync(path, 'utf-8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  // 兼容 sitemap index(只含 <sitemap><loc>, 无 <url><loc>)
  if (urls.length === 0) {
    const subs = [...xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    return subs.length ? subs : null;
  }
  return urls;
}

/* ── 提交前自检 key 文件 ── */
async function verifyKeyFile() {
  try {
    const res = await fetch(KEY_LOCATION, { redirect: 'follow' });
    const body = (await res.text()).trim();
    if (res.status !== 200) {
      console.error(`[IndexNow] ✗ key 文件 HTTP ${res.status} — IndexNow 验证必然失败`);
      console.error(`    ${KEY_LOCATION}`);
      return false;
    }
    if (body !== KEY) {
      console.error(`[IndexNow] ✗ key 文件内容不匹配(线上 ${body.slice(0, 12)}… vs 期望 ${KEY.slice(0, 12)}…)`);
      return false;
    }
    console.log(`[IndexNow] ✓ key 文件自检通过`);
    return true;
  } catch (err) {
    console.error(`[IndexNow] ✗ key 文件无法访问: ${err.message}`);
    return false;
  }
}

/* ── 提交(分批 + 读响应体) ── */
async function submit(urls) {
  if (urls.length === 0) {
    console.log('[IndexNow] 无 URL 需要提交');
    return true;
  }
  const seen = new Set();
  const list = urls.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
  const batches = [];
  for (let i = 0; i < list.length; i += MAX_URLS_PER_POST) {
    batches.push(list.slice(i, i + MAX_URLS_PER_POST));
  }
  console.log(`[IndexNow] 提交 ${list.length} 个 URL(去重后) 分 ${batches.length} 批`);

  let ok = true;
  for (const [bi, batch] of batches.entries()) {
    const body = JSON.stringify({ host: cfg.host, key: KEY, keyLocation: KEY_LOCATION, urlList: batch });
    for (const ep of ENDPOINTS) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body,
        });
        const text = (await res.text().catch(() => '')).slice(0, 200);
        console.log(`[IndexNow] 批${bi + 1} ${ep} -> HTTP ${res.status} ${text}`);
        if (res.status === 403) {
          ok = false;
          console.error('    ✗ 403 key/域名验证失败。排查: 1) CDN(WAF/机器人防护)是否拦了 key 文件');
          console.error('       2) Bing Webmaster Tools 中该站 IndexNow key 是否失效(需重新生成)');
          console.error('       3) 换 key 后等 24h 再重试(Bing 侧有负缓存)');
        } else if (res.status !== 200 && res.status !== 202) {
          ok = false;
          if (res.status === 422) console.error('    ✗ 422 URL 不属于本 host 或格式不符');
          if (res.status === 429) console.error('    ✗ 429 提交过频, 稍后重试');
        }
      } catch (err) {
        ok = false;
        console.error(`[IndexNow] 批${bi + 1} ${ep} 请求异常: ${err.message}`);
      }
    }
  }
  return ok;
}

function saveSnapshot() {
  try {
    if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
    if (existsSync(SITEMAP_PATH)) {
      copyFileSync(SITEMAP_PATH, SNAPSHOT);
      console.log(`[IndexNow] 基线已更新: ${SNAPSHOT}`);
    }
  } catch (err) {
    console.error(`[IndexNow] ⚠ 基线保存失败(下次退化为全量): ${err.message}`);
  }
}

/* ── 计算待提交 URL ── */
/**
 * 取上一版 sitemap 作为 diff 基线, 依次尝试:
 *   1. 本地快照文件(CI artifact 传递, 或上一次本地构建留下)
 *   2. 线上 sitemap(cfg.remoteSitemap, 或回落到 cfg.sitemap 同路径)
 *      —— 适用于 Cloudflare Pages 原生集成部署: 构建环境无跨次持久化目录,
 *         但线上那份恰好就是「上一版已发布」的状态, 天然正确
 *   3. 都没有 → 全量
 */
async function fetchBaseline() {
  if (existsSync(SNAPSHOT)) {
    console.log(`[IndexNow] 基线来源: 本地快照`);
    return parseSitemapUrls(SNAPSHOT);
  }
  // 线上基线的 URL 必须显式配置。不能拿 cfg.sitemap 直接拼 —
  // 它是仓库内的相对路径(如 frontend/out/sitemap.xml), 拼出来是
  // https://host/frontend/out/sitemap.xml, 线上必然 404,
  // 结果每次都误判"无基线"而退化成全量提交。
  const remotePath = cfg.remoteSitemap || '/sitemap.xml';
  const remoteUrl = remotePath.startsWith('http') ? remotePath : `${SITE}/${remotePath.replace(/^\/+/, '')}`;
  try {
    const res = await fetch(remoteUrl, { redirect: 'follow' });
    if (res.status !== 200) {
      console.log(`[IndexNow] 线上基线拉取 HTTP ${res.status}(${remoteUrl})`);
      return null;
    }
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    console.log(`[IndexNow] 基线来源: 线上 sitemap(${urls.length} 个 URL)`);
    return urls.length ? urls : null;
  } catch (err) {
    console.log(`[IndexNow] 线上基线不可用: ${err.message}`);
    return null;
  }
}

async function computeTargets() {
  const current = parseSitemapUrls(SITEMAP_PATH);

  // 方式 A: 显式给定变更文件(本地或 CI 浅克隆时由 git 提供)
  if (CHANGED_FILES && CHANGED_FILES.length) {
    const mapped = CHANGED_FILES.map(mapPathToUrl).filter(Boolean);
    console.log(`[IndexNow] 方式A: ${CHANGED_FILES.length} 个变更文件 → ${mapped.length} 个 URL`);
    return mapped;
  }

  // 方式 B: sitemap 快照 / 线上 diff
  if (current && !FULL_MODE) {
    const base = await fetchBaseline();
    if (base) {
      const baseSet = new Set(base);
      const curSet = new Set(current);
      const added = current.filter((u) => !baseSet.has(u));
      const removed = base.filter((u) => !curSet.has(u));
      console.log(`[IndexNow] 方式B(增量diff): 新增/变化 ${added.length}, 已消失 ${removed.length}, 当前共 ${current.length}`);
      for (const u of added) console.log(`    + ${u}`);
      for (const u of removed) console.log(`    - ${u}`);
      return [...added, ...removed];
    }
  }

  // 方式 C: 无基线 → 全量
  if (current) {
    console.log(`[IndexNow] 方式C(首次/无基线): 全量提交 ${current.length} 个 URL`);
    return current;
  }

  console.error(`[IndexNow] 找不到 sitemap: ${SITEMAP_PATH}(且未提供 --changed-files)`);
  process.exit(1);
}

/**
 * 结束进程。
 * 注意: 不用 process.exit(0) — Node 24 在 Windows 上会在退出清理阶段触发
 * libuv 断言 "!(handle->flags & UV_HANDLE_CLOSING)" 并返回 -1073740791(0xC0000409),
 * 让 CI 误判为失败。失败路径仍用 process.exit(1) 明确返回非零。
 */
function finish(code) {
  if (code === 0) {
    // 让事件循环自然排空后退出
    process.exitCode = 0;
    if (typeof process.stdin.unref === 'function') process.stdin.unref();
    return;
  }
  process.exit(code);
}

async function main() {
  const urls = await computeTargets();
  if (urls.length === 0) {
    console.log('[IndexNow] 本次无 URL 增删改, 跳过提交(正常)');
    saveSnapshot();
    return finish(0);
  }
  if (DRY_RUN) {
    console.log('[IndexNow] --dry-run 未发送请求');
    return finish(0);
  }
  const ok = (await verifyKeyFile()) ? await submit(urls) : false;
  saveSnapshot();
  return finish(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error('[IndexNow] fatal:', e.message);
  finish(1);
});
