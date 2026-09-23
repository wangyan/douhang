import { NextResponse } from 'next/server';
import { validateBody, withAuth } from '@/lib/api';
import { prisma } from '@/lib/db';
import { cardBatchDeleteSchema } from '@/lib/validation';

/**
 * 卡片批量删除 API
 * - POST: 按 ids 批量删除（body: { ids: string[] }）
 */
export const POST = withAuth(async (_session, req) => {
  const body = await req.json();
  const parsed = validateBody(cardBatchDeleteSchema, body);
  if (!parsed.ok) return parsed.response;
  const { ids } = parsed.data;

  const cards = await prisma.card.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (cards.length === 0) {
    return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
  }

  await prisma.card.deleteMany({
    where: { id: { in: cards.map((c) => c.id) } },
  });

  return NextResponse.json({ success: true, deleted: cards.length });
});
