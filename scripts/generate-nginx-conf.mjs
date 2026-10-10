#!/usr/bin/env node
/**
 * _redirects -> Nginx map 生成器 (迁移阿里云国内服务器用)
 *
 * 背景: 站点原托管 Cloudflare Pages, 重定向靠 public/_redirects (187 行)。
 * 迁移到阿里云 + Nginx 后, 需要把这批规则等价翻译成 Nginx 配置。
 * 手写 170 条极易出错(中文百分号编码 / 顺序敏感), 故用生成器保持单一数据源,
 * 以后只维护 _redirects, 重新执行本脚本即可。
 *
 * 用法: npm run nginx:gen            # 读取 public/_redirects, 输出 map 文件
 *       npm run nginx:gen -- --check # 只校验, 不写文件 (CI 用)
 *
 * 关键设计 (踩坑记录):
 * 1) 精确规则用 `map $uri` 而非 rewrite 正则 —— map 是字符串精确匹配, 无需转义,
 *    且 Nginx 的 $uri 已完成百分号解码, 所以 key 必须写"解码后的中文"。
 *    目标路径保持 _redirects 里的百分号编码形态, 这样 Location 响应头合法。
 * 2) 状态码 200 的规则 (站长验证文件) 在 Nginx 上无需翻译: Nginx 直接命中
 *    public/ 下的真实文件返回 200; 若照搬成 301 反而会破坏验证。
 * 3) 含 * 的通配规则 (动态区) 无法用 map 表达, 单独输出为 rewrite, 由静态
 *    server 配置 include。通配必须排在精确规则之后。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'public', '_redirects');
const OUT = join(ROOT, 'deploy', 'nginx', 'conf.d', 'zangxixitech-redirect-map.conf');
const CHECK_ONLY = process.argv.includes('--check');

if (!existsSync(SRC)) {
  console.error(`[nginx-gen] ✗ 未找到 ${SRC}`);
  process.exit(1);
}

const lines = readFileSync(SRC, 'utf-8').split('\n');
const isDynamic = (src) => /[*]|:[A-Za-z_]/.test(src);

/** 解码百分号编码的源路径 (Nginx $uri 已解码, 故 key 需解码) */
function decodeSource(src) {
  try {
    return decodeURIComponent(src);
  } catch {
    return src; // 非法编码保留原值
  }
}

const exactRules = []; // { from(decoded), to(encoded) }
const wildRules = []; // { from, to }  仅 * 通配
const skipped200 = []; // 200 代理规则 (Nginx 直接命中静态文件)

for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) continue;
  const [src, dst, code = '302'] = parts;

  if (code === '200') {
    // 站长验证文件的 clean-URL 绕过, Nginx 无需翻译
    skipped200.push({ line: i + 1, src, dst });
    continue;
  }
  if (isDynamic(src)) {
    wildRules.push({ from: src, to: dst });
  } else {
    exactRules.push({ from: decodeSource(src), to: dst });
  }
}

// 生成 Nginx map (http 上下文)
const mapLines = [];
mapLines.push('# =====================================================================');
mapLines.push('# 本文件由 scripts/generate-nginx-conf.mjs 自动生成, 请勿手改!');
mapLines.push('# 数据源: public/_redirects   重新生成: npm run nginx:gen');
mapLines.push(`# 精确 301 规则: ${exactRules.length} 条`);
mapLines.push('# 放置位置: /etc/nginx/conf.d/  (http 上下文, 需早于 sites-enabled 加载)');
mapLines.push('# =====================================================================');
mapLines.push('');
// 中文 key 为多字节 UTF-8, 单 key 可达 90+ 字节, 默认 bucket(32/64) 会触发
// "could not build map_hash, you should increase map_hash_bucket_size"。
// 该指令必须位于 http 上下文, 放在此处随本文件一并加载。
mapLines.push('map_hash_bucket_size 256;');
mapLines.push('');
mapLines.push('map $uri $redirect_to {');
mapLines.push('    default "";');
mapLines.push('');
for (const r of exactRules) {
  // key/target 均用双引号包裹, 防止特殊字符(空格/;/})被误解析
  mapLines.push(`    "${r.from}" "${r.to}";`);
}
mapLines.push('}');
mapLines.push('');

const content = mapLines.join('\n');

// 通配规则输出为片段, 供静态 server 配置 include (server 上下文)
const wildLines = [];
wildLines.push('# =====================================================================');
wildLines.push('# 通配 301 规则 (来自 _redirects 动态区), server 上下文 include');
wildLines.push('# 必须置于精确规则(map $redirect_to)判定之后');
wildLines.push('# =====================================================================');
for (const r of wildRules) {
  // /en/tools/* -> /tools/:splat
  const base = r.from.replace(/\*$/, '');
  const target = r.to.replace(':splat', '$1');
  wildLines.push(`rewrite ^${base}(.*)$ ${target} permanent;`);
}
const wildContent = wildLines.join('\n') + '\n';

if (CHECK_ONLY) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf-8') : '';
  if (current !== content) {
    console.error('[nginx-gen] ✗ 生成的 map 与磁盘文件不一致, 请运行 npm run nginx:gen');
    process.exit(1);
  }
  console.log('[nginx-gen] ✓ map 文件已同步');
  process.exit(0);
}

const WILD_OUT = join(ROOT, 'deploy', 'nginx', 'snippets', 'zangxixitech-wildcards.conf');
mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(WILD_OUT), { recursive: true });
writeFileSync(OUT, content);
writeFileSync(WILD_OUT, wildContent);

console.log(`[nginx-gen] ✓ 已生成 ${OUT.replace(ROOT + '/', '')}`);
console.log(`[nginx-gen] ✓ 已生成 ${WILD_OUT.replace(ROOT + '/', '')}`);
console.log(`[nginx-gen]   精确规则 ${exactRules.length} 条 / 通配规则 ${wildRules.length} 条 / 跳过 200 规则 ${skipped200.length} 条`);
if (skipped200.length) {
  console.log('[nginx-gen]   跳过(无需翻译, Nginx 直出静态文件):');
  for (const s of skipped200) console.log(`[nginx-gen]     ${s.src} -> ${s.dst} (${s.line} 行)`);
}
