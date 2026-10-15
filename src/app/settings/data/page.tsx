import { BackupManager } from '@/components/settings/BackupManager';

export const dynamic = 'force-dynamic';

export default function DataSettingsPage() {
  return (
    <div className="settings-groups">
      <BackupManager />
    </div>
  );
}
