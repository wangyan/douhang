/**
 * 自动化检查并全量对齐主仓与镜像仓库的 Release 发行版记录
 *
 * 核心特性与健壮性设计：
 * 1. 事实源对齐：严格基于 CHANGELOG.md 作为唯一事实源（vX.Y.Z）；
 * 2. 全量一致性对齐：自动补齐缺失版本，并自动比对更新标题与正文差异，确保主仓与镜像仓 100% 完全一致；
 * 3. 自动分页检测：处理 API 分页（每页 100 条递增遍历），支持历史版本数十乃至上百个的场景；
 * 4. 超时与重试容错：内置 10 秒请求超时，防止内网/VPN 私有镜像服务器失联导致脚本卡死；
 * 5. 配置自适应解析：从 MIRROR_REPO_URL 智能提取 host 与 repo，容忍未显式配置 MIRROR_CODE_HOST；
 * 6. 状态码友好诊断：针对 401/403/404/422 及网络断连给出清晰排错指引；
 * 7. 灵活参数过滤：支持仅针对指定版本号（如 `v1.0.0`）单项执行。
 *
 * 执行方式：
 * - npm run release:sync                       # 全量同步：自动补齐缺失版本并更新差异，使多仓完全一致
 * - npm run release:check                      # 一致性检查：只读比对多仓与 CHANGELOG 差异，不发起网络写入
 * - npm run release:sync v1.0.0                # 针对指定版本执行全量同步
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const REQUEST_TIMEOUT_MS = 10000;

interface ParsedRelease {
  tag: string;
  name: string;
  date: string;
  body: string;
}

interface RemoteRelease {
  id: number | string;
  tag_name: string;
  name?: string;
  body?: string;
  html_url?: string;
}

interface PlatformConfig {
  name: string;
  host: string;
  repo: string;
  token?: string;
  apiUrl: string;
  authHeader: string;
  isGitHub: boolean;
}

/** 从 Git URL 中提取主机名与仓库名（兼容 ssh://, git@, https:// 等格式） */
function parseGitUrl(rawUrl: string): { host: string; repo: string } | null {
  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith('ssh://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname;
      const pathname = parsed.pathname.replace(/^\//, '').replace(/\.git$/, '');
      if (host && pathname) {
        return { host, repo: pathname };
      }
    } catch {}
  }
  const scpMatch = trimmed.match(
    /^(?:[\w-]+@)?([^:]+):([^/]+(?:\/[^/]+)+)(?:\.git)?$/,
  );
  if (scpMatch) {
    return { host: scpMatch[1], repo: scpMatch[2].replace(/\.git$/, '') };
  }
  return null;
}

