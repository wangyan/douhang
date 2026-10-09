interface BrandTitleProps {
  title: string;
  className?: string;
  accent?: boolean;
}

/** CJK 统一表意文字区间（含扩展 A 区） */
const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff]/;

/**
 * 找分词边界：第二个词的首字符
 *
 * 1. 空格分词：第一个空白之后的非空白字符（"MyNAS 导航" → 导）
 * 2. 驼峰分词：小写→大写边界（"DouHang" → N、"MyNAS" → N）
 * 3. CJK 分词：前两类均未命中且含 CJK 时取中点（"斗航" → 领）
 * 4. 均未命中（纯小写单词、单字符等）→ -1 不着色
 */
function findAccentIndex(chars: string[]): number {
  const spaceIndex = chars.findIndex((c) => /\s/.test(c));
  if (spaceIndex > 0) {
    const next = chars.findIndex((c, i) => i > spaceIndex && !/\s/.test(c));
    if (next > 0) return next;
  }
  for (let i = 1; i < chars.length; i++) {
    if (/[a-z]/.test(chars[i - 1]) && /[A-Z]/.test(chars[i])) return i;
  }
  // CJK 文本：无空格或大小写边界时，取居中位置作为强调字符
  if (chars.some((c) => CJK_PATTERN.test(c))) {
    const idx = Math.ceil(chars.length / 2);
    if (idx > 0 && idx < chars.length) return idx;
  }
  return -1;
}

/**
 * 品牌标题（适用中文与西文字标的 Logo 字体）
 *
 * 第二个词的首字符用强调色，呼应 Logo 终点像素；
 */
export function BrandTitle({
  title,
  className = '',
  accent = true,
}: BrandTitleProps) {
  const chars = [...title.trim()];
  const accentIndex = accent ? findAccentIndex(chars) : -1;

  if (accentIndex >= 0) {
    return (
      <span className={className}>
        {chars.slice(0, accentIndex).join('')}
        <span className="brand-pixel-accent">{chars[accentIndex]}</span>
        {chars.slice(accentIndex + 1).join('')}
      </span>
    );
  }

  return <span className={className}>{title}</span>;
}
