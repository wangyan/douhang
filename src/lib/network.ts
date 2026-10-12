import type { Card, ResolvedUrl } from '@/types';

/**
 * 网络模式与 URL 选择工具
 *
 * - auto: 优先外网（外网不可达时回退内网，需要探测）
 * - internal: 强制内网 URL
 * - external: 强制外网 URL
 *
 * auto 模式依赖探测结果决定最终 URL；强制模式由前端直接取对应地址。
 */

function isReachable(status: number): boolean {
  return (
    (status >= 200 && status < 400) ||
    status === 401 ||
    status === 403 ||
    status === 405 ||
    status === 412 ||
    status === 449
  );
}

/** 探测请求通用请求头：携带真实浏览器 UA 避免被安全网关 / WAF 拦截或返回 412/449 */
const PROBE_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

/** 发起单次探测请求（独立 AbortController + 超时） */
async function probeFetch(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      headers: PROBE_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 探测单个 URL 是否可达（3 秒超时，优先 HEAD 方法，未响应或被 WAF 限制时回退 GET） */
export async function probeUrl(
  url: string,
  timeoutMs = 3000,
): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    let res = await probeFetch(url, 'HEAD', timeoutMs);
    if (
      !isReachable(res.status) ||
      res.status === 405 ||
      res.status === 404 ||
      res.status === 412 ||
      res.status === 449
    ) {
      res = await probeFetch(url, 'GET', timeoutMs);
      await res.body?.cancel();
    }
    return isReachable(res.status);
  } catch {
    // HEAD 请求抛错（网络错误/超时）时用独立 AbortController 回退一次 GET
    try {
      const res = await probeFetch(url, 'GET', timeoutMs);
      await res.body?.cancel();
      return isReachable(res.status);
    } catch {
      return false;
    }
  }
}

/** 并发探测多个 URL，限制并发数避免请求风暴 */
export async function probeUrls(
  urls: string[],
  options?: { timeoutMs?: number; concurrency?: number },
): Promise<boolean[]> {
  const timeoutMs = options?.timeoutMs ?? 3000;
  const concurrency = options?.concurrency ?? 6;
  const results: boolean[] = new Array(urls.length).fill(false);

  let index = 0;
  async function worker() {
    while (index < urls.length) {
      const i = index++;
      results[i] = await probeUrl(urls[i], timeoutMs);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, urls.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/** 根据 auto 模式探测结果决定最终 URL */
export function resolveAutoUrl(
  card: Pick<Card, 'internalUrl' | 'externalUrl'>,
  probeResults: { internal: boolean; external: boolean },
): ResolvedUrl {
  // 优先外网可达，其次内网，两者均不可达时回退外网
  if (probeResults.external) {
    return { url: card.externalUrl, source: 'external' };
  }
  if (probeResults.internal) {
    return { url: card.internalUrl, source: 'internal' };
  }
  return { url: card.externalUrl, source: 'external' };
}
