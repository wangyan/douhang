export type IconSource =
  | 'empty'
  | 'library'
  | 'customLibrary'
  | 'upload'
  | 'link'
  | 'manual';

const UPLOADED_ICON_PREFIX = 'cards/';
const CUSTOM_LIBRARY_ICON_PREFIX = 'library/';

/**
 * 判断图标值当前代表的使用方式。
 * 上传预览（blob: URL）由调用方在进入上传流程时单独覆盖。
 */
export function getIconSource(value: string | null | undefined): IconSource {
  if (!value?.trim()) return 'empty';
  if (value.startsWith('/icons/')) return 'library';

  const customLibraryPath = getCustomLibraryIconPath(value);
  if (customLibraryPath) return 'customLibrary';

  const uploadedPath = getUploadedIconPath(value);
  if (uploadedPath) return 'upload';

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return 'link';
      }
    } catch {
      // 无效链接仍按自定义文本处理。
    }
  }

  return 'manual';
}

/** 从上传图标路径中提取自定义图标库相对路径，例如 library/uuid.svg。 */
export function getCustomLibraryIconPath(
  value: string | null | undefined,
): string | null {
  let url: URL;
  try {
    url = new URL(value ?? '', 'http://douhang.local');
  } catch {
    return null;
  }

  if (url.pathname !== '/api/icons/file') return null;

  const path = url.searchParams.get('path');
  if (!path?.startsWith(CUSTOM_LIBRARY_ICON_PREFIX)) return null;
  if (path.split('/').length !== 2) return null;

  return path;
}

/** 从上传图标路径中提取服务端相对路径，例如 cards/uuid.png。 */
export function getUploadedIconPath(
  value: string | null | undefined,
): string | null {
  let url: URL;
  try {
    url = new URL(value ?? '', 'http://douhang.local');
  } catch {
    return null;
  }

  if (url.pathname !== '/api/icons/file') return null;

  const path = url.searchParams.get('path');
  if (!path?.startsWith(UPLOADED_ICON_PREFIX)) return null;
  if (path.split('/').length !== 2) return null;

  return path;
}
