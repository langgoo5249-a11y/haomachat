#!/usr/bin/env node
/**
 * _redirects 构建期校验 — 防止 Cloudflare 解析器缺陷导致的静默规则丢弃
 *
 * 背景 (workers-sdk#14694): Cloudflare _redirects 解析器遇到第一条动态规则
 * (含 * 或 :placeholder) 后, 不再产生静态规则, 之后所有规则(含纯静态路径)
 * 全部占用 100 条动态预算; 预算超出后解析器直接 break, 静默丢弃文件剩余全部
 * 内容, 部署时无任何报错 — 2026-09-03 本站曾因此丢失 48 条规则造成线上 404。
 *
 * 本脚本 1:1 复刻该解析器行为做前置校验, 任何违规直接 fail 构建。
 * 用法: node scripts/validate-redirects.mjs [path]  (默认 public/_redirects)
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MAX_STATIC = 2000;
const MAX_DYNAMIC = 100;

const filePath = process.argv[2] || join(process.cwd(), 'public', '_redirects');

if (!existsSync(filePath)) {
  console.error('[redirects] ✗ 未找到 _redirects 文件:', filePath);
  process.exit(1);
}

const lines = readFileSync(filePath, 'utf-8').split('\n');

const errors = [];
const warnings = [];
let staticCount = 0;
let dynamicCount = 0;
let seenDynamic = false;
const dynamicRuleLines = [];
const dropped = [];

// 判断规则源路径是否为动态(含 splat * 或 :placeholder)
const isDynamic = (src) => /[*]|:[A-Za-z_]/.test(src);

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  const lineno = i + 1;
  const trimmed = raw.trim();

  // 跳过注释与空行
  if (!trimmed || trimmed.startsWith('#')) continue;

  // 单行长度限制 (Cloudflare 每条规则上限 1000 字符)
  if (trimmed.length > 1000) {
    errors.push(`第 ${lineno} 行: 规则超过 1000 字符上限 (${trimmed.length}), 将被忽略`);
    continue;
  }

  // 格式校验: [source] [destination] [code?]
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2 || parts.length > 3) {
    errors.push(`第 ${lineno} 行: 格式非法, 应为 "/source /destination [code]", 实际: "${trimmed.slice(0, 80)}"`);
    continue;
  }
  const [src, dst, code] = parts;
  if (!src.startsWith('/')) {
    errors.push(`第 ${lineno} 行: source 必须以 / 开头: "${src}"`);
    continue;
  }
  if (code !== undefined && !/^\d{3}$/.test(code)) {
    errors.push(`第 ${lineno} 行: 状态码非法 "${code}" (支持 200/301/302/303/307/308)`);
    continue;
  }
  if (code !== undefined && !['200', '301', '302', '303', '307', '308'].includes(code)) {
    errors.push(`第 ${lineno} 行: 状态码不受支持 "${code}" (Cloudflare 仅支持重定向码与 200 代理)`);
    continue;
  }
  // 目标为外部链接时忽略本地路径检查
  if (!/^https?:\/\//.test(dst) && !dst.startsWith('/')) {
    warnings.push(`第 ${lineno} 行: destination 非常规路径 "${dst}"`);
  }
  // 动态规则的目标引用了 :splat/:placeholder 但源里没有通配 → 运行期必然失效
  if (/:splat|:[A-Za-z_]/.test(dst) && !isDynamic(src)) {
    errors.push(`第 ${lineno} 行: destination 使用了 :placeholder 但 source 无通配符, 跳转将失效`);
  }

  // ===== 复刻 Cloudflare 解析器的顺序依赖分类 =====
  if (isDynamic(src)) {
    seenDynamic = true;
    dynamicRuleLines.push(lineno);
  }

  if (!seenDynamic) {
    // 动态规则出现之前: 静态规则计入静态预算
    staticCount++;
  } else {
    // 动态规则出现之后: 所有规则(含纯静态路径)都占用动态预算
    dynamicCount++;
    if (dynamicCount > MAX_DYNAMIC) {
      dropped.push(lineno);
    }
  }
}

// 静态预算检查 (动态规则出现前的规则数)
if (staticCount > MAX_STATIC) {
  errors.push(`静态规则 ${staticCount} 条, 超过 Cloudflare 上限 ${MAX_STATIC}`);
}

// 动态预算检查: 超出部分会被解析器静默丢弃
if (dynamicCount > MAX_DYNAMIC) {
  errors.push(
    `动态预算溢出: 第一条动态规则之后共有 ${dynamicCount} 条规则, ` +
      `超出 100 条上限, 第 ${dropped[0]}~${dropped[dropped.length - 1]} 行的 ` +
      `${dropped.length} 条规则将被 Cloudflare 静默丢弃(线上 404)`
  );
}

// 静态规则出现在动态规则之后 = 正在消耗动态预算, 即便尚未溢出也要警告
const staticAfterDynamic = lines.some((raw, i) => {
  const t = raw.trim();
  if (!t || t.startsWith('#')) return false;
  const src = t.split(/\s+/)[0];
  return !isDynamic(src) && dynamicRuleLines.length > 0 && i + 1 > dynamicRuleLines[0];
});
if (staticAfterDynamic && dynamicCount <= MAX_DYNAMIC) {
  warnings.push(
    `检测到静态规则位于动态规则(第 ${dynamicRuleLines[0]} 行)之后, ` +
      `这些规则正在消耗 100 条动态预算而非 2000 条静态预算, 建议重排为静态在前`
  );
}

console.log(`[redirects] 解析完成: 动态规则前静态 ${staticCount} 条 / 动态区 ${dynamicCount} 条 (静态上限 ${MAX_STATIC}, 动态上限 ${MAX_DYNAMIC})`);

if (warnings.length) {
  for (const w of warnings) console.warn(`[redirects] ⚠ ${w}`);
}

if (errors.length) {
  for (const e of errors) console.error(`[redirects] ✗ ${e}`);
  console.error(`\n[redirects] 校验失败, 共 ${errors.length} 个问题。修复后再构建!`);
  console.error('[redirects] 规则铁律: 静态规则全部在前, :splat/:placeholder 动态规则置底。');
  process.exit(1);
}

console.log('[redirects] ✓ 校验通过');
