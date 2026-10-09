import { prisma } from '@/lib/db';
import { type BackupData, backupImportSchema } from '@/lib/validation';

/** 当前备份格式版本 */
const BACKUP_VERSION = 1 as const;

/** 导出全量数据（不含 users 账号与 data/uploads 文件） */
async function buildExport() {
  const [
    categories,
    cards,
    widgetInstances,
    dateItems,
    searchEngines,
    wallpapers,
    preferences,
  ] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: 'asc' } }),
    prisma.card.findMany({ orderBy: { order: 'asc' } }),
    prisma.widgetInstance.findMany({ orderBy: { order: 'asc' } }),
    prisma.dateItem.findMany(),
    prisma.searchEngine.findMany({ orderBy: { order: 'asc' } }),
    prisma.wallpaper.findMany(),
    prisma.userPreference.findMany({ orderBy: { key: 'asc' } }),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories,
    cards,
    widgetInstances,
    dateItems,
    searchEngines,
    wallpapers,
    preferences,
  };
}

/**
 * 从备份数据还原（事务内清空重建，保留原 id）
 *
 * - 不触碰 users 表（账号/密码不受影响）
 * - 引擎至少 1 个由 backupImportSchema 保证
 * - 日期字符串 → Date（dateItems.date/createdAt、cards.createdAt/updatedAt、wallpapers.createdAt）
 */
// 引用完整性预检：FK 违规在清库前暴露，避免半套数据 + 报错难懂
function validateReferences(data: BackupData): void {
  const categoryIds = new Set(data.categories.map((c) => c.id));
  const instanceIds = new Set(data.widgetInstances.map((w) => w.id));
  for (const c of data.cards) {
    if (c.categoryId && !categoryIds.has(c.categoryId)) {
      throw new Error(`备份引用了不存在的分类：${c.categoryId}`);
    }
  }
  for (const d of data.dateItems) {
    if (!instanceIds.has(d.instanceId)) {
      throw new Error(`日期项 ${d.id} 引用了不存在的组件实例：${d.instanceId}`);
    }
  }
}

export async function applyImport(data: BackupData): Promise<void> {
  validateReferences(data);
  await prisma.$transaction(async (tx) => {
    // 清空（FK 依赖倒序）
    await tx.dateItem.deleteMany();
    await tx.widgetInstance.deleteMany();
    await tx.card.deleteMany();
    await tx.category.deleteMany();
    await tx.searchEngine.deleteMany();
    await tx.wallpaper.deleteMany();
    await tx.userPreference.deleteMany();

    // 重建（FK 依赖正序，保留原 id）
    await tx.category.createMany({
      data: data.categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon ?? null,
        color: c.color ?? null,
        order: c.order,
      })),
    });
    await tx.card.createMany({
      data: data.cards.map((c) => ({
        id: c.id,
        name: c.name,
        internalUrl: c.internalUrl,
        externalUrl: c.externalUrl,
        icon: c.icon,
        description: c.description ?? null,
        categoryId: c.categoryId ?? null,
        openInDialog: c.openInDialog ?? false,
        order: c.order,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      })),
    });
    await tx.widgetInstance.createMany({
      data: data.widgetInstances.map((w) => ({
        id: w.id,
        widgetKey: w.widgetKey,
        order: w.order,
        size: w.size,
        x: w.x ?? null,
        y: w.y ?? null,
      })),
    });
    await tx.dateItem.createMany({
      data: data.dateItems.map((d) => ({
        id: d.id,
        instanceId: d.instanceId,
        widgetKey: d.widgetKey,
        name: d.name,
        date: new Date(d.date),
        recurUnit: d.recurUnit ?? null,
        createdAt: new Date(d.createdAt),
      })),
    });
    await tx.searchEngine.createMany({
      data: data.searchEngines.map((e) => ({
        id: e.id,
        name: e.name,
        urlTemplate: e.urlTemplate,
        iconPath: e.iconPath ?? null,
        order: e.order,
      })),
    });
    if (data.wallpapers.length > 0) {
      await tx.wallpaper.createMany({
        data: data.wallpapers.map((w) => ({
          id: w.id,
          name: w.name,
          source: w.source,
          path: w.path,
          thumbnail: w.thumbnail ?? null,
          createdAt: new Date(w.createdAt),
        })),
      });
    }
    if (data.preferences.length > 0) {
      await tx.userPreference.createMany({
        data: data.preferences.map((p) => ({
          key: p.key,
          value: p.value,
        })),
      });
    }
  });
}

// ============ ZIP 打包（JSON + data/uploads） ============

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import AdmZip from 'adm-zip';

const UPLOAD_ROOT = join(process.cwd(), 'data', 'uploads');
const RESOLVED_UPLOAD_ROOT = resolve(UPLOAD_ROOT) + sep;
const BACKUP_JSON_NAME = 'backup.json';

/** 递归收集目录内所有文件（相对 UPLOAD_ROOT 的 posix 路径） */
async function collectUploadFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectUploadFiles(full)));
    } else {
      files.push(relative(UPLOAD_ROOT, full).replaceAll('\\', '/'));
    }
  }
  return files;
}

/** 导出 zip：backup.json + data/uploads 全部文件 */
export async function buildZip(): Promise<Buffer> {
  const zip = new AdmZip();
  const data = await buildExport();
  zip.addFile(BACKUP_JSON_NAME, Buffer.from(JSON.stringify(data)));

  for (const rel of await collectUploadFiles(UPLOAD_ROOT)) {
    const full = join(UPLOAD_ROOT, rel);
    const buffer = await readFile(full);
    zip.addFile(`data/uploads/${rel}`, buffer);
  }
  return zip.toBuffer();
}

/**
 * 从 zip 恢复：读取 backup.json 走常规导入，并还原 data/uploads 文件
 *
 * - 数据库在事务内清空重建；上传文件在事务外覆盖写入，失败时可能部分还原
 * - backup.json 结构非法时抛错
 */
export async function applyZipImport(zipBuffer: Buffer): Promise<void> {
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntry(BACKUP_JSON_NAME);
  if (!entry) {
    throw new Error('备份缺少 backup.json');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(entry.getData().toString('utf8'));
  } catch {
    throw new Error('备份 JSON 格式不正确');
  }
  const parsed = backupImportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('备份 JSON 格式不正确');
  }
  const data: BackupData = parsed.data;

  await applyImport(data);

  // 还原上传文件（zip 内 data/uploads/ 前缀 → UPLOAD_ROOT）
  for (const file of zip.getEntries()) {
    if (file.isDirectory || !file.entryName.startsWith('data/uploads/')) {
      continue;
    }
    const rel = file.entryName.slice('data/uploads/'.length);
    const target = resolve(UPLOAD_ROOT, rel);
    // 防 Zip Slip：解析后的路径必须仍位于上传目录内
    if (rel === '' || !target.startsWith(RESOLVED_UPLOAD_ROOT)) {
      throw new Error(`备份 zip 含非法文件路径：${file.entryName}`);
    }
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, file.getData());
  }
}
