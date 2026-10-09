import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const UPLOAD_ROOT = join(process.cwd(), 'data', 'uploads', 'icons');

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

/**
 * 图标文件读取 API
 *
 * GET /api/icons/file?path=cards/abc-123.png
 *
 * 从 data/uploads/icons/{scope}/{filename} 读取并返回图片
 * 作用域包含 cards、library、brand，均公开可读（支持未登录访问首页卡片与品牌 Logo）
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const relativePath = searchParams.get('path');

  if (!relativePath) {
    return NextResponse.json({ error: '缺少 path 参数' }, { status: 400 });
  }

  // 路径校验：仅允许 cards/xxx、library/xxx 或 brand/xxx
  const normalized = normalize(relativePath).replace(/\\/g, '/');
  const parts = normalized.split('/');

  if (parts.length !== 2 || !['cards', 'library', 'brand'].includes(parts[0])) {
    return NextResponse.json({ error: '无效的路径' }, { status: 400 });
  }

  // 校验绝对路径位于 UPLOAD_ROOT 内
  const fullPath = join(UPLOAD_ROOT, parts[0], parts[1]);
  const normalizedFull = normalize(fullPath);
  if (!normalizedFull.startsWith(normalize(UPLOAD_ROOT) + sep)) {
    return NextResponse.json({ error: '无效的路径' }, { status: 400 });
  }

  if (!existsSync(normalizedFull)) {
    return NextResponse.json({ error: '文件不存在' }, { status: 404 });
  }

  const buffer = await readFile(normalizedFull);
  const ext = `.${parts[1].split('.').pop()?.toLowerCase()}`;
  const mime = MIME_MAP[ext] ?? 'application/octet-stream';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
