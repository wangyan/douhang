import { getUserPreference, setUserPreference } from '@/lib/preferences';
import type { VersionCheckResult, VersionUpdateInfo } from '@/types';
import {
  APP_VERSION,
  ATOMGIT_URL,
  getReleasesLatestUrl,
  isNewerVersion,
  parseLatestRelease,
} from './version';

/** 版本检测开关（UserPreference key） */
const VERSION_CHECK_ENABLED_KEY = 'versionCheckEnabled';
/** 国内镜像加速开关（UserPreference key，开启后优先走 AtomGit） */
const CN_MIRROR_ENABLED_KEY = 'cnMirrorEnabled';
/** 最近一次检查结果缓存（UserPreference key） */
const VERSION_CHECK_CACHE_KEY = 'versionCheckCache';
/** 无更新结果缓存 1h：新版本发布后最迟 1 小时内被检测到 */
const CHECK_INTERVAL_NO_UPDATE_MS = 60 * 60 * 1000;
/** 已发现更新的结果缓存 6h：期间有更新发布也能及时跟上 */
const CHECK_INTERVAL_UPDATE_FOUND_MS = 6 * 60 * 60 * 1000;

/** 获取用于版本检测的可选授权令牌（环境变量） */
function getEffectiveToken(cnMirror: boolean): string | undefined {
  return cnMirror ? process.env.ATOMGIT_TOKEN : process.env.GITHUB_TOKEN;
}

/** 请求 Releases API（8s 超时，失败返回 null 不抛错） */
async function fetchLatestRelease(
  cnMirror = false,
): Promise<Omit<VersionUpdateInfo, 'checkedAt'> | null> {
  try {
    const token = getEffectiveToken(cnMirror);
    const res = await fetch(getReleasesLatestUrl(cnMirror), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DouHang-version-check',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const fallbackUrl = cnMirror ? `${ATOMGIT_URL}/releases` : undefined;
    return parseLatestRelease(await res.json(), fallbackUrl);
  } catch {
    return null;
  }
}

/**
 * 检查远端是否有新版本
 *
 * - 开关关闭时不发起自动检查，仅响应手动检查（force = true）
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
  if (!enabled && !force) {
    return { enabled: false, currentVersion, updateAvailable: false };
  }

  const [cnMirror, cached] = await Promise.all([
    getUserPreference<boolean>(CN_MIRROR_ENABLED_KEY, false),
    getUserPreference<VersionUpdateInfo | null>(VERSION_CHECK_CACHE_KEY, null),
  ]);
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

  const latest = await fetchLatestRelease(cnMirror);
  if (!latest) {
    return {
      ...resolve(cached),
      error: cnMirror
        ? '连接国内镜像源 (AtomGit) 失败，请检查网络'
        : '连接发布服务失败，国内网络环境建议开启「国内镜像加速」',
    };
  }

  const info: VersionUpdateInfo = {
    ...latest,
    checkedAt: new Date().toISOString(),
  };
  await setUserPreference(VERSION_CHECK_CACHE_KEY, info);
  return resolve(info);
}
