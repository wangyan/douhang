import { NextResponse } from 'next/server';
import { validateBody, withAuth } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getUserPreference, setUserPreference } from '@/lib/preferences';
import { toEngineConfig } from '@/lib/search-engines';
import { searchEngineUpdateSchema } from '@/lib/validation';

/**
 * 单个搜索引擎 API
 * - PATCH: 编辑名称 / URL / 图标
 * - DELETE: 删除（至少保留一个）；删除当前默认引擎时回退到排序第一个
 */
export const PATCH = withAuth(async (_session, req, ctx) => {
  const [{ id }, body] = await Promise.all([ctx.params, req.json()]);
  const parsed = validateBody(searchEngineUpdateSchema, body);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;

  const existing = await prisma.searchEngine.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '搜索引擎不存在' }, { status: 404 });
  }

  const row = await prisma.searchEngine.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.urlTemplate !== undefined && { urlTemplate: data.urlTemplate }),
      ...(data.iconPath !== undefined && { iconPath: data.iconPath }),
      ...(data.order !== undefined && { order: data.order }),
    },
  });

  return NextResponse.json(toEngineConfig(row));
});

export const DELETE = withAuth(async (_session, _req, ctx) => {
  const [{ id }, count] = await Promise.all([
    ctx.params,
    prisma.searchEngine.count(),
  ]);
  const existing = await prisma.searchEngine.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '搜索引擎不存在' }, { status: 404 });
  }
  if (count <= 1) {
    return NextResponse.json(
      { error: '至少保留一个搜索引擎' },
      { status: 400 },
    );
  }

  await prisma.searchEngine.delete({ where: { id } });

  // 被删引擎若是当前默认引擎，回退到排序第一个
  // 偏好值统一经 preferences 工具读写（JSON 编码），不要直接比对 user_preferences.value
  const currentEngine = await getUserPreference<string | null>(
    'searchEngine',
    null,
  );
  if (currentEngine === id) {
    const first = await prisma.searchEngine.findFirst({
      orderBy: { order: 'asc' },
    });
    if (first) {
      await setUserPreference('searchEngine', first.id);
    }
  }

  return NextResponse.json({ success: true });
});
