import { NextResponse } from 'next/server';
import { validateBody, withAuth } from '@/lib/api';
import { prisma } from '@/lib/db';
import { cardReorderSchema } from '@/lib/validation';

/**
 * 卡片重排 API
 * - PATCH: 批量更新 order + categoryId（拖拽重排 + 跨分类拖拽）
 *
 * 请求体：{ items: CardReorderItem[] }
 * 响应：{ success: true }
 */
export const PATCH = withAuth(async (_session, req) => {
  const body = await req.json();
  const parsed = validateBody(cardReorderSchema, body);
  if (!parsed.ok) return parsed.response;
  const { items } = parsed.data;

  // 事务前校验：所有卡片必须存在
  const cardIds = [...new Set(items.map((item) => item.id))];
  const foundCards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: { id: true },
  });
  if (foundCards.length !== cardIds.length) {
    return NextResponse.json({ error: '卡片不存在' }, { status: 400 });
  }

  // 事务前校验：非空 categoryId 必须指向已有分类
  const categoryIds = [
    ...new Set(
      items
        .map((item) => item.categoryId)
        .filter((categoryId): categoryId is string => !!categoryId),
    ),
  ];
  if (categoryIds.length > 0) {
    const foundCategories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true },
    });
    if (foundCategories.length !== categoryIds.length) {
      return NextResponse.json({ error: '分类不存在' }, { status: 400 });
    }
  }

  // 用事务批量更新（categoryId 空串归一为 null，与卡片创建一致）
  await prisma.$transaction(
    items.map((item) =>
      prisma.card.update({
        where: { id: item.id },
        data: {
          order: item.order,
          categoryId: item.categoryId || null,
        },
      }),
    ),
  );

  return NextResponse.json({ success: true });
});
