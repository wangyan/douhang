'use client';

import { useEffect, useRef, useState } from 'react';
import { CARD_DENSITY_EVENT } from '@/components/layout/card-view-events';
import { detectAutoDensity, resolveConcreteDensity } from '@/lib/density';
import type { CardDensity, ConcreteCardDensity } from '@/types';

/**
 * 原生响应式界面密度 Hook
 *
 * 功能：
 * - 解析 auto 自动模式：<=1080p 紧凑，2K 标准，4K 宽松
 * - 响应用户手动设置（CARD_DENSITY_EVENT）
 * - 在 auto 模式下监听窗口与显示器分辨率变动（原生 resize 事件），平滑跨档切换
 *
 * 0 依赖，仅使用 React 原生状态与 DOM Web API。
 */
export function useEffectiveDensity(
  initialPreference: CardDensity = 'auto',
): ConcreteCardDensity {
  const currentPrefRef = useRef<CardDensity>(initialPreference);
  const [effectiveDensity, setEffectiveDensity] = useState<ConcreteCardDensity>(
    () => (initialPreference === 'auto' ? 'normal' : initialPreference),
  );

  useEffect(() => {
    currentPrefRef.current = initialPreference;
    setEffectiveDensity(resolveConcreteDensity(initialPreference));
  }, [initialPreference]);

  useEffect(() => {
    // 挂载时立即执行一次客户端分辨率判定
    setEffectiveDensity(resolveConcreteDensity(currentPrefRef.current));

    // 监听外观面板的切档事件
    const handleDensityChange = (e: Event) => {
      const detail = (e as CustomEvent<CardDensity>).detail;
      if (detail) {
        currentPrefRef.current = detail;
        setEffectiveDensity(resolveConcreteDensity(detail));
      }
    };
    window.addEventListener(CARD_DENSITY_EVENT, handleDensityChange);

    // 监听原生窗口调整 / 跨屏拖拽，自动模式下动态自适应
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (currentPrefRef.current !== 'auto') return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const next = detectAutoDensity();
        setEffectiveDensity((prev) => (prev !== next ? next : prev));
      }, 100);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener(CARD_DENSITY_EVENT, handleDensityChange);
      window.removeEventListener('resize', handleResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, []);

  return effectiveDensity;
}
