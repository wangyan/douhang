/**
 * 拦截上游 @astryxdesign/core ContextMenu 将 useLongPress 命令式 API（moveTo / start / cancel）
 * 透传至原生 DOM 容器（div/span）在 React 19 开发模式下产生的已知误报日志。
 *
 * 仅在开发环境生效，生产环境直接跳过，零性能开销。
 */
function patchReactUnknownPropWarning(): () => void {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return () => {};
  }

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    // 检查是否包含上游 ContextMenu 泄漏的 3 个已知方法（moveTo / start / cancel）
    const isLeakedLongPressMethod = args.some(
      (arg) =>
        typeof arg === 'string' &&
        (arg.includes('moveTo') ||
          arg.includes('start') ||
          arg.includes('cancel')),
    );

    // 检查是否为 React 的原生 DOM 属性校验错误（未知属性 或 非法值类型）
    const isReactDomPropWarning = args.some(
      (arg) =>
        typeof arg === 'string' &&
        (arg.includes('React does not recognize') ||
          arg.includes('Invalid values for props')),
    );

    if (isLeakedLongPressMethod && isReactDomPropWarning) {
      return;
    }

    originalConsoleError.apply(console, args);
  };

  return () => {
    console.error = originalConsoleError;
  };
}

/**
 * Astryx BottomSheet 在长按过程中打开后，touchend 仍会派发到原触发元素。
 * 浏览器随后合成的 click 会让 Sheet 立即关闭，表现为“长按菜单打不开”。
 * 这里只拦截“菜单已打开、但松手点仍在 Sheet 外”的这一种手势。
 */
export function installContextMenuTouchGuard(
  doc: Document = window.document,
): () => void {
  const uninstallConsolePatch = patchReactUnknownPropWarning();

  const handleTouchEnd = (event: TouchEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;

    const sheet = Array.from(
      doc.querySelectorAll<HTMLDialogElement>('dialog[open]'),
    ).find((dialog) => dialog.querySelector('.astryx-context-menu'));
    if (sheet && !sheet.contains(target)) {
      event.preventDefault();
    }
  };

  doc.addEventListener('touchend', handleTouchEnd, {
    capture: true,
    passive: false,
  });
  return () => {
    doc.removeEventListener('touchend', handleTouchEnd, { capture: true });
    uninstallConsolePatch();
  };
}
