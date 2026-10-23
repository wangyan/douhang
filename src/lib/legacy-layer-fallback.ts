/**
 * 业务浮层的触发器锚点定位、视口边界收敛与外部点击收起控制。
 * 按顶层浮层与锚点定位两项能力独立探测并按需启用。
 */

const VIEWPORT_MARGIN = 8;
const POSITION_EPSILON = 0.5;
const LAYER_SELECTOR = '[popover][id]';
const CONTEXT_MENU_SELECTOR = '.astryx-context-menu';
const MATCH_WIDTH_CONTENT_SELECTOR = '[role="listbox"], [role="menu"]';
const CLEARANCE_PROP = '--_astryx-layer-clearance';
const CONTAIN_CB_RE = /\b(paint|layout|content|strict)\b/;
const WILL_CHANGE_CB_SET = new Set([
  'transform',
  'translate',
  'scale',
  'rotate',
  'perspective',
  'filter',
  'backdrop-filter',
  '-webkit-backdrop-filter',
]);

type LayerPlacement = 'above' | 'below' | 'start' | 'end';
type LayerAlignment = 'start' | 'center' | 'end';
type ViewWithGlobals = Window & typeof globalThis;

interface AnchorPlacement {
  placement: LayerPlacement;
  alignment: LayerAlignment;
}

interface ViewportOrigin {
  top: number;
  left: number;
}

function supportsPopoverApi(view: ViewWithGlobals): boolean {
  return typeof view.HTMLElement?.prototype?.showPopover === 'function';
}

function supportsAnchorPositioning(view: ViewWithGlobals): boolean {
  const css = view.CSS;
  return (
    typeof css !== 'undefined' &&
    typeof css.supports === 'function' &&
    css.supports('anchor-name: --astryx-fallback-probe')
  );
}

function isManagedLayer(
  node: unknown,
  view: ViewWithGlobals,
): node is HTMLElement {
  return (
    node instanceof view.HTMLElement &&
    node.hasAttribute('popover') &&
    node.id.length > 0
  );
}

function isAutoDismissLayer(el: HTMLElement): boolean {
  const attr = el.getAttribute('popover')?.trim().toLowerCase();
  return attr === '' || attr === 'auto';
}

function isNativeTopLayerOpen(el: HTMLElement): boolean {
  try {
    return el.matches(':popover-open');
  } catch {
    return false;
  }
}

