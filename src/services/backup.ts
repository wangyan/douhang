import { request } from '@/lib/request/request';
import type { BackupData } from '@/lib/validation';

/**
 * 备份 API service
 *
 * 导出为 zip（backup.json + data/uploads）；导入同样以 zip 上传
 */
export const backupApi = {
  /** 导出：原始 fetch 拿 Blob（zip 文件下载） */
  exportBackup: async (): Promise<Blob> => {
    const res = await fetch('/api/backup');
    if (!res.ok) throw new Error(`导出失败（${res.status}）`);
    return res.blob();
  },

  /** 导入：上传 zip；数据库在事务内清空重建，上传文件在事务外覆盖写入，失败时可能部分还原 */
  importBackup: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<{ success: boolean }>('/api/backup', {
      method: 'POST',
      body: formData,
    });
  },
};

export type { BackupData };
