import { VStack } from '@astryxdesign/core/VStack';
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

/**
 * 外观设置页
 *
 * Linear / Vercel 风格：Card 容器 + label-above-input
 * - 外观 Card：RadioList 即时保存主题与字体大小
 * - 显示 Card：卡片大小、简洁模式与 Widget 横条开关
 * - 壁纸 Card：默认展开，本地选中态，底部「撤销 + 应用」统一保存
 */
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
    <VStack gap={6}>
      <ThemeForm initialFontSize={normalizeFontSize(rawFontSize)}>
        <CardStatusBadgeSetting initialEnabled={cardStatusBadge} />
      </ThemeForm>
      <SettingsSection
        title="显示"
        description="显示密度、卡片简洁模式与 Widget 横条的显示开关"
      >
        <ViewDisplaySetting
          initialCardSimpleMode={cardSimpleMode}
          initialCardDensity={cardDensity ?? CARD_DENSITY_DEFAULT}
        />
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
    </VStack>
  );
}
