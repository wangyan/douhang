'use client';

import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { Download, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { SettingRow } from '@/components/settings/SettingRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
import { DIALOG_WIDTH, ICON_SIZE } from '@/lib/design-tokens';
import { ApiError } from '@/lib/request/ApiError';
import { backupApi } from '@/services';

/** 备份导出与需二次确认的数据恢复。 */
export function BackupManager() {
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const pending = useRef(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const feedback = useSaveFeedback();
  const router = useRouter();
  const busy = exporting || importing || pendingFile !== null;

  const handleExport = async () => {
    if (pending.current || pendingFileRef.current) return;
    pending.current = true;
    setExporting(true);
    try {
      const blob = await backupApi.exportBackup();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      anchor.href = url;
      anchor.download = `douhang-backup-${stamp}.zip`;
      // 延后释放，使浏览器先处理下载。
      setTimeout(() => URL.revokeObjectURL(url), 0);
      anchor.click();
      feedback.success('备份已导出');
    } catch (error) {
      feedback.error(error instanceof ApiError ? error.message : '导出失败');
    } finally {
      pending.current = false;
      setExporting(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || pending.current || pendingFileRef.current) return;
    pendingFileRef.current = file;
    setPendingFile(file);
  };

  const confirmImport = async () => {
    const file = pendingFileRef.current;
    if (!file || pending.current) return;
    pending.current = true;
    setImporting(true);
    try {
      await backupApi.importBackup(file);
      pendingFileRef.current = null;
      setPendingFile(null);
      feedback.success('恢复完成，页面即将刷新');
      router.refresh();
    } catch (error) {
      feedback.error(error instanceof ApiError ? error.message : '恢复失败');
    } finally {
      pending.current = false;
      setImporting(false);
    }
  };

  return (
    <>
      <SettingsSection
        title="备份"
        description="导出站点数据与上传文件"
        layout="rows"
      >
        <SettingRow
          label="导出备份"
          description="不含登录账号与密码（上传的图标与壁纸已一并打包）"
        >
          <Button
            label="导出备份"
            variant="secondary"
            size="sm"
            icon={<Download size={ICON_SIZE.sm} />}
            isLoading={exporting}
            isDisabled={busy}
            onClick={() => void handleExport()}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="危险操作"
        description="恢复备份将覆盖当前全部数据"
        variant="danger"
        layout="rows"
      >
        <SettingRow label="恢复备份" description="此操作不可撤销，请先导出备份">
          <Button
            label="从备份恢复"
            variant="destructive"
            size="sm"
            icon={<Upload size={ICON_SIZE.sm} />}
            isLoading={importing}
            isDisabled={busy}
            onClick={() => {
              if (!pending.current && !pendingFileRef.current) {
                fileRef.current?.click();
              }
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/zip,.zip"
            className="hidden"
            disabled={busy}
            onChange={handleFileChange}
          />
        </SettingRow>
      </SettingsSection>

      <AlertDialog
        isOpen={pendingFile !== null}
        onOpenChange={(open) => {
          if (!open && !pending.current) {
            pendingFileRef.current = null;
            setPendingFile(null);
          }
        }}
        title="从备份恢复"
        description={`将覆盖当前全部数据，此操作不可撤销。\n\n文件：${pendingFile?.name ?? ''}（${
          pendingFile ? (pendingFile.size / 1024 / 1024).toFixed(2) : 0
        } MB）`}
        cancelLabel="取消"
        actionLabel="确认恢复"
        actionVariant="destructive"
        isActionLoading={importing}
        onAction={() => void confirmImport()}
        width={DIALOG_WIDTH.md}
      />
    </>
  );
}