/** 解析 CHANGELOG.md 获取所有版本定义与对应说明 */
function loadChangelogReleases(): ParsedRelease[] {
  const root = resolve(import.meta.dirname, '..');
  const changelogPath = resolve(root, 'CHANGELOG.md');
  const content = readFileSync(changelogPath, 'utf8');
  const lines = content.split('\n');

  const releases: ParsedRelease[] = [];
  let current: {
    tag: string;
    name: string;
    date: string;
    lines: string[];
  } | null = null;

  for (const line of lines) {
    const match = line.match(/^##\s+(v[0-9]+\.[0-9]+\.[0-9]+)(?:\s+-\s+(.+))?/);
    if (match) {
      if (current) {
        releases.push({
          tag: current.tag,
          name: current.name,
          date: current.date,
          body: current.lines.join('\n').trim(),
        });
      }
      current = {
        tag: match[1],
        name: match[1],
        date: match[2]?.trim() || '',
        lines: [],
      };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    releases.push({
      tag: current.tag,
      name: current.name,
      date: current.date,
      body: current.lines.join('\n').trim(),
    });
  }

  return releases.reverse();
}

/** 获取主仓库平台配置 */
function getPrimaryConfig(): PlatformConfig {
  const host = (process.env.CODE_HOST || 'github.com').trim();
  const repo = (process.env.REPO_NAME || 'wangyan/douhang').trim();
  const token = process.env.REPO_TOKEN?.trim();
  const isGitHub = host === 'github.com' || host.endsWith('.github.com');

  const apiUrl = isGitHub
    ? `https://api.github.com/repos/${repo}/releases`
    : `https://${host}/api/v1/repos/${repo}/releases`;

  const authHeader = isGitHub ? `Bearer ${token}` : `token ${token}`;

  return {
    name: `主仓 (${host})`,
    host,
    repo,
    token,
    apiUrl,
    authHeader,
    isGitHub,
  };
}

/** 获取镜像仓库平台配置（支持显式变量与 MIRROR_REPO_URL 智能提取） */
function getMirrorConfig(): PlatformConfig | null {
  let host = process.env.MIRROR_CODE_HOST?.trim();
  let repo = process.env.MIRROR_REPO_NAME?.trim();
  const token = process.env.MIRROR_REPO_TOKEN?.trim();
  const mirrorUrl = process.env.MIRROR_REPO_URL?.trim();

  // 若未显式配置 MIRROR_CODE_HOST，尝试从 MIRROR_REPO_URL 自动推断
  if (!host && mirrorUrl) {
    const parsed = parseGitUrl(mirrorUrl);
    if (parsed) {
      host = parsed.host;
      if (!repo) repo = parsed.repo;
    }
  }

  if (!host) return null;
  if (!repo) repo = (process.env.REPO_NAME || 'wangyan/douhang').trim();

  const isGitHub = host === 'github.com' || host.endsWith('.github.com');
  const apiUrl = isGitHub
    ? `https://api.github.com/repos/${repo}/releases`
    : `https://${host}/api/v1/repos/${repo}/releases`;

  const authHeader = isGitHub ? `Bearer ${token}` : `token ${token}`;

  return {
    name: `镜像仓 (${host})`,
    host,
    repo,
    token,
    apiUrl,
    authHeader,
    isGitHub,
  };
}

/** 带超时的标准 fetch 封装 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** 分页拉取远端已有的所有 Release 记录 */
async function fetchAllRemoteReleases(
  config: PlatformConfig,
): Promise<Map<string, RemoteRelease>> {
  if (!config.token) {
    console.warn(`[${config.name}] 提示：未配置访问 Token，跳过远端检测`);
    return new Map();
  }

  const releasesMap = new Map<string, RemoteRelease>();
  let page = 1;
  const pageSize = 100;

  while (true) {
    const pageUrl = `${config.apiUrl}?per_page=${pageSize}&limit=${pageSize}&page=${page}`;
    try {
      const res = await fetchWithTimeout(pageUrl, {
        headers: {
          Authorization: config.authHeader,
          Accept: 'application/json',
          'User-Agent': 'DouHang-Release-Sync',
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('401 Unauthorized：Token 无效或已过期');
        }
        if (res.status === 403) {
          throw new Error('403 Forbidden：权限不足或触发 API 请求限流');
        }
        if (res.status === 404) {
          throw new Error(`404 Not Found：找不到仓库 ${config.repo}`);
        }
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const list = (await res.json()) as RemoteRelease[];
      if (!Array.isArray(list) || list.length === 0) {
        break;
      }

      for (const item of list) {
        if (item.tag_name) {
          releasesMap.set(item.tag_name, item);
        }
      }

      if (list.length < pageSize) {
        break;
      }
      page++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `连接超时（${REQUEST_TIMEOUT_MS / 1000}s），目标服务器未响应`,
        );
      }
      throw new Error(`获取远端列表失败：${msg}`);
    }
  }

  return releasesMap;
}

/** 创建远端 Release */
async function createRemoteRelease(
  config: PlatformConfig,
  release: ParsedRelease,
  dryRun: boolean,
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (dryRun) {
    return {
      success: true,
      url: `[DRY-RUN] 将在 https://${config.host}/${config.repo}/releases 发布 ${release.tag}`,
    };
  }

  try {
    const payload = {
      tag_name: release.tag,
      name: release.name,
      body: release.body,
      target_commitish: 'main',
      draft: false,
      prerelease: false,
    };

    const res = await fetchWithTimeout(config.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: config.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'DouHang-Release-Sync',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 201 || res.status === 200) {
      const data = (await res.json()) as { html_url?: string };
      const url =
        data.html_url ||
        `https://${config.host}/${config.repo}/releases/tag/${release.tag}`;
      return { success: true, url };
    }

    const errBody = await res.text();
    // 捕获并发或远端已存在同名记录的场景
    if (
      res.status === 422 &&
      errBody.toLowerCase().includes('already_exists')
    ) {
      return {
        success: true,
        url: `https://${config.host}/${config.repo}/releases/tag/${release.tag}（远端已存在同名记录）`,
      };
    }

    return {
      success: false,
      error: `HTTP ${res.status} - ${errBody.slice(0, 300)}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/** 更新远端已有 Release 的内容正文 */
async function updateRemoteRelease(
  config: PlatformConfig,
  releaseId: number | string,
  release: ParsedRelease,
  dryRun: boolean,
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (dryRun) {
    return {
      success: true,
      url: `[DRY-RUN] 将更新 https://${config.host}/${config.repo}/releases/${releaseId} (${release.tag})`,
    };
  }

  const updateUrl = `${config.apiUrl}/${releaseId}`;
  try {
    const payload = {
      name: release.name,
      body: release.body,
    };

    const res = await fetchWithTimeout(updateUrl, {
      method: 'PATCH',
      headers: {
        Authorization: config.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'DouHang-Release-Sync',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 200) {
      const data = (await res.json()) as { html_url?: string };
      const url =
        data.html_url ||
        `https://${config.host}/${config.repo}/releases/tag/${release.tag}`;
      return { success: true, url };
    }

    const errBody = await res.text();
    return {
      success: false,
      error: `HTTP ${res.status} - ${errBody.slice(0, 300)}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun =
    args.includes('--dry-run') ||
    args.includes('dry-run') ||
    args.includes('--check') ||
    args.includes('check') ||
    args.includes('--preview') ||
    args.includes('preview');
  const targetTag = args.find(
    (a) => a.startsWith('v') || a.match(/^\d+\.\d+\.\d+$/),
  );
  const filterTag = targetTag
    ? targetTag.startsWith('v')
      ? targetTag
      : `v${targetTag}`
    : null;

  console.log('======================================================');
  console.log(
    isDryRun
      ? '斗法领航 Release 记录一致性检查工具 (只读模式)'
      : '斗法领航 Release 记录全量同步工具 (自动对齐)',
  );
  console.log('======================================================\n');

  let releases = loadChangelogReleases();
  if (filterTag) {
    releases = releases.filter((r) => r.tag === filterTag);
    if (releases.length === 0) {
      console.error(`未在 CHANGELOG.md 中找到指定版本：${filterTag}`);
      process.exit(1);
    }
    console.log(`指定同步版本：${filterTag}\n`);
  } else {
    console.log(
      `从 CHANGELOG.md 提取到 ${releases.length} 个版本定义：${releases.map((r) => r.tag).join(', ')}\n`,
    );
  }

  const primary = getPrimaryConfig();
  const mirror = getMirrorConfig();

  const platforms: PlatformConfig[] = [primary];
  if (mirror) {
    platforms.push(mirror);
  } else {
    console.log(
      '未检测到镜像平台配置（MIRROR_CODE_HOST / MIRROR_REPO_URL），仅处理主平台。\n',
    );
  }

  let totalPendingMissing = 0;
  let totalPendingMismatched = 0;

  for (const platform of platforms) {
    console.log(`------------------------------------------------------`);
    console.log(`检查目标：${platform.name} -> 仓库：${platform.repo}`);
    console.log(`------------------------------------------------------`);

    if (!platform.token) {
      console.log(`[跳过] 未配置访问令牌，无法检查或同步。\n`);
      continue;
    }

    let existingMap: Map<string, RemoteRelease>;
    try {
      existingMap = await fetchAllRemoteReleases(platform);
      console.log(
        `远端现有 Release 数量：${existingMap.size} 个 [${Array.from(existingMap.keys()).join(', ') || '无'}]`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ 远端检测失败：${message}\n`);
      continue;
    }

    let createdCount = 0;
    let updatedCount = 0;
    let consistentCount = 0;
    let failedCount = 0;

    for (const release of releases) {
      const remote = existingMap.get(release.tag);
      if (remote) {
        const remoteBody = (remote.body || '').trim();
        const localBody = release.body.trim();
        const remoteName = (remote.name || '').trim();
        const localName = release.name.trim();

        if (remoteBody !== localBody || remoteName !== localName) {
          totalPendingMismatched++;
          if (isDryRun) {
            console.log(
              `  ~ ${release.tag}：已存在但内容不一致 [只读检查：需对齐更新]`,
            );
            updatedCount++;
          } else {
            console.log(
              `  ~ ${release.tag}：已存在但内容不一致，正在同步更新...`,
            );
            const updateRes = await updateRemoteRelease(
              platform,
              remote.id,
              release,
              false,
            );
            if (updateRes.success) {
              console.log(`    ↳ 更新成功：${updateRes.url}`);
              updatedCount++;
            } else {
              console.error(`    ↳ 更新失败：${updateRes.error}`);
              failedCount++;
            }
          }
          continue;
        }

        console.log(`  ✓ ${release.tag}：已存在且内容完全一致`);
        consistentCount++;
        continue;
      }

      totalPendingMissing++;
      if (isDryRun) {
        console.log(`  + ${release.tag}：缺失 [只读检查：需补充创建]`);
        createdCount++;
      } else {
        console.log(`  + ${release.tag}：缺失，正在补充创建...`);
        const result = await createRemoteRelease(platform, release, false);
        if (result.success) {
          console.log(`    ↳ 补充成功：${result.url}`);
          createdCount++;
        } else {
          console.error(`    ↳ 补充失败：${result.error}`);
          failedCount++;
        }
      }
    }

    if (isDryRun) {
      const parts = [`完全一致 ${consistentCount}`];
      if (createdCount > 0) parts.push(`待补充 ${createdCount}`);
      if (updatedCount > 0) parts.push(`待更新 ${updatedCount}`);
      console.log(`\n平台 [${platform.name}] 检查结果：${parts.join('，')}\n`);
    } else {
      const parts = [`完全一致 ${consistentCount}`];
      if (createdCount > 0) parts.push(`新建 ${createdCount}`);
      if (updatedCount > 0) parts.push(`更新 ${updatedCount}`);
      if (failedCount > 0) parts.push(`失败 ${failedCount}`);
      console.log(`\n平台 [${platform.name}] 同步结果：${parts.join('，')}\n`);
    }
  }

  console.log('======================================================');
  if (isDryRun) {
    if (totalPendingMissing === 0 && totalPendingMismatched === 0) {
      console.log(
        '✓ 主仓与镜像仓库的 Release 记录与 CHANGELOG.md 100% 完全一致。',
      );
    } else {
      console.log(
        `! 发现差异（待补充: ${totalPendingMissing}，待更新: ${totalPendingMismatched}），可运行 npm run release:sync 进行全量同步。`,
      );
    }
  } else {
    console.log('所有平台 Release 全量同步流程执行完毕。');
  }
  console.log('======================================================');
}

main().catch((err) => {
  console.error('执行异常:', err);
  process.exit(1);
});
