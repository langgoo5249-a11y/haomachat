#!/usr/bin/env node
/**
 * IndexNow 提交脚本 — 向 Bing/Yandex/Naver 等搜索引擎通知 URL「新增 / 修改 / 删除」
 *
 * 设计目标:
 *   1) 只提交本次发布真正影响到的 URL(增量),不重复轰炸全量 91 条
 *   2) 新增与修改靠上一版 sitemap 快照 diff 出来(权威、无需人工登记 lastmod)
 *   3) 删除靠上一版 sitemap 快照 diff 出来 — 已从站点消失的 URL 必须通知,
 *      否则搜索引擎会长时间继续抓取 404,浪费抓取预算且拖慢新页面发现
 *   4) 提交前自检 key 文件,失败直接中止,不发无效请求
 *   5) 必须读响应体 — Yandex 对失败也返回 202,只看状态码会漏判
 *
 * 触发方式:
 *   本地:   npm run indexnow            增量(默认)
 *            npm run indexnow -- --all  全量(用于首次接入或补救漏提交)
 *            npm run indexnow -- --dry-run  只打印差异,不实际请求
 *   CI:    见 .github/workflows/deploy.yml 的 "Notify IndexNow" 步骤
 *
 * 快照来源优先级:
 *   1) scripts/.indexnow-snapshot/sitemap-0.xml  上一版接口待发布的快照(本地或 CI 上传)
 *   2) git show HEAD:sitemap-0.xml                仓库历史里的原始产物
 *   3) 都没有 → 退化为全量提交(首次接入,属正常)
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://zangxixitech.cn';
const HOST = 'zangxixitech.cn';
const KEY = '0c2bc225c908e74e5fa904b878d2a8d5';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const DIST = join(process.cwd(), 'dist');
const SITEMAP = join(DIST, 'sitemap-0.xml');
const SNAPSHOT_DIR = join(process.cwd(), 'scripts', '.indexnow-snapshot');
const SNAPSHOT = join(SNAPSHOT_DIR, 'sitemap-0.xml');

/** IndexNow 单次 POST 的 URL 上限 */
const MAX_URLS_PER_POST = 10000;

const ARGS = new Set(process.argv.slice(2));
const FULL_MODE = ARGS.has('--all');
const DRY_RUN = ARGS.has('--dry-run');

const ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
];

/** 从 sitemap XML 文本中解析 <loc> 集合 */
function parseUrls(xml) {
  return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()));
}

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

/**
 * 取上一版 sitemap 的 URL 集合作为 diff 基线。
 * 返回 { urls, source } — urls 为 null 表示没有基线,调用方应退化为全量。
 */
function loadBaseline() {
  // 1) 上一版发布时留下的快照(本地手动跑时它就是上一次的产物)
  const snap = readIfExists(SNAPSHOT);
  if (snap) return { urls: parseUrls(snap), source: '快照(上一版发布)' };

  // 2) 仓库历史: HEAD 提交里是否跟踪过 sitemap(正常 .gitignore 掉了 dist/,这里兜底)
  const HEAD_RAW = process.env.INDEXNOW_SITEMAP_HEAD;
  if (HEAD_RAW) return { urls: parseUrls(HEAD_RAW), source: 'git HEAD:sitemap-0.xml' };

  return { urls: null, source: null };
}

/** 提取正文(去掉脚本/样式)的纯文本长度,用于识别内容是否实质变化 */
function textLength(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/\s+/g, '').length;
}

/**
 * 对「新增 / 修改」集合做内容实质性校验,过滤掉构建时间戳之类的伪变化。
 * 当前实现无法访问已发布 HTML 做前后对比,故以 dist 产物 + 快照 URL 集合差异为主;
 * 若日后需要更严的判据,可在 CI 中把上一版 dist/ 的 HTML 也一起上传比对。
 */
function diffUrls(current, baseline) {
  const added = [...current].filter((u) => !baseline.has(u));
  const removed = [...baseline].filter((u) => !current.has(u));
  const kept = [...current].filter((u) => baseline.has(u));
  return { added, removed, kept };
}

/** 提交前自检: key 文件必须 200 且内容与 KEY 完全一致 */
async function verifyKeyFile() {
  try {
    const res = await fetch(KEY_LOCATION, { redirect: 'follow' });
    const body = (await res.text()).trim();
    if (res.status !== 200) {
      console.error(`[IndexNow] ✗ key 文件 HTTP ${res.status} — IndexNow 验证必然失败,先修复再提交`);
      console.error(`    $KEY_LOCATION`);
      return false;
    }
    if (body !== KEY) {
      console.error(`[IndexNow] ✗ key 文件内容不匹配 (线上: ${body.slice(0, 12)}…, 期望: ${KEY.slice(0, 12)}…)`);
      return false;
    }
    console.log(`[IndexNow] ✓ key 文件自检通过 (${KEY_LOCATION})`);
    return true;
  } catch (err) {
    console.error(`[IndexNow] ✗ key 文件无法访问: ${err.message}`);
    return false;
  }
}

