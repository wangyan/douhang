import { NextResponse } from 'next/server';
import { validateBody, withAuth } from '@/lib/api';
import { prisma } from '@/lib/db';
import { cardUpdateSchema } from '@/lib/validation';

/**
 * 单卡片 API
 * - GET: 详情
 * - PATCH: 更新
 * - DELETE: 删除
 */
export const GET = withAuth(async (_session, _req, ctx) => {
  const { id } = await ctx.params;
  const card = await prisma.card.findUnique({
    where: { id },
    include: { category: true },
  });

  if (!card) {
    return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
  }

  return NextResponse.json(card);
});

export const PATCH = withAuth(async (_session, req, ctx) => {
  const [{ id }, body] = await Promise.all([ctx.params, req.json()]);
  const parsed = validateBody(cardUpdateSchema, body);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;

  const existing = await prisma.card.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
  }

  // 校验分类存在（如果传了非空 categoryId）
  if (data.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) {
      return NextResponse.json(
        {
          error: '分类不存在',
          fieldErrors: { categoryId: ['分类不存在'] },
        },
        { status: 400 },
      );
    }
  }

  // 内外网互为回退（同 POST）：body 未传字段沿用库中值，空串取另一侧地址；
  // 两侧终值皆空返回 400，保持「至少一个非空」不变量
  let urlData: { internalUrl: string; externalUrl: string } | undefined;
  if (data.internalUrl !== undefined || data.externalUrl !== undefined) {
    const nextInternal = data.internalUrl ?? existing.internalUrl;
    const nextExternal = data.externalUrl ?? existing.externalUrl;
    const internalUrl = nextInternal || nextExternal;
    const externalUrl = nextExternal || nextInternal;
    if (!internalUrl && !externalUrl) {
      return NextResponse.json(
        { error: '内网与外网地址至少填写一个' },
        { status: 400 },
      );
    }
    urlData = { internalUrl, externalUrl };
  }

  const card = await prisma.card.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...urlData,
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.description !== undefined && {
        description: data.description || null,
      }),
      ...(data.categoryId !== undefined && {
        categoryId: data.categoryId || null,
      }),
      ...(data.openInDialog !== undefined && {
        openInDialog: data.openInDialog,
      }),
    },
    include: { category: true },
  });

  return NextResponse.json(card);
});

export const DELETE = withAuth(async (_session, _req, ctx) => {
  const { id } = await ctx.params;

  const card = await prisma.card.findUnique({ where: { id } });
  if (!card) {
    return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
  }

  await prisma.card.delete({ where: { id } });

  return NextResponse.json({ success: true });
});
