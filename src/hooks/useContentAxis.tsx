'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  computeContentAxisCols,
  computeContentAxisWidth,
} from '@/lib/content-axis';
import type { ConcreteCardDensity } from '@/types';

/**
 * 首屏内容轴列数
 *
 * 卡片区是「单分区最大卡片数」的唯一来源（分类内增删卡片后即时变化），
 * 因此由卡片区上报、其余区块读取：widget 栏据此与卡片网格共用同一宽度。
 */
const ContentAxisMaxCardsContext = createContext<number | null>(null);
const ContentAxisPublishContext = createContext<(maxCards: number) => void>(
  () => {},
);

interface ContentAxisColumnsProviderProps {
  /**
   * 首帧使用的单分区最大卡片数
   *
   * 由服务端按当前数据算出并传入，使首屏渲染的宽度与客户端一致，
   * 避免挂载后再变化引起一次宽度跳变。
   */
  initialMaxCards?: number;
  children: ReactNode;
}

/** 首屏内容轴上下文：为卡片网格与 widget 栏提供共同的列数依据 */
export function ContentAxisColumnsProvider({
  initialMaxCards = 0,
  children,
}: ContentAxisColumnsProviderProps) {
  const [maxCards, setMaxCards] = useState(initialMaxCards);

  const publish = useCallback((next: number) => {
    setMaxCards((previous) => (previous === next ? previous : next));
  }, []);

  return (
    <ContentAxisPublishContext.Provider value={publish}>
      <ContentAxisMaxCardsContext.Provider value={maxCards}>
        {children}
      </ContentAxisMaxCardsContext.Provider>
    </ContentAxisPublishContext.Provider>
  );
}

/** 卡片区上报单分区最大卡片数 */
export function usePublishContentAxisMaxCards(maxCards: number) {
  const publish = useContext(ContentAxisPublishContext);

  useEffect(() => {
    publish(maxCards);
  }, [publish, maxCards]);
}

/** 容器实测宽度（跟随窗口拖拉与布局变化） */
function useContainerWidth() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = el.getBoundingClientRect().width;
      if (next > 0) setWidth(next);
    };

    updateWidth();

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(next);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { containerRef, availableWidth: width };
}

/**
 * 首屏内容轴宽度
 *
 * 用法：把返回的 containerRef 挂在区块最外层容器上，并把 width 作为
 * 内层居中容器的 maxWidth。卡片网格与 widget 栏调用本 hook 后自动获得
 * 同一条内容轴，无需互相传递尺寸。
 *
 * 未接入 ContentAxisColumnsProvider 时按单分区最大卡片数为 0 处理，
 * 宽度回落到最小列数，布局仍然可用。
 */
export function useContentAxisWidth(density: ConcreteCardDensity) {
  const maxCards = useContext(ContentAxisMaxCardsContext) ?? 0;
  const { containerRef, availableWidth } = useContainerWidth();

  const cols = useMemo(
    () => computeContentAxisCols({ density, maxCards, availableWidth }),
    [density, maxCards, availableWidth],
  );

  const width = useMemo(
    () => computeContentAxisWidth(cols, density),
    [cols, density],
  );

  return { containerRef, width };
}
