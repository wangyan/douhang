import { CARD_DENSITY_CONFIGS, type ConcreteCardDensity } from '@/types';

/**
 * 首屏内容轴
 *
 * 卡片网格与 widget 栏共用同一条宽度轴：列数取自卡片密度档位，宽度由
 * 列数、卡宽与列间距换算，两者左右边界对齐并整体居中。
 */

/** 各密度档位的最小列数（下限，与上方搜索框的视觉重心对齐） */
export const CONTENT_AXIS_MIN_COLS: Record<ConcreteCardDensity, number> = {
  compact: 6,
  normal: 7,
  cozy: 6,
};

/** 各密度档位的最大列数（上限，避免超宽屏下过度铺开） */
export const CONTENT_AXIS_MAX_COLS: Record<ConcreteCardDensity, number> = {
  compact: 13,
  normal: 12,
  cozy: 10,
};

/**
 * 推导内容轴列数
 *
 * - 期望列数：随单分区最大卡片数展开，落在最小列数与最大列数之间
 * - 实际列数：再受容器实测宽度限制，宽度不足时逐级收缩
 */
export function computeContentAxisCols({
  density,
  maxCards,
  availableWidth,
}: {
  density: ConcreteCardDensity;
  maxCards: number;
  availableWidth: number | null;
}): number {
  const { cardWidth, gapPx } = CARD_DENSITY_CONFIGS[density];

  const desiredCols = Math.max(
    CONTENT_AXIS_MIN_COLS[density],
    Math.min(CONTENT_AXIS_MAX_COLS[density], maxCards),
  );

  if (availableWidth === null || availableWidth <= 0) {
    return desiredCols;
  }

  const maxPossibleCols = Math.max(
    1,
    Math.floor((availableWidth + gapPx) / (cardWidth + gapPx)),
  );

  return Math.max(1, Math.min(maxPossibleCols, desiredCols));
}

/** 由列数换算内容轴宽度：各列宽度之和加上列间距 */
export function computeContentAxisWidth(
  cols: number,
  density: ConcreteCardDensity,
): number {
  const { cardWidth, gapPx } = CARD_DENSITY_CONFIGS[density];
  return cols * (cardWidth + gapPx) - gapPx;
}
