import { CardStatusBadgeSetting } from '@/components/settings/CardStatusBadgeSetting';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ThemeForm } from '@/components/settings/ThemeForm';
import { ViewDisplaySetting } from '@/components/settings/ViewDisplaySetting';
import { WallpaperManager } from '@/components/settings/WallpaperManager';
import { normalizeFontSize } from '@/lib/font-size';
import { getUserPreference } from '@/lib/preferences';
import { getWallpaperPreferences, getWallpapers } from '@/lib/wallpaper';
import {
  CARD_DENSITY_DEFAULT,
  type CardDensity,
  FONT_SIZE_DEFAULT,
  WALLPAPER_SCRIM_DEFAULT,
} from '@/types';

export const dynamic = 'force-dynamic';

/** 外观设置页：主题、卡片显示与壁纸偏好。 */
export default async function AppearanceSettingsPage() {
  const [
    wallpapers,
    preferences,
    rawFontSize,
    cardStatusBadge,
    cardDensity,
    cardSimpleMode,
    wallpaperScrim,
  ] = await Promise.all([
    getWallpapers(),
    getWallpaperPreferences(),
    getUserPreference<unknown>('fontSize', FONT_SIZE_DEFAULT),
    getUserPreference<boolean>('cardStatusBadge', true),
    getUserPreference<CardDensity>('cardDensity', CARD_DENSITY_DEFAULT),
    getUserPreference<boolean>('cardSimpleMode', false),
    getUserPreference<unknown>('wallpaperScrim', WALLPAPER_SCRIM_DEFAULT),
  ]);

  return (
    <div className="settings-groups">
      <ThemeForm initialFontSize={normalizeFontSize(rawFontSize)} />
      <SettingsSection
        title="卡片显示"
        description="设置首页卡片显示密度、简洁模式、可达状态与 Widget 横条"
        layout="rows"
      >
        <ViewDisplaySetting
          initialCardSimpleMode={cardSimpleMode}
          initialCardDensity={cardDensity ?? CARD_DENSITY_DEFAULT}
        />
        <CardStatusBadgeSetting initialEnabled={cardStatusBadge} />
      </SettingsSection>
      <WallpaperManager
        wallpapers={wallpapers}
        preferences={preferences}
        initialScrim={
          typeof wallpaperScrim === 'number'
            ? wallpaperScrim
            : WALLPAPER_SCRIM_DEFAULT
        }
      />
    </div>
  );
}
