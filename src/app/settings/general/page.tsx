import { BrandForm } from '@/components/settings/BrandForm';
import { NetworkForm } from '@/components/settings/NetworkForm';
import { getBrandConfig } from '@/lib/brand';
import { getUserPreference } from '@/lib/preferences';
import type { NetworkMode } from '@/types';

export const dynamic = 'force-dynamic';

export default async function GeneralSettingsPage() {
  const [brand, networkMode] = await Promise.all([
    getBrandConfig(),
    getUserPreference<NetworkMode>('networkMode', 'auto'),
  ]);

  return (
    <div className="settings-groups">
      <BrandForm initialBrand={brand} />
      <NetworkForm initialMode={networkMode} />
    </div>
  );
}
