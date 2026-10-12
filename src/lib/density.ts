import type { CardDensity, ConcreteCardDensity } from '@/types';

/**
 * 原生检测当前屏幕分辨率与视口尺寸，自适应匹配密度：
 * - 4K 屏（宽 >= 3440 或 高 >= 2000，或视口宽 >= 3000 / 高 >= 1800）：cozy（宽松）
 * - <= 1920*1080（屏幕分辨率或视口尺寸 <= 1920 且 <= 1080）：compact（紧凑）
 * - 其余（如 2560*1440 2K 屏）：normal（标准）
 *
 * 纯原生 Web API，不依赖任何第三方库。
 */
export function detectAutoDensity(): ConcreteCardDensity {
  if (typeof window === 'undefined') return 'normal';

  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight;

  // 4K 屏或超高分辨率（如 3840×2160，3440×1440 带鱼屏超宽视口，或超高像素大屏）
  const is4K =
    screenWidth >= 3440 ||
    screenHeight >= 2000 ||
    viewWidth >= 3000 ||
    viewHeight >= 1800;

  if (is4K) {
    return 'cozy';
  }

  // <= 1920*1080 屏幕或当前视口尺寸
  const isSmallScreen =
    (screenWidth <= 1920 && screenHeight <= 1080) ||
    (viewWidth <= 1920 && viewHeight <= 1080);

  if (isSmallScreen) {
    return 'compact';
  }

  return 'normal';
}

/**
 * 解析用户配置的密度为实际生效的物理渲染密度
 */
export function resolveConcreteDensity(
  preference?: CardDensity | null,
): ConcreteCardDensity {
  if (!preference || preference === 'auto') {
    return detectAutoDensity();
  }
  return preference;
}
