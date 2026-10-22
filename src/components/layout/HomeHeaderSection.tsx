'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HomeClock } from '@/components/layout/HomeClock';
import { SearchBox } from '@/components/search/SearchBox';
import { useEffectiveDensity } from '@/hooks/useEffectiveDensity';
import type { CardDensity, SearchEngine, SearchEngineConfig } from '@/types';

interface HomeHeaderSectionProps {
  initialDensity?: CardDensity;
  initialEngine?: SearchEngine;
  engines: SearchEngineConfig[];
  /** 站点时区（IANA 名称） */
  siteTimeZone?: string;
}

/**
 * 首屏头部区域（时钟 + 搜索框联合容器）
 *
 * 统一响应显示密度变更，让时钟、搜索栏及其层间距协同缩放：
 * - 自动 (auto)：根据屏幕分辨率智能匹配（<=1080p 紧凑，2K 标准，4K 宽松）
 * - 紧凑 (compact)：小尺寸时钟 + 42px 搜索框 + 紧凑间隙与宽度
 * - 标准 (normal)：标准时钟 + 52px 搜索框 + 标准间距
 * - 宽松 (cozy)：大字号时钟 + 58px 搜索框 + 舒展间距
 */
export function HomeHeaderSection({
  initialDensity = 'auto',
  initialEngine = 'metaso',
  engines,
  siteTimeZone,
}: HomeHeaderSectionProps) {
  const density = useEffectiveDensity(initialDensity);

  const isCompact = density === 'compact';
  const isCozy = density === 'cozy';

  const containerMaxWidth = isCompact
    ? 'max-w-[580px]'
    : isCozy
      ? 'max-w-[780px]'
      : 'max-w-[720px]';

  const gapStyle = isCompact
    ? 'clamp(0.75rem, 1.8vh, 1.5rem)'
    : isCozy
      ? 'clamp(1.25rem, 3.2vh, 3rem)'
      : 'clamp(1rem, 2.5vh, 2.25rem)';

  return (
    <VStack
      className={`mx-auto w-full transition-[max-width] duration-200 ${containerMaxWidth}`}
      style={{
        gap: gapStyle,
      }}
    >
      <HomeClock density={density} timeZone={siteTimeZone} />
      <SearchBox
        initialEngine={initialEngine}
        engines={engines}
        density={density}
      />
    </VStack>
  );
}
