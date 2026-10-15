import { AppShell } from '@astryxdesign/core/AppShell';
import type { ReactNode } from 'react';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { SettingsSideNav } from '@/components/settings/SettingsSideNav';
import { auth } from '@/lib/auth';
import { getBrandConfig } from '@/lib/brand';
import { prisma } from '@/lib/db';
import { getUserPreference } from '@/lib/preferences';
import { FULL_WIDTH_DEFAULT } from '@/types';

export const dynamic = 'force-dynamic';

export default async function SettingsRootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [brand, session, fullWidth] = await Promise.all([
    getBrandConfig(),
    auth(),
    getUserPreference<boolean>('fullWidth', FULL_WIDTH_DEFAULT),
  ]);
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { username: true },
      })
    : null;

  return (
    <div className="settings-shell h-dvh w-full">
      <AppShell
        contentPadding={0}
        height="fill"
        variant="section"
        sideNav={
          <SettingsSideNav
            brand={brand}
            username={user?.username ?? '管理员'}
          />
        }
        mobileNav={{ breakpoint: 'none', hasToggle: false }}
      >
        <SettingsLayout initialFullWidth={fullWidth}>{children}</SettingsLayout>
      </AppShell>
    </div>
  );
}
