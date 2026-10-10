import pkg from '../../package.json';

/** 应用版本号（package.json 单一来源，不含 v 前缀），用于设置页展示 */
export const APP_VERSION = pkg.version;

/** 获取配置的代码托管平台域名（默认：github.com） */
export function getCodeHost(): string {
  return (
    process.env.NEXT_PUBLIC_CODE_HOST ||
    process.env.CODE_HOST ||
    'github.com'
  ).trim();
}

/** 获取配置的仓库路径（默认：wangyan/douhang） */
export function getRepoName(): string {
  return (
    process.env.NEXT_PUBLIC_REPO_NAME ||
    process.env.REPO_NAME ||
    'wangyan/douhang'
  ).trim();
}

/** 判断当前 Host 是否属于 GitHub */
export function isGitHubHost(host = getCodeHost()): boolean {
  return host === 'github.com' || host.endsWith('.github.com');
}

/** 远端仓库主页地址 */
export function getRepoUrl(): string {
  return `https://${getCodeHost()}/${getRepoName()}`;
}

/** 获取用户指南完整 URL（面向访客与日常使用者，适配 GitHub blob 或 Forgejo/Gitea src/branch） */
export function getUserGuideUrl(): string {
  const host = getCodeHost();
  const repo = getRepoName();
  const docPath = isGitHubHost(host)
    ? 'blob/main/docs/USER_GUIDE.md'
    : 'src/branch/main/docs/USER_GUIDE.md';
  return `https://${host}/${repo}/${docPath}`;
}

/** 获取管理指南完整 URL（面向已登录管理员，适配 GitHub blob 或 Forgejo/Gitea src/branch） */
export function getAdminGuideUrl(): string {
  const host = getCodeHost();
  const repo = getRepoName();
  const docPath = isGitHubHost(host)
    ? 'blob/main/docs/ADMIN_GUIDE.md'
    : 'src/branch/main/docs/ADMIN_GUIDE.md';
  return `https://${host}/${repo}/${docPath}`;
}

/** 获取使用指南完整 URL（默认指向用户指南） */
export function getManualUrl(): string {
  return getUserGuideUrl();
}

/** Releases 列表页地址（GitHub 与 Forgejo / Gitea 路径一致） */
export function getReleasesPageUrl(repoUrl?: string): string {
  return `${repoUrl ?? getRepoUrl()}/releases`;
}

/** Releases 检测源（适配 GitHub api.github.com 或 Forgejo/Gitea api/v1） */
export function getReleasesLatestUrl(): string {
  const host = getCodeHost();
  const repo = getRepoName();
  if (isGitHubHost(host)) {
    return `https://api.github.com/repos/${repo}/releases/latest`;
  }
  return `https://${host}/api/v1/repos/${repo}/releases/latest`;
}

/** 静态只读属性（供同步引用场景使用） */
export const REPO_URL = getRepoUrl();
export const MANUAL_URL = getManualUrl();
export const USER_GUIDE_URL = getUserGuideUrl();
export const ADMIN_GUIDE_URL = getAdminGuideUrl();
export const RELEASES_LATEST_URL = getReleasesLatestUrl();

/** 解析 vX.Y.Z 版本号为 [major, minor, patch]，非法格式返回 null */
export function parseVersion(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** 语义化版本比较：a>b → 1，a<b → -1，相等 → 0；任一非法返回 null */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** 判断 latest 是否比 current 更新（任一版本非法视为否，避免误报） */
export function isNewerVersion(current: string, latest: string): boolean {
  return compareVersions(current, latest) === -1;
}

export interface LatestRelease {
  tag: string;
  notes: string;
  url: string;
}

/**
 * 解析 Releases API 响应
 *
 * releases/latest 不含 draft / prerelease；tag 形如 v1.1.0，
 * 非常规 tag（含后缀等）返回 null，避免版本比较误报。
 */
export function parseLatestRelease(payload: unknown): LatestRelease | null {
  const data = payload as {
    tag_name?: unknown;
    body?: unknown;
    html_url?: unknown;
  } | null;
  if (
    !data ||
    typeof data.tag_name !== 'string' ||
    typeof data.body !== 'string' ||
    typeof data.html_url !== 'string'
  ) {
    return null;
  }
  if (!/^v\d+\.\d+\.\d+$/.test(data.tag_name)) return null;
  return { tag: data.tag_name, notes: data.body, url: data.html_url };
}
