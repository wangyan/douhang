'use client';

import { Dialog } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { RotateCcw, X } from 'lucide-react';
import { CardStatusBadgeSetting } from '@/components/settings/CardStatusBadgeSetting';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ThemeForm } from '@/components/settings/ThemeForm';
import { ViewDisplaySetting } from '@/components/settings/ViewDisplaySetting';
import { WallpaperManager } from '@/components/settings/WallpaperManager';
import { DIALOG_WIDTH, ICON_SIZE } from '@/lib/design-tokens';
import { clearAllGuestPreferences } from '@/lib/guest-preferences';
import type {
  CardDensity,
  FontSizePreference,
  Wallpaper,
  WallpaperPreferences,
} from '@/types';

/** 外观快捷面板数据包（首页 SSR 取好后经工具栏透传） */
export interface AppearancePanelData {
  wallpapers: Wallpaper[];
  wallpaperPreferences: WallpaperPreferences;
  wallpaperScrim: number;
  fontSize: FontSizePreference;
  cardDensity: CardDensity;
  cardStatusBadge: boolean;
}

interface AppearanceQuickPanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  data: AppearancePanelData;
  /** 卡片简洁模式（工具栏 SSR 初始值，传入「显示」分区） */
  cardSimpleMode: boolean;
  /** 是否已登录（未登录时采用双层偏好模式） */
  isAuthed?: boolean;
}

/**
 * 外观快捷面板（头像菜单入口）
 *
 * 贴视口右侧的纵向面板，直接复用外观设置页同一套组件
 * （ThemeForm / CardStatusBadgeSetting / WallpaperManager），零复制：
 * - 管理员：全站偏好即时落库，具备完整上传与 Widget 管理权限
 * - 游客：双层偏好模式，仅保存在当前浏览器本地，预置壁纸即时生效
 */
export function AppearanceQuickPanel({
  isOpen,
  onOpenChange,
  data,
  cardSimpleMode,
  isAuthed = true,
}: AppearanceQuickPanelProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      aria-label="外观快捷设置"
      purpose="info"
      width={DIALOG_WIDTH.md}
      padding={4}
      maxHeight="calc(100dvh - 32px)"
      position={{ end: 16, top: 16, bottom: 16 }}
    >
      <VStack gap={4}>
        <HStack justify="between" align="center">
          <Text size="base" weight="semibold" className="text-primary">
            外观
          </Text>
          <IconButton
            label="关闭"
            icon={<X size={ICON_SIZE.md} />}
            variant="ghost"
            onClick={() => onOpenChange(false)}
          />
        </HStack>
        {/* 高度 = 对话框 maxHeight 偏移(32px) + 内边距/标题行/间距(约 5.5rem，随字号缩放) */}
        <div className="max-h-[calc(100dvh-32px-5.5rem)] overflow-y-auto">
          <VStack gap={4}>
            <ThemeForm
              title="主题与字体"
              initialFontSize={data.fontSize}
              isAuthed={isAuthed}
            />
            <SettingsSection
              title="卡片显示"
              description={
                isAuthed
                  ? '设置显示密度、简洁模式、可达状态与 Widget 横条'
                  : '卡片显示设置仅保存在本机'
              }
              layout="rows"
            >
              <ViewDisplaySetting
                initialCardSimpleMode={cardSimpleMode}
                initialCardDensity={data.cardDensity}
                isAuthed={isAuthed}
              />
              <CardStatusBadgeSetting
                initialEnabled={data.cardStatusBadge}
                isAuthed={isAuthed}
              />
            </SettingsSection>
            <WallpaperManager
              wallpapers={data.wallpapers}
              preferences={data.wallpaperPreferences}
              initialScrim={data.wallpaperScrim}
              isAuthed={isAuthed}
              compact
            />

            {!isAuthed && (
              <div className="pt-3 mt-1 border-t border-border flex flex-wrap items-center justify-between gap-2 text-sm text-secondary">
                <span>访客模式 · 仅保存在本机</span>
                <button
                  type="button"
                  onClick={async () => {
                    await clearAllGuestPreferences();
                    window.location.reload();
                  }}
                  className="inline-flex items-center gap-1.5 py-1 px-2 rounded-control text-secondary hover:text-primary hover:bg-surface-hover transition-colors focus-ring cursor-pointer"
                >
                  <RotateCcw size={ICON_SIZE.sm} />
                  <span>恢复默认外观</span>
                </button>
              </div>
            )}
          </VStack>
        </div>
      </VStack>
    </Dialog>
  );
}
