import { prisma } from '@/lib/db';

/**
 * UserPreference 读写工具
 *
 * 简单键值对存储（networkMode / theme / searchEngine 等）。
 * 值统一以 JSON 编码存储、读取时解码，保证字符串、数字、布尔的类型不变。
 */

/** 读取首选项，不存在则返回 fallback */
export async function getUserPreference<T>(
  key: string,
  fallback: T,
): Promise<T> {
  const row = await prisma.userPreference.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as unknown as T;
  }
}

/** 写入首选项（upsert） */
export async function setUserPreference<T>(
  key: string,
  value: T,
): Promise<void> {
  const serialized = JSON.stringify(value);
  await prisma.userPreference.upsert({
    where: { key },
    create: { key, value: serialized },
    update: { value: serialized },
  });
}