function isLayerOpen(
  el: HTMLElement,
  view: ViewWithGlobals,
  hasPopoverApi: boolean,
): boolean {
  if (hasPopoverApi) {
    return isNativeTopLayerOpen(el);
  }
  const style = view.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function readStyleProp(el: HTMLElement, key: string): string {
  return (
    (el.style as unknown as Record<string, string | undefined>)[key] ?? ''
  ).trim();
}

function hasAnchorName(el: HTMLElement, anchorId: string): boolean {
  const raw = readStyleProp(el, 'anchorName');
  if (!raw) return false;
  return raw.split(',').some((item) => item.trim() === anchorId);
}

function findLayerAnchor(
  el: HTMLElement,
  cache: Map<string, HTMLElement>,
): HTMLElement | null {
  const anchorId = readStyleProp(el, 'positionAnchor');
  if (!anchorId) return null;

  const cached = cache.get(anchorId);
  if (cached?.isConnected && hasAnchorName(cached, anchorId)) {
    return cached;
  }

  const doc = el.ownerDocument;
  const dialogScope = el.closest('dialog');
  const scopes: ParentNode[] = dialogScope
    ? [dialogScope, doc.body ?? doc]
    : [doc.body ?? doc];

  for (const scope of scopes) {
    const candidates = scope.querySelectorAll<HTMLElement>('*');
    for (const candidate of candidates) {
      if (candidate !== el && hasAnchorName(candidate, anchorId)) {
        cache.set(anchorId, candidate);
        return candidate;
      }
    }
  }

  cache.delete(anchorId);
  return null;
}

function parsePositionArea(raw: string): AnchorPlacement {
  let placement: LayerPlacement = 'below';
  if (raw.includes('self-block-start')) placement = 'above';
  else if (raw.includes('self-block-end')) placement = 'below';
  else if (raw.includes('self-inline-start')) placement = 'start';
  else if (raw.includes('self-inline-end')) placement = 'end';

  let alignment: LayerAlignment = 'center';
  if (
    raw.includes('span-self-inline-end') ||
    raw.includes('span-self-block-end')
  ) {
    alignment = 'start';
  } else if (
    raw.includes('span-self-inline-start') ||
    raw.includes('span-self-block-start')
  ) {
    alignment = 'end';
  }

  return { placement, alignment };
}

function resolveClearancePx(el: HTMLElement, view: ViewWithGlobals): number {
  const raw = el.style.getPropertyValue(CLEARANCE_PROP).trim();
  if (!raw) return 0;

  const varMatch = /^var\((--[a-zA-Z0-9-_]+)/.exec(raw);
  const resolved = varMatch
    ? view.getComputedStyle(el).getPropertyValue(varMatch[1]).trim()
    : raw;
  if (!resolved) return 0;

  if (resolved.endsWith('rem')) {
    const rootFont =
      Number.parseFloat(
        view.getComputedStyle(el.ownerDocument.documentElement).fontSize,
      ) || 16;
    const rem = Number.parseFloat(resolved);
    return Number.isFinite(rem) ? rem * rootFont : 0;
  }

  const px = Number.parseFloat(resolved);
  return Number.isFinite(px) ? px : 0;
}

function establishesFixedContainingBlock(style: CSSStyleDeclaration): boolean {
  if (style.transform && style.transform !== 'none') return true;
  if (style.translate && style.translate !== 'none') return true;
  if (style.scale && style.scale !== 'none') return true;
  if (style.rotate && style.rotate !== 'none') return true;
  if (style.perspective && style.perspective !== 'none') return true;
  if (style.filter && style.filter !== 'none') return true;
  const backdrop =
    style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter');
  if (backdrop && backdrop !== 'none') return true;
  if (style.containerType && style.containerType !== 'normal') return true;
  if (style.contain && CONTAIN_CB_RE.test(style.contain)) return true;
  if (style.willChange && style.willChange !== 'auto') {
    const tokens = style.willChange.split(',');
    if (tokens.some((token) => WILL_CHANGE_CB_SET.has(token.trim()))) {
      return true;
    }
  }
  return false;
}

function findFixedContainingBlock(
  start: HTMLElement | null,
  view: ViewWithGlobals,
): HTMLElement | null {
  const docEl = start?.ownerDocument.documentElement ?? null;
  let node = start;
  while (node && node !== docEl) {
    if (establishesFixedContainingBlock(view.getComputedStyle(node))) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function clampToViewport(
  origin: ViewportOrigin,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): ViewportOrigin {
  const maxTop = Math.max(
    VIEWPORT_MARGIN,
    viewportHeight - height - VIEWPORT_MARGIN,
  );
  const maxLeft = Math.max(
    VIEWPORT_MARGIN,
    viewportWidth - width - VIEWPORT_MARGIN,
  );
  return {
    top: Math.min(Math.max(origin.top, VIEWPORT_MARGIN), maxTop),
    left: Math.min(Math.max(origin.left, VIEWPORT_MARGIN), maxLeft),
  };
}

function computeAnchoredOrigin(
  anchorRect: DOMRect,
  width: number,
  height: number,
  marginTop: number,
  marginLeft: number,
  gap: number,
  isRtl: boolean,
  area: AnchorPlacement,
  viewportWidth: number,
  viewportHeight: number,
): ViewportOrigin {
  const { placement, alignment } = area;

  if (placement === 'above' || placement === 'below') {
    const belowTop = anchorRect.bottom + gap + marginTop;
    const aboveTop = anchorRect.top - gap - height + marginTop;
    let top = placement === 'below' ? belowTop : aboveTop;

    // 保留显式行内负边距（如选中项对齐触发器），仅在常规零边距模式下翻转方向
    if (marginTop === 0) {
      if (
        placement === 'below' &&
        belowTop + height > viewportHeight - VIEWPORT_MARGIN &&
        (aboveTop >= VIEWPORT_MARGIN ||
          anchorRect.top > viewportHeight - anchorRect.bottom)
      ) {
        top = aboveTop;
      } else if (
        placement === 'above' &&
        aboveTop < VIEWPORT_MARGIN &&
        (belowTop + height <= viewportHeight - VIEWPORT_MARGIN ||
          viewportHeight - anchorRect.bottom > anchorRect.top)
      ) {
        top = belowTop;
      }
    }

    const alignStart =
      (alignment === 'start' && !isRtl) || (alignment === 'end' && isRtl);
    const alignEnd =
      (alignment === 'end' && !isRtl) || (alignment === 'start' && isRtl);
    let left = anchorRect.left + (anchorRect.width - width) / 2 + marginLeft;
    if (alignStart) left = anchorRect.left + marginLeft;
    else if (alignEnd) left = anchorRect.right - width + marginLeft;

    return clampToViewport(
      { top, left },
      width,
      height,
      viewportWidth,
      viewportHeight,
    );
  }

  const placeLeft =
    (placement === 'start' && !isRtl) || (placement === 'end' && isRtl);
  const leftSide = anchorRect.left - gap - width + marginLeft;
  const rightSide = anchorRect.right + gap + marginLeft;
  let left = placeLeft ? leftSide : rightSide;

  if (
    placeLeft &&
    leftSide < VIEWPORT_MARGIN &&
    (rightSide + width <= viewportWidth - VIEWPORT_MARGIN ||
      viewportWidth - anchorRect.right > anchorRect.left)
  ) {
    left = rightSide;
  } else if (
    !placeLeft &&
    rightSide + width > viewportWidth - VIEWPORT_MARGIN &&
    (leftSide >= VIEWPORT_MARGIN ||
      anchorRect.left > viewportWidth - anchorRect.right)
  ) {
    left = leftSide;
  }

  let top = anchorRect.top + (anchorRect.height - height) / 2 + marginTop;
  if (alignment === 'start') top = anchorRect.top + marginTop;
  else if (alignment === 'end') top = anchorRect.bottom - height + marginTop;

  return clampToViewport(
    { top, left },
    width,
    height,
    viewportWidth,
    viewportHeight,
  );
}

function hasUsableRect(rect: DOMRect): boolean {
  return rect.width > 0 || rect.height > 0 || rect.top !== 0 || rect.left !== 0;
}

function installAutoLightDismiss(
  doc: Document,
  view: ViewWithGlobals,
  anchorCache: Map<string, HTMLElement>,
): () => void {
  const openAtPressStart = new Set<HTMLElement>();
  let pressStartTarget: Node | null = null;

  const isWithinLayerTree = (
    layer: HTMLElement,
    target: Node | null,
    openLayers: HTMLElement[],
  ): boolean => {
    if (!target) return false;
    if (layer.contains(target)) return true;

    const targetEl =
      target instanceof view.Element ? target : target.parentElement;
    const invoker = targetEl?.closest('[popovertarget]');
    if (invoker?.getAttribute('popovertarget') === layer.id) {
      return true;
    }

    for (const candidate of openLayers) {
      if (candidate === layer || !candidate.contains(target)) continue;
      const visited = new Set<HTMLElement>([candidate]);
      let current: HTMLElement | null = candidate;
      while (current) {
        const anchor = findLayerAnchor(current, anchorCache);
        if (!anchor) break;
        if (layer.contains(anchor)) return true;
        const parentLayer = openLayers.find(
          (item) => !visited.has(item) && item.contains(anchor),
        );
        if (!parentLayer) break;
        visited.add(parentLayer);
        current = parentLayer;
      }
    }

    return false;
  };

  const handlePointerDown = (event: PointerEvent) => {
    pressStartTarget = event.target instanceof view.Node ? event.target : null;
    openAtPressStart.clear();
    doc.querySelectorAll<HTMLElement>(LAYER_SELECTOR).forEach((el) => {
      if (isAutoDismissLayer(el) && isLayerOpen(el, view, false)) {
        openAtPressStart.add(el);
      }
    });
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (openAtPressStart.size === 0) {
      pressStartTarget = null;
      return;
    }

    const openLayers = Array.from(
      doc.querySelectorAll<HTMLElement>(LAYER_SELECTOR),
    ).filter((el) => isLayerOpen(el, view, false));
    const releaseTarget =
      event.target instanceof view.Node ? event.target : null;

    for (let i = openLayers.length - 1; i >= 0; i -= 1) {
      const layer = openLayers[i];
      if (!openAtPressStart.has(layer) || !isAutoDismissLayer(layer)) continue;
      if (
        isWithinLayerTree(layer, pressStartTarget, openLayers) ||
        isWithinLayerTree(layer, releaseTarget, openLayers)
      ) {
        continue;
      }

      layer.style.display = 'none';
      const toggleEvent =
        typeof view.ToggleEvent === 'function'
          ? new view.ToggleEvent('toggle', {
              oldState: 'open',
              newState: 'closed',
            })
          : Object.assign(new view.Event('toggle'), {
              oldState: 'open',
              newState: 'closed',
            });
      layer.dispatchEvent(toggleEvent);
    }

    openAtPressStart.clear();
    pressStartTarget = null;
  };

  const handlePointerCancel = () => {
    openAtPressStart.clear();
    pressStartTarget = null;
  };

  doc.addEventListener('pointerdown', handlePointerDown, true);
  doc.addEventListener('pointerup', handlePointerUp);
  doc.addEventListener('pointercancel', handlePointerCancel, true);

  return () => {
    doc.removeEventListener('pointerdown', handlePointerDown, true);
    doc.removeEventListener('pointerup', handlePointerUp);
    doc.removeEventListener('pointercancel', handlePointerCancel, true);
    openAtPressStart.clear();
    pressStartTarget = null;
  };
}

/** 按需启用浮层定位与交互兜底；原生能力齐备时返回 undefined */
export function installLegacyLayerFallback(
  doc: Document = window.document,
): (() => void) | undefined {
  const view = doc.defaultView as ViewWithGlobals | null;
  if (!view) return undefined;

  const hasPopoverApi = supportsPopoverApi(view);
  const hasAnchorPositioning = supportsAnchorPositioning(view);
  if (hasPopoverApi && hasAnchorPositioning) {
    return undefined;
  }

  const anchorCache = new Map<string, HTMLElement>();
  const uninstallLightDismiss = hasPopoverApi
    ? undefined
    : installAutoLightDismiss(doc, view, anchorCache);

  if (hasAnchorPositioning) {
    return uninstallLightDismiss;
  }

  const positionedLayers = new WeakSet<HTMLElement>();
  const matchedMinWidthLayers = new WeakSet<HTMLElement>();
  const selfMutated = new Set<HTMLElement>();
  const openLayers = new Set<HTMLElement>();
  const pending = new Set<HTMLElement>();
  let clearSelfMutatedQueued = false;
  let frame = 0;

  const markSelfMutated = (el: HTMLElement) => {
    selfMutated.add(el);
    if (!clearSelfMutatedQueued) {
      clearSelfMutatedQueued = true;
      queueMicrotask(() => {
        clearSelfMutatedQueued = false;
        selfMutated.clear();
      });
    }
  };

  const resizeObserver =
    typeof view.ResizeObserver === 'function'
      ? new view.ResizeObserver((entries) => {
          for (const entry of entries) {
            if (isManagedLayer(entry.target, view)) {
              pending.add(entry.target);
            }
          }
          if (pending.size > 0) schedule();
        })
      : null;

  const untrackClosedLayer = (el: HTMLElement) => {
    if (openLayers.delete(el)) {
      resizeObserver?.unobserve(el);
    }
    let mutated = false;
    if (positionedLayers.has(el)) {
      positionedLayers.delete(el);
      if (readStyleProp(el, 'positionAnchor')) {
        el.style.top = '';
        el.style.left = '';
        el.style.right = '';
        el.style.bottom = '';
        mutated = true;
      }
    }
    if (matchedMinWidthLayers.has(el)) {
      matchedMinWidthLayers.delete(el);
      el.style.minWidth = '';
      mutated = true;
    }
    if (mutated) markSelfMutated(el);
  };

  const syncLayer = (el: HTMLElement) => {
    if (!el.isConnected) {
      untrackClosedLayer(el);
      return;
    }

    if (!isLayerOpen(el, view, hasPopoverApi)) {
      untrackClosedLayer(el);
      return;
    }

    // 右键菜单由独立光标定位模块接管，避免覆盖其坐标
    if (el.querySelector(CONTEXT_MENU_SELECTOR)) return;

    const style = view.getComputedStyle(el);
    if (style.position !== 'fixed') return;

    if (!openLayers.has(el)) {
      openLayers.add(el);
      resizeObserver?.observe(el);
    }

    const anchor = findLayerAnchor(el, anchorCache);
    const anchorRect = anchor?.getBoundingClientRect() ?? null;
    const canAnchor = anchorRect !== null && hasUsableRect(anchorRect);

    if (
      canAnchor &&
      anchorRect.width > 0 &&
      (matchedMinWidthLayers.has(el) ||
        ((Number.parseFloat(style.minWidth) || 0) === 0 &&
          el.querySelector(MATCH_WIDTH_CONTENT_SELECTOR) !== null))
    ) {
      const targetMinWidth = Math.round(
        Math.min(anchorRect.width, view.innerWidth - VIEWPORT_MARGIN * 2),
      );
      const nextMinWidth = `${targetMinWidth}px`;
      if (el.style.minWidth !== nextMinWidth) {
        matchedMinWidthLayers.add(el);
        el.style.minWidth = nextMinWidth;
        markSelfMutated(el);
      }
    }

    const rect = el.getBoundingClientRect();
    // 采用布局尺寸计算坐标，避免入场缩放动画影响首帧对齐位置
    const width = el.offsetWidth || rect.width;
    const height = el.offsetHeight || rect.height;
    if (width <= 0 || height <= 0) return;

    const marginTop = Number.parseFloat(style.marginTop) || 0;
    const marginLeft = Number.parseFloat(style.marginLeft) || 0;

    const targetOrigin = canAnchor
      ? computeAnchoredOrigin(
          anchorRect,
          width,
          height,
          marginTop,
          marginLeft,
          resolveClearancePx(el, view),
          style.direction === 'rtl',
          parsePositionArea(readStyleProp(el, 'positionArea')),
          view.innerWidth,
          view.innerHeight,
        )
      : clampToViewport(
          { top: rect.top, left: rect.left },
          width,
          height,
          view.innerWidth,
          view.innerHeight,
        );

    // 原生顶层浮层直属初始包含块；非顶层 fixed 浮层需扣除包含块内边距原点偏移
    const containingBlock = isNativeTopLayerOpen(el)
      ? null
      : findFixedContainingBlock(el.parentElement, view);
    let cbTop = 0;
    let cbLeft = 0;
    if (containingBlock) {
      const cbRect = containingBlock.getBoundingClientRect();
      cbTop = cbRect.top + (containingBlock.clientTop || 0);
      cbLeft = cbRect.left + (containingBlock.clientLeft || 0);
    }

    const nextTop = targetOrigin.top - cbTop - marginTop;
    const nextLeft = targetOrigin.left - cbLeft - marginLeft;
    const currentTop = Number.parseFloat(el.style.top);
    const currentLeft = Number.parseFloat(el.style.left);

    if (
      Number.isFinite(currentTop) &&
      Number.isFinite(currentLeft) &&
      Math.abs(currentTop - nextTop) < POSITION_EPSILON &&
      Math.abs(currentLeft - nextLeft) < POSITION_EPSILON &&
      el.style.right === 'auto' &&
      el.style.bottom === 'auto'
    ) {
      return;
    }

    positionedLayers.add(el);
    el.style.top = `${nextTop}px`;
    el.style.left = `${nextLeft}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    markSelfMutated(el);
  };

  const flush = () => {
    frame = 0;
    const batch = Array.from(pending);
    pending.clear();
    for (const el of batch) {
      syncLayer(el);
    }
  };

  const schedule = () => {
    if (!frame) frame = view.requestAnimationFrame(flush);
  };

  const enqueueAll = () => {
    doc.querySelectorAll<HTMLElement>(LAYER_SELECTOR).forEach((el) => {
      pending.add(el);
    });
    if (pending.size > 0) schedule();
  };

  const enqueueOpen = () => {
    for (const el of openLayers) {
      pending.add(el);
    }
    if (pending.size > 0) schedule();
  };

  const handleToggleCapture = (event: Event) => {
    if (isManagedLayer(event.target, view)) {
      pending.add(event.target);
      schedule();
    }
  };

  const observer = new view.MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (
          isManagedLayer(record.target, view) &&
          !selfMutated.has(record.target)
        ) {
          pending.add(record.target);
        }
        continue;
      }
      for (const added of record.addedNodes) {
        if (!(added instanceof view.HTMLElement)) continue;
        if (isManagedLayer(added, view)) {
          pending.add(added);
        }
        added.querySelectorAll<HTMLElement>(LAYER_SELECTOR).forEach((el) => {
          pending.add(el);
        });
      }
      for (const removed of record.removedNodes) {
        if (!(removed instanceof view.HTMLElement)) continue;
        if (isManagedLayer(removed, view)) {
          untrackClosedLayer(removed);
        }
        for (const tracked of Array.from(openLayers)) {
          if (!tracked.isConnected) untrackClosedLayer(tracked);
        }
      }
    }
    if (pending.size > 0) schedule();
  });

  if (doc.body) {
    observer.observe(doc.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style'],
    });
  }
  doc.addEventListener('beforetoggle', handleToggleCapture, true);
  doc.addEventListener('toggle', handleToggleCapture, true);
  doc.addEventListener('scroll', enqueueOpen, {
    capture: true,
    passive: true,
  });
  view.addEventListener('resize', enqueueAll);
  enqueueAll();

  return () => {
    uninstallLightDismiss?.();
    observer.disconnect();
    resizeObserver?.disconnect();
    doc.removeEventListener('beforetoggle', handleToggleCapture, true);
    doc.removeEventListener('toggle', handleToggleCapture, true);
    doc.removeEventListener('scroll', enqueueOpen, true);
    view.removeEventListener('resize', enqueueAll);
    if (frame) view.cancelAnimationFrame(frame);
    openLayers.clear();
    pending.clear();
    selfMutated.clear();
    anchorCache.clear();
  };
}
