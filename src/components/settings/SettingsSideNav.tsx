'use client';

import { Avatar } from '@astryxdesign/core/Avatar';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { IconButton } from '@astryxdesign/core/IconButton';
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import { Text } from '@astryxdesign/core/Text';
import { Check, Home, LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState } from 'react';
import useSWR from 'swr';
import { BrandMark } from '@/components/layout/BrandMark';
import { BrandTitle } from '@/components/layout/BrandTitle';
import {
  getActiveSettingsNavItem,
  SETTINGS_NAV_GROUPS,
  SETTINGS_NAV_ITEMS,
} from '@/components/settings/settings-nav-items';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
import { DEFAULT_BRAND_CONFIG } from '@/lib/brand-constants';
import { ICON_SIZE } from '@/lib/design-tokens';
import { APP_VERSION } from '@/lib/version';
import { accountApi } from '@/services';
import type { BrandConfig } from '@/types';

export function SettingsSideNav({
  brand,
  username,
}: {
  brand: BrandConfig;
  username: string;
}) {
  const pathname = usePathname();
  const { data: account } = useSWR(accountApi.getKey, accountApi.get);
  const currentUsername = account?.username ?? username;

  return (
    <SideNav
      className="settings-side-nav max-md:hidden"
      header={
        <div className="settings-brand-header">
          <Link
            href="/"
            aria-label="返回首页"
            className="inline-flex shrink-0 items-center rounded-control focus-ring"
          >
            <BrandMark size="md" logo={brand.logo} aria-label={brand.title} />
          </Link>
          <BrandTitle
            title={brand.title || DEFAULT_BRAND_CONFIG.title}
            className="brand-title min-w-0 flex-1 truncate select-none text-primary"
          />
        </div>
      }
      topContent={
        <div className="settings-top-actions">
          <Link
            href="/"
            className="settings-nav-home-btn focus-ring"
            title="返回前台首页"
          >
            <Home size={ICON_SIZE.md} className="shrink-0" />
            <span className="flex-1 truncate">主页</span>
          </Link>
        </div>
      }
      footer={
        <div className="settings-account-footer">
          <Avatar name={currentUsername} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col">
            <Text size="sm" weight="medium" className="truncate">
              {currentUsername}
            </Text>
            <Text size="sm" color="secondary">
              管理员 · v{APP_VERSION}
            </Text>
          </div>
          <SettingsLogout />
        </div>
      }
    >
      {SETTINGS_NAV_GROUPS.map((group) => (
        <SideNavSection
          key={group}
          title={group}
          className="settings-nav-section"
        >
          {SETTINGS_NAV_ITEMS.filter((item) => item.group === group).map(
            (item) => (
              <SideNavItem
                key={item.href}
                as={Link}
                label={item.label}
                href={item.href}
                icon={item.icon}
                size="md"
                isSelected={
                  getActiveSettingsNavItem(pathname)?.href === item.href
                }
              />
            ),
          )}
        </SideNavSection>
      ))}
    </SideNav>
  );
}

export function SettingsMobileNavPicker() {
  const pathname = usePathname();
  const current = getActiveSettingsNavItem(pathname) ?? SETTINGS_NAV_ITEMS[0];

  return (
    <DropdownMenu
      button={{
        label: current.label,
        icon: <Menu size={ICON_SIZE.md} />,
        variant: 'secondary',
        size: 'sm',
      }}
      alignment="end"
      presentation="adaptive"
      menuWidth={240}
      items={SETTINGS_NAV_GROUPS.map((group) => ({
        type: 'section' as const,
        title: group,
        items: SETTINGS_NAV_ITEMS.filter((item) => item.group === group).map(
          (item) => ({
            label: item.label,
            href: item.href,
            onClick: () => {
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
            },
            icon: <item.icon width={ICON_SIZE.md} height={ICON_SIZE.md} />,
            endContent:
              item.href === current.href ? (
                <Check size={ICON_SIZE.sm} />
              ) : undefined,
          }),
        ),
      }))}
    />
  );
}

export function SettingsLogout() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const feedback = useSaveFeedback();

  const logout = async () => {
    if (pending) return;
    setPending(true);
    try {
      await signOut({ redirect: false });
      router.replace('/');
      router.refresh();
    } catch {
      setPending(false);
      feedback.error('退出登录失败，请稍后重试');
    }
  };

  return (
    <IconButton
      label="退出登录"
      tooltip="退出登录"
      icon={<LogOut size={ICON_SIZE.md} />}
      variant="ghost"
      size="sm"
      isDisabled={pending}
      onClick={() => void logout()}
    />
  );
}
