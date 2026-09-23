import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { validateBody, withAuth } from '@/lib/api';
import { prisma } from '@/lib/db';
import { accountUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * 账号 API
 *
 * - GET: 读取当前账号信息（仅用户名，不含密码）
 * - PATCH: 更新账号（用户名和/或密码）
 *   body: { username?: string, currentPassword?: string, newPassword?: string }
 */
export const GET = withAuth(async () => {
  const user = await prisma.user.findFirst();
  if (!user) {
    return NextResponse.json({ error: '账号不存在' }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    username: user.username,
  });
});

export const PATCH = withAuth(async (_session, req) => {
  const body = await req.json();
  const parsed = validateBody(accountUpdateSchema, body);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;

  const user = await prisma.user.findFirst();
  if (!user) {
    return NextResponse.json({ error: '账号不存在' }, { status: 404 });
  }

  const updateData: { username?: string; passwordHash?: string } = {};

  if (data.username && data.username !== user.username) {
    const exists = await prisma.user.findUnique({
      where: { username: data.username },
    });
    if (exists && exists.id !== user.id) {
      return NextResponse.json(
        {
          error: '用户名已存在',
          fieldErrors: { username: ['用户名已存在'] },
        },
        { status: 409 },
      );
    }
    updateData.username = data.username;
  }

  if (data.newPassword) {
    const ok = await bcrypt.compare(
      data.currentPassword ?? '',
      user.passwordHash,
    );
    if (!ok) {
      return NextResponse.json(
        {
          error: '当前密码错误',
          fieldErrors: { currentPassword: ['当前密码错误'] },
        },
        { status: 400 },
      );
    }
    updateData.passwordHash = await bcrypt.hash(data.newPassword, 10);
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...updateData,
        // 修改密码后递增会话版本号，使既有 JWT 会话失效
        ...(data.newPassword ? { tokenVersion: { increment: 1 } } : {}),
      },
    });
  }

  return NextResponse.json({ success: true });
});
