/**
 * 标签 → URL 安全 slug
 *
 * 背景: 标签名可能包含中文、空格、斜杠等字符。
 * - 中文/字母/数字/连字符直接保留(磁盘目录名与 URL 解码后一致, Cloudflare Pages 可正确匹配)
 * - 斜杠必须替换(否则会被当作路径分隔符, 产生嵌套目录导致路由失败)
 * - 空格、%、#、? 等替换为连字符, 保证 URL 规范
 *
 * 例: "YD/T 4980-2024" → "YD-T-4980-2024"
 *     "号码标记清除"     → "号码标记清除" (原样保留)
 */
export function tagToSlug(tag: string): string {
  return tag
    .trim()
    .replace(/[/\\?%#\s]+/g, '-');
}

/**
 * 从 slug 反查原始标签名(用于 getStaticPaths 的 props 与页面渲染)
 */
export function buildTagSlugMap(tags: Iterable<string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of tags) {
    const slug = tagToSlug(tag);
    if (!map.has(slug)) map.set(slug, tag);
  }
  return map;
}
