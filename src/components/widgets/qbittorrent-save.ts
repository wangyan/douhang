import { request } from '@/lib/request/request';
import { widgetsApi } from '@/services/widgets';
import type { QbittorrentConfig } from '@/types';

/**
 * qBittorrent 配置保存（补偿事务）
 *
 * 连接验证读取服务端已存配置，因此先写入新配置再验证；
 * 验证失败时回滚为原配置并抛出错误，不残留无效配置。
 */
export async function saveQbittorrentConfig(
  config: QbittorrentConfig,
): Promise<void> {
  const previous = await widgetsApi.getQbittorrentConfig();
  await request('/api/preferences', {
    method: 'PATCH',
    body: { key: 'qbittorrent', value: config },
  });
  try {
    const stats = await widgetsApi.validateQbittorrentConnection();
    if (!stats.available) {
      throw new Error(stats.error ?? '连接失败，请检查配置');
    }
  } catch (e) {
    await request('/api/preferences', {
      method: 'PATCH',
      body: { key: 'qbittorrent', value: previous },
    }).catch(() => {});
    throw e instanceof Error ? e : new Error('连接失败，请检查配置');
  }
}
