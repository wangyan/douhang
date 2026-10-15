'use client';

import { Text } from '@astryxdesign/core/Text';
import { ArrowLeft, FoldHorizontal, UnfoldHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import {
  SettingsLogout,
  SettingsMobileNavPicker,
} from '@/components/settings/SettingsSideNav';
import {
  getActiveSettingsNavItem,
  SETTINGS_NAV_ITEMS,
} from '@/components/settings/settings-nav-items';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
import { ICON_SIZE } from '@/lib/design-tokens';
import { preferencesApi } from '@/services';
import { FULL_WIDTH_DEFAULT } from '@/types';

const CONTENT_MAX_WIDTH: Record<string, string> = {
  '/settings/assets': '1280px',
};
const DEFAULT_CONTENT_MAX_WIDTH = '960px';

interface SettingsLayoutProps {
  children: ReactNode;
  initialFullWidth?: boolean;
}

export function SettingsLayout({
  children,
  initialFullWidth = FULL_WIDTH_DEFAULT,
}: SettingsLayoutProps) {
  const pathname = usePathname();
  const current = getActiveSettingsNavItem(pathname) ?? SETTINGS_NAV_ITEMS[0];
  const feedback = useSaveFeedback();
  const [fullWidth, setFullWidth] = useState(initialFullWidth);

  const maxWidth = fullWidth
    ? '100%'
    : (CONTENT_MAX_WIDTH[pathname] ?? DEFAULT_CONTENT_MAX_WIDTH);

  const handleToggleFullWidth = async (nextValue: boolean) => {
    if (nextValue === fullWidth) return;
    const previous = fullWidth;
    setFullWidth(nextValue);
    try {
      await preferencesApi.update('fullWidth', nextValue);
    } catch {
      setFullWidth(previous);
      feedback.error('页面布局设置保存失败，已恢复原设置');
    }
  };

  return (
    <section
      className="settings-page scrollbar-hidden focus-ring"
      aria-label="设置内容"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: 滚动容器需接收键盘焦点。
      tabIndex={0}
    >
      <div
        className="settings-content"
        data-full-width={fullWidth}
        style={{ maxWidth }}
      >
        <div className="settings-mobile-header md:hidden">
          <Link
            href="/"
            aria-label="返回首页"
            className="settings-home-link focus-ring"
          >
            <ArrowLeft size={ICON_SIZE.md} />
            首页
          </Link>
          <div className="flex items-center gap-1">
            <SettingsMobileNavPicker />
            <SettingsLogout />
          </div>
        </div>
        <header className="settings-page-heading">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Text
                as="h1"
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  lineHeight: '1.75rem',
                }}
              >
                {current.label}
              </Text>
              <Text size="sm" color="secondary" textWrap="pretty">
                {current.description}
              </Text>
            </div>
            <div className="settings-layout-segmented">
              <button
                type="button"
                onClick={() => void handleToggleFullWidth(true)}
                className={`settings-layout-tab focus-ring ${fullWidth ? 'is-active' : ''}`}
                aria-pressed={fullWidth}
                title="全宽布局（铺满工作区）"
              >
                <UnfoldHorizontal size={ICON_SIZE.xs} />
                <span>全宽</span>
              </button>
              <button
                type="button"
                onClick={() => void handleToggleFullWidth(false)}
                className={`settings-layout-tab focus-ring ${!fullWidth ? 'is-active' : ''}`}
                aria-pressed={!fullWidth}
                title="居中布局（内容受控限宽并居中）"
              >
                <FoldHorizontal size={ICON_SIZE.xs} />
                <span>居中</span>
              </button>
            </div>
          </div>
        </header>
        {children}
      </div>
    </section>
  );
}
