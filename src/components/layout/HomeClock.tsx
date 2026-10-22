'use client';

import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useState } from 'react';
import { useEffectiveDensity } from '@/hooks/useEffectiveDensity';
import {
  formatClockDate,
  formatClockTime,
  getClockGreeting,
  getClockParts,
} from '@/lib/time';
import type { CardDensity } from '@/types';

interface HomeClockProps {
  density?: CardDensity;
  /** 站点时区（IANA 名称）；缺省时按访问设备本地时区显示 */
  timeZone?: string;
}

interface DensityStyle {
  maxWidth: number;
  minHeight: number;
  gap: 1 | 2;
  padding: 1 | 2 | 3;
  hstackGap: 2 | 4;
}

const DENSITY_STYLES: Record<string, DensityStyle> = {
  compact: { maxWidth: 540, minHeight: 54, gap: 1, padding: 1, hstackGap: 2 },
  cozy: { maxWidth: 720, minHeight: 88, gap: 2, padding: 3, hstackGap: 4 },
  normal: { maxWidth: 640, minHeight: 76, gap: 2, padding: 2, hstackGap: 4 },
};

/**
 * 首屏安静时钟。
 *
 * 不加装饰线或图形，只靠点阵大时间、次级信息、椭圆柔光和左右留白建立层级。
 * 响应全局显示密度：紧凑 (compact) 时小巧精致，标准 (normal) 适中，宽松 (cozy) 醒目大气。
 * 支持根据站点时区换算显示，未指定时使用访问设备本地时区。
 */
export function HomeClock({
  density: initialDensity = 'auto',
  timeZone,
}: HomeClockProps) {
  const [now, setNow] = useState<Date | null>(null);
  const density = useEffectiveDensity(initialDensity);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const style = DENSITY_STYLES[density] ?? DENSITY_STYLES.normal;
  const clockParts = now ? getClockParts(now, timeZone) : null;
  const timeZoneTitle = timeZone ? `站点时区：${timeZone}` : undefined;

  return (
    <VStack
      gap={style.gap}
      width="100%"
      maxWidth={style.maxWidth}
      minHeight={style.minHeight}
      className="mx-auto justify-start transition-[max-width,min-height] duration-200"
      aria-label="当前时间"
    >
      {clockParts ? (
        <HStack
          gap={style.hstackGap}
          justify="between"
          align="end"
          padding={style.padding}
          data-density={density}
          className="home-clock-halo w-full flex-wrap"
        >
          <time className="home-clock-time" title={timeZoneTitle}>
            {formatClockTime(clockParts)}
          </time>
          <span className="home-clock-meta" title={timeZoneTitle}>
            {formatClockDate(clockParts)} · {getClockGreeting(clockParts)}
          </span>
        </HStack>
      ) : (
        <span className="sr-only">正在获取当前时间</span>
      )}
    </VStack>
  );
}
