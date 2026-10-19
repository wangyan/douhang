import {
  AboutChangelog,
  AboutResourceLinks,
  AboutSystemInfo,
} from '@/components/settings/AboutSections';
import { VersionCheckSetting } from '@/components/settings/VersionCheckSetting';
import { getUserPreference } from '@/lib/preferences';
import { ATOMGIT_URL, getReleasesPageUrl, REPO_URL } from '@/lib/version';
import type { VersionUpdateInfo } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * 关于设置页
 *
 * 统一信息与版本控制中心：
 * - 官方项目与文档直达（AboutResourceLinks）
 * - 版本更新检测与升级指引（VersionCheckSetting）
 * - 更新日志与历史亮点（AboutChangelog）
 * - 系统规格与运行环境（AboutSystemInfo）
 */
export default async function AboutSettingsPage() {
  const [versionCheckEnabled, cnMirrorEnabled, versionCheckCache] =
    await Promise.all([
      getUserPreference<boolean>('versionCheckEnabled', true),
      getUserPreference<boolean>('cnMirrorEnabled', false),
      getUserPreference<VersionUpdateInfo | null>('versionCheckCache', null),
    ]);

  return (
    <div className="settings-groups">
      <AboutResourceLinks cnMirror={cnMirrorEnabled} />
      <VersionCheckSetting
        initialEnabled={versionCheckEnabled}
        initialCnMirror={cnMirrorEnabled}
        initialUpdate={versionCheckCache}
      />
      <AboutChangelog
        releasesUrl={getReleasesPageUrl(
          cnMirrorEnabled ? ATOMGIT_URL : REPO_URL,
        )}
      />
      <AboutSystemInfo />
    </div>
  );
}
