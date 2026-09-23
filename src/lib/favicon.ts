import { URL } from 'node:url';
import { parse } from 'parse5';
import { getRepoUrl } from '@/lib/version';

/**
 * favicon 抓取工具
 *
 * 抓取流程：
 * 1. fetch 目标 URL 的 HTML
 * 2. 用 parse5 解析 HTML，取 `<link rel="icon" / "shortcut icon" / "apple-touch-icon">`
 * 3. 取第一个匹配的 href，并基于最终响应 URL 解析为绝对 URL
 * 4. 页面返回 4xx/5xx 时 fallback：目标站点根路径 /favicon.ico
 *
 * 网络不可达 / 超时时返回 null，由调用方决定是否用备用地址重试。
 */

const FETCH_TIMEOUT_MS = 2500;
const USER_AGENT = `DouHang/1.0 (+${getRepoUrl()})`;

/** 云元数据端点等敏感地址（SSRF 防护：阻止探测云实例凭据） */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === '169.254.169.254' || // AWS / Azure 元数据
    h === 'metadata.google.internal' // GCP 元数据
  );
}

/** 识别历史上游生成的 Google S2 存量图标 */
export function isGoogleFaviconUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'www.google.com' && url.pathname === '/s2/favicons';
  } catch {
    return false;
  }
}

/** 生成对外保存的 favicon URL 前移除 userinfo，避免凭据泄露 */
function sanitizeFaviconUrl(url: string): string {
  const parsed = new URL(url);
  parsed.username = '';
  parsed.password = '';
  return parsed.toString();
}

/** favicon 抓取结果 */
export interface FaviconResult {
  /** favicon 绝对 URL（已解析） */
  url: string;
  /** 来源：html = 解析自 HTML；direct = 目标站点 /favicon.ico */
  source: 'html' | 'direct';
  /** 页面 <title>（仅 HTML 抓取成功时解析），用于快速添加预填名称 */
  title?: string;
}

/**
 * 从 URL 中提取 hostname
 */
function extractHostname(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return null;
  }
}

/**
 * 抓取指定 URL 的 favicon
 *
 * @param targetUrl 目标站点 URL（如 https://jellyfin.example.com）
 * @returns favicon URL，失败返回 null
 */
export async function fetchFavicon(
  targetUrl: string,
): Promise<FaviconResult | null> {
  const hostname = extractHostname(targetUrl);
  if (!hostname) return null;

  // SSRF 防护：阻止云元数据端点
  if (isBlockedHost(hostname)) return null;

  // 1. 尝试解析 HTML 中的 <link rel="icon">，顺带记录页面标题
  let pageTitle: string | undefined;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (res.ok) {
      const html = await res.text();
      pageTitle = parsePageTitle(html);
      // 根路径可能重定向到 /web/ 等子路径；相对 icon href 必须基于最终 URL 解析
      const faviconUrl = parseFaviconFromHtml(html, res.url || targetUrl);
      if (faviconUrl) {
        return { url: faviconUrl, source: 'html', title: pageTitle };
      }
    }
  } catch {
    // 网络不可达或超时时快速失败，调用方可尝试备用地址。
    return null;
  }

  return {
    url: sanitizeFaviconUrl(new URL('/favicon.ico', targetUrl).toString()),
    source: 'direct',
    ...(pageTitle ? { title: pageTitle } : {}),
  };
}

/** favicon 的 rel 取值与优先级 */
const FAVICON_REL_PRIORITY = [
  'apple-touch-icon',
  'icon',
  'shortcut icon',
  'mask-icon',
] as const;

/** parse5 节点中本项目用到的字段 */
interface HtmlNode {
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
}

/** 解析 HTML 为可遍历的节点树 */
function parseHtml(html: string): HtmlNode {
  return parse(html) as unknown as HtmlNode;
}

/** 文档顺序遍历所有元素节点（显式栈，避免深嵌套时的递归开销） */
function* elementNodes(root: HtmlNode): Generator<HtmlNode> {
  const stack: HtmlNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.tagName) yield node;

    const children = node.childNodes;
    if (children) {
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]);
      }
    }
  }
}

/** 读取属性值（parse5 已把属性名规范为小写） */
function readAttr(node: HtmlNode, name: string): string | undefined {
  return node.attrs?.find((attr) => attr.name === name)?.value;
}

/** 递归取节点的全部文本（parse5 解析时已解码 HTML 实体） */
function textContent(node: HtmlNode): string {
  let text = '';
  for (const child of node.childNodes ?? []) {
    text += child.value ?? textContent(child);
  }
  return text;
}

/**
 * 从 HTML 中解析 favicon URL
 *
 * 优先级：apple-touch-icon > icon > shortcut icon > mask-icon。
 * rel 按整串精确比较（对应 `<link rel="shortcut icon">` 这类写法），不做分词匹配。
 */
function parseFaviconFromHtml(html: string, baseUrl: string): string | null {
  const root = parseHtml(html);
  const hrefByRel = new Map<string, string>();

  for (const node of elementNodes(root)) {
    if (node.tagName !== 'link') continue;
    const rel = readAttr(node, 'rel');
    const href = readAttr(node, 'href');
    if (!rel || !href || hrefByRel.has(rel)) continue;
    hrefByRel.set(rel, href);
  }

  for (const rel of FAVICON_REL_PRIORITY) {
    const href = hrefByRel.get(rel);
    if (!href) continue;
    try {
      return sanitizeFaviconUrl(new URL(href, baseUrl).toString());
    } catch {
      // href 无法解析为 URL，继续尝试下一个优先级
    }
  }

  return null;
}

/**
 * 从 HTML 中解析页面标题
 *
 * @returns 归一化空白后的标题（最长 200 字符），无标题返回 undefined
 */
function parsePageTitle(html: string): string | undefined {
  const root = parseHtml(html);

  for (const node of elementNodes(root)) {
    if (node.tagName !== 'title') continue;
    const raw = textContent(node).replace(/\s+/g, ' ').trim();
    return raw ? raw.slice(0, 200) : undefined;
  }

  return undefined;
}
