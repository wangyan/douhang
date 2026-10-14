-- 清除已停用的版本检测访问令牌，避免凭据残留于数据库与备份文件
DELETE FROM "user_preferences" WHERE "key" = 'versionCheckToken';
