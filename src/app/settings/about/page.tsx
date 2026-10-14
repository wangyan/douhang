import { VStack } from '@astryxdesign/core/VStack';
import {
  AboutChangelog,
  AboutHero,
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
 * - 品牌与项目概览（Hero Card）
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
    <VStack gap={6}>
      <AboutHero />
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
    </VStack>
  );
}
