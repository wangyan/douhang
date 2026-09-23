import { Spinner } from '@astryxdesign/core/Spinner';
import { Text } from '@astryxdesign/core/Text';

/**
 * 全局加载态
 *
 * 在服务端组件等待 DB 查询时显示，替代空白屏。
 * 品牌锚点（FloatingLogo）仅渲染于主页与设置页。
 */
export default function Loading() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <Spinner size="lg" />
      <Text className="text-secondary">加载中…</Text>
    </main>
  );
}
