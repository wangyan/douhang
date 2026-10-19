import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const UPLOAD_ROOT = join(process.cwd(), 'data', 'uploads', 'icons', 'library');

const SUPPORTED_EXTENSIONS = new Set([
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
]);

/**
 * 自定义图标库 API
 *
 * GET /api/icons/custom
 *
 * 读取 data/uploads/icons/library/ 目录下的自定义图标文件（排除系统内置图标与抓取的缓存图标）
 */
export const GET = withAuth(async (_session, _req) => {
  if (!existsSync(UPLOAD_ROOT)) {
    return NextResponse.json({ items: [] });
  }

  const files = await readdir(UPLOAD_ROOT);
  const items = await Promise.all(
    files
      .filter((file) => {
        const ext = extname(file).toLowerCase();
        return SUPPORTED_EXTENSIONS.has(ext);
      })
      .map(async (file) => {
        const filePath = join(UPLOAD_ROOT, file);
        const ext = extname(file);
        const baseName = file.slice(0, -ext.length) || file;
        try {
          const s = await stat(filePath);
          if (!s.isFile()) return null;
          return {
            name: file,
            label: baseName,
            path: `library/${file}`,
            url: `/api/icons/file?path=library/${file}`,
            size: s.size,
            mtime: s.mtime.toISOString(),
          };
        } catch {
          return null;
        }
      }),
  );

  const validItems = items.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );

  // 按修改时间倒序排列（最新上传优先展示）
  validItems.sort((a, b) => {
    const timeA = a.mtime ? new Date(a.mtime).getTime() : 0;
    const timeB = b.mtime ? new Date(b.mtime).getTime() : 0;
    return timeB - timeA;
  });

  return NextResponse.json({ items: validItems });
});
