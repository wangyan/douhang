import { getUserPreference, setUserPreference } from '@/lib/preferences';
import type { VersionCheckResult, VersionUpdateInfo } from '@/types';
import {
  APP_VERSION,
  getReleasesLatestUrl,
  isNewerVersion,
  parseLatestRelease,
} from './version';

/** 版本检测开关（UserPreference key） */
const VERSION_CHECK_ENABLED_KEY = 'versionCheckEnabled';
/** 版本检测自定义令牌（UserPreference key，私有仓库鉴权） */
const VERSION_CHECK_TOKEN_KEY = 'versionCheckToken';
/** 最近一次检查结果缓存（UserPreference key） */
const VERSION_CHECK_CACHE_KEY = 'versionCheckCache';
/** 无更新结果缓存 1h：新版本发布后最迟 1 小时内被检测到 */
const CHECK_INTERVAL_NO_UPDATE_MS = 60 * 60 * 1000;
/** 已发现更新的结果缓存 6h：期间有更新发布也能及时跟上 */
const CHECK_INTERVAL_UPDATE_FOUND_MS = 6 * 60 * 60 * 1000;

/** 获取用于版本检测的有效授权令牌（数据库设置优先，回落环境变量） */
async function getEffectiveToken(): Promise<string | undefined> {
  const customToken = await getUserPreference<string | null>(
    VERSION_CHECK_TOKEN_KEY,
    null,
  );
  if (customToken && customToken.trim().length > 0) {
    return customToken.trim();
  }
  return process.env.GITHUB_TOKEN;
}

/** 请求 Releases API（8s 超时，失败返回 null 不抛错） */
async function fetchLatestRelease(): Promise<Omit<
  VersionUpdateInfo,
  'checkedAt'
> | null> {
  try {
    const token = await getEffectiveToken();
    const res = await fetch(getReleasesLatestUrl(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DouHang-version-check',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return parseLatestRelease(await res.json());
  } catch {
    return null;
  }
}

/**
 * 检查远端是否有新版本
 *
 * - 开关关闭时不发起任何请求
 * - 距上次成功检查未过期直接返回缓存（无更新 1h / 有更新 6h，force = true 跳过节流）
 * - 请求失败时回落缓存并带 error 提示
 */
export async function checkForUpdate(
  force = false,
): Promise<VersionCheckResult> {
  const currentVersion = `v${APP_VERSION}`;
  const enabled = await getUserPreference<boolean>(
    VERSION_CHECK_ENABLED_KEY,
    true,
  );
  if (!enabled) {
    return { enabled: false, currentVersion, updateAvailable: false };
  }

  const cached = await getUserPreference<VersionUpdateInfo | null>(
    VERSION_CHECK_CACHE_KEY,
    null,
  );
  const cacheFresh =
    cached !== null &&
    Number.isFinite(Date.parse(cached.checkedAt)) &&
    Date.now() - Date.parse(cached.checkedAt) <
      (isNewerVersion(currentVersion, cached.tag)
        ? CHECK_INTERVAL_UPDATE_FOUND_MS
        : CHECK_INTERVAL_NO_UPDATE_MS);
  const resolve = (info: VersionUpdateInfo | null): VersionCheckResult => ({
    enabled: true,
    currentVersion,
    updateAvailable: info !== null && isNewerVersion(currentVersion, info.tag),
    ...(info ? { update: info } : {}),
  });

  if (!force && cached !== null && cacheFresh) {
    return resolve(cached);
  }

  const latest = await fetchLatestRelease();
  if (!latest) {
    return {
      ...resolve(cached),
      error: '连接发布服务失败，请检查网络或访问令牌配置',
    };
  }

  const info: VersionUpdateInfo = {
    ...latest,
    checkedAt: new Date().toISOString(),
  };
  await setUserPreference(VERSION_CHECK_CACHE_KEY, info);
  return resolve(info);
}
