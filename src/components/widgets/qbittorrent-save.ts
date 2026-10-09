import { request } from '@/lib/request/request';
import { widgetsApi } from '@/services/widgets';
import type { QbittorrentConfig } from '@/types';

/**
 * qBittorrent 配置保存
 *
 * 写入新配置并进行真实连接验证；验证失败时抛出错误供表单提示。
 */
export async function saveQbittorrentConfig(
  config: QbittorrentConfig,
): Promise<void> {
  await request('/api/widgets/qbittorrent/config', {
    method: 'PUT',
    body: config,
  });
  const stats = await widgetsApi.validateQbittorrentConnection();
  if (!stats.available) {
    throw new Error(stats.error ?? '连接失败，请检查配置');
  }
}