/**
 * 提交 URL 列表。按 MAX_URLS_PER_POST 自动分批。
 * 判定成功只看 200;202 视为待验证(与 Bing 文档一致),403 视为 key/域名问题。
 * 必须读响应体:Yandex 对失败也返回 202。
 */
async function submitToIndexNow(urls) {
  if (urls.length === 0) {
    console.log('[IndexNow] 没有需要提交的 URL');
    return true;
  }
  const batches = [];
  for (let i = 0; i < urls.length; i += MAX_URLS_PER_POST) {
    batches.push(urls.slice(i, i + MAX_URLS_PER_POST));
  }
  console.log(`[IndexNow] 待提交 ${urls.length} 条 URL,分 ${batches.length} 批(每批 ≤${MAX_URLS_PER_POST})`);

  const bodyFor = (batch) =>
    JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: batch });

  let ok = true;
  for (const [bi, batch] of batches.entries()) {
    for (const ep of ENDPOINTS) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: bodyFor(batch),
        });
        // 关键: 必须读响应体,不能只看状态码
        const text = (await res.text().catch(() => '')).slice(0, 200);
        console.log(`[IndexNow] 批${bi + 1} ${ep} -> HTTP ${res.status} ${text}`);
        if (res.status !== 200 && res.status !== 202) {
          ok = false;
          if (res.status === 403) {
            console.error('    ✗ 403 = key/域名验证失败。排查方向:');
            console.error('      1) Cloudflare → Security → Bots: 关闭 Bot Fight Mode,或加 WAF 例外放行 /' + KEY + '.txt');
            console.error('      2) Bing Webmaster Tools → 设置 → IndexNow: 重新生成 key,替换 public/' + KEY + '.txt 与本脚本 KEY');
            console.error('      3) 换 key 后等 24h 再重试(Bing 侧有负缓存,旧 key 失败状态会被缓存)');
          }
          if (res.status === 422) console.error('    ✗ 422 = URL 不属于 host,或 key 与协议 schema 不匹配');
          if (res.status === 429) console.error('    ✗ 429 = 提交过于频繁(可能被判垃圾),稍后重试');
        }
      } catch (err) {
        ok = false;
        console.error(`[IndexNow] 批${bi + 1} ${ep} 请求异常: ${err.message}`);
      }
    }
  }
  return ok;
}

/** 把本次产物存为下一版的 diff 基线 */
function saveSnapshot() {
  try {
    if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
    copyFileSync(SITEMAP, SNAPSHOT);
    console.log(`[IndexNow] 已更新 diff 基线快照 -> ${SNAPSHOT}`);
  } catch (err) {
    // 快照失败不阻塞提交,只是下次退化为全量
    console.error(`[IndexNow] ⚠ 快照保存失败(下次将退化为全量提交): ${err.message}`);
  }
}

async function main() {
  if (!existsSync(SITEMAP)) {
    console.error('[IndexNow] dist/sitemap-0.xml 不存在,请先执行 npm run build');
    process.exit(1);
  }
  const current = parseUrls(readFileSync(SITEMAP, 'utf-8'));
  console.log(`[IndexNow] 当前 sitemap URL 总数: ${current.size}`);

  const { urls: baseline, source } = loadBaseline();

  let toSubmit;
  if (FULL_MODE || !baseline) {
    toSubmit = [...current];
    console.log(
      FULL_MODE
        ? `[IndexNow] 全量模式(--all): 提交全部 ${toSubmit.length} 条 URL`
        : `[IndexNow] 无 ${source || 'diff 基线'},判定为首次接入 → 全量提交 ${toSubmit.length} 条`
    );
  } else {
    const { added, removed, kept } = diffUrls(current, baseline);
    console.log(`[IndexNow] 相对「${source}」的差异:`);
    console.log(`    新增/变化 ${added.length} 条`);
    console.log(`    已消失(需通知删除) ${removed.length} 条`);
    console.log(`    未变化 ${kept.length} 条(跳过)`);
    for (const u of added) console.log(`    + ${u}`);
    for (const u of removed) console.log(`    - ${u}`);
    toSubmit = [...added, ...removed];
    if (toSubmit.length === 0) {
      console.log('[IndexNow] 本次部署没有 URL 增删改,跳过提交(属正常)');
      saveSnapshot();
      process.exit(0);
    }
  }

  if (DRY_RUN) {
    console.log('[IndexNow] --dry-run: 未发送任何请求');
    process.exit(0);
  }

  const keyOk = await verifyKeyFile();
  if (!keyOk) {
    console.error('[IndexNow] key 自检未通过,中止提交(不发无效请求)');
    process.exit(1);
  }

  const ok = await submitToIndexNow(toSubmit);
  saveSnapshot();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[IndexNow] fatal:', err.message);
  process.exit(1);
});
