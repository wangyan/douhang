'use client';

import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useState } from 'react';
import { useEffectiveDensity } from '@/hooks/useEffectiveDensity';
import { formatClockDate, formatClockTime, getClockGreeting } from '@/lib/time';
import type { CardDensity } from '@/types';

interface HomeClockProps {
  density?: CardDensity;
}

/**
 * 首屏安静时钟。
 *
 * 不加装饰线或图形，只靠点阵大时间、次级信息、椭圆柔光和左右留白建立层级。
 * 响应全局显示密度：紧凑 (compact) 时小巧精致，标准 (normal) 适中，宽松 (cozy) 醒目大气。
 */
export function HomeClock({
  density: initialDensity = 'auto',
}: HomeClockProps) {
  const [now, setNow] = useState<Date | null>(null);
  const density = useEffectiveDensity(initialDensity);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const maxWidth = density === 'compact' ? 540 : density === 'cozy' ? 720 : 640;
  const minHeight = density === 'compact' ? 54 : density === 'cozy' ? 88 : 76;
  const gap = density === 'compact' ? 1 : 2;
  const padding = density === 'compact' ? 1 : density === 'cozy' ? 3 : 2;

  return (
    <VStack
      gap={gap}
      width="100%"
      maxWidth={maxWidth}
      minHeight={minHeight}
      className="mx-auto justify-start transition-[max-width,min-height] duration-200"
      aria-label="当前时间"
    >
      {now ? (
        <HStack
          gap={density === 'compact' ? 2 : 4}
          justify="between"
          align="end"
          padding={padding}
          data-density={density}
          className="home-clock-halo w-full flex-wrap"
        >
          <time className="home-clock-time">{formatClockTime(now)}</time>
          <span className="home-clock-meta">
            {formatClockDate(now)} · {getClockGreeting(now)}
          </span>
        </HStack>
      ) : (
        <span className="sr-only">正在获取当前时间</span>
      )}
    </VStack>
  );
}
