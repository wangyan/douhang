-- 斗法领航：用户会话版本号
--
-- users 表新增 tokenVersion 列。修改密码时递增该列，JWT 记录签发时的
-- 版本号，校验时不一致的会话拒绝，使修改密码后会话立即失效。

-- AlterTable
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
