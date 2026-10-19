-- 斗航 v1.0.0 初始基线
--
-- 本迁移是 1.0.0 全新项目形态的建库基线：由 prisma/schema.prisma 直接生成，
-- 涵盖全部 8 张表与索引，并写入内置搜索引擎的初始数据。
-- 新部署只需应用此单条迁移即可得到与 schema 完全一致的数据库结构。

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "internalUrl" TEXT NOT NULL,
    "externalUrl" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "description" TEXT,
    "openInDialog" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cards_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "widget_instances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "widgetKey" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "size" TEXT NOT NULL DEFAULT 'M',
    "x" INTEGER,
    "y" INTEGER
);

-- CreateTable
CREATE TABLE "date_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "widgetKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "recurUnit" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "date_items_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "widget_instances" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "wallpapers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "thumbnail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "search_engines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "urlTemplate" TEXT NOT NULL,
    "iconPath" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "cards_categoryId_idx" ON "cards"("categoryId");

-- CreateIndex
CREATE INDEX "widget_instances_widgetKey_idx" ON "widget_instances"("widgetKey");

-- CreateIndex
CREATE INDEX "date_items_instanceId_idx" ON "date_items"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_key_key" ON "user_preferences"("key");


-- 内置 6 个搜索引擎落库（id 即内置 key，与前端内置引擎定义一一对应）
INSERT INTO "search_engines" ("id", "name", "urlTemplate", "iconPath", "order") VALUES
  ('metaso', 'Metaso', 'https://metaso.cn/?q=', '/icons/library/svg/metaso.svg', 0),
  ('deepseek', 'DeepSeek', 'https://chat.deepseek.com/?autosend=1&search=1&thinking=1&q=', '/icons/library/svg/deepseek.svg', 1),
  ('sogou', 'Sogou', 'https://weixin.sogou.com/weixin?type=2&query=', '/icons/library/svg/sogou.svg', 2),
  ('google', 'Google', 'https://www.google.com/search?q=', '/icons/library/svg/google.svg', 3),
  ('bing', 'Bing', 'https://www.bing.com/search?q=', '/icons/library/svg/bing.svg', 4),
  ('baidu', 'Baidu', 'https://www.baidu.com/s?wd=', '/icons/library/svg/baidu.svg', 5);
