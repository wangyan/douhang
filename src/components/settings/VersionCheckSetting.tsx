'use client';

import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { APP_VERSION } from '@/lib/version';
import { preferencesApi, versionApi } from '@/services';
import type { VersionUpdateInfo } from '@/types';

interface VersionCheckSettingProps {
  initialEnabled: boolean;
  /** SSR 读取的最近一次检查缓存（null = 从未检查过） */
  initialUpdate: VersionUpdateInfo | null;
  /** SSR 读取的自定义授权令牌（可为空，空时回落环境变量） */
  initialToken?: string;
}

/**
 * 版本更新检测设置
 *
 * - Switch 即时保存，失败回滚
 * - 「立即检查」强制请求远端 Releases（跳过 24h 节流）
 * - 访问令牌输入框支持覆写私有仓库授权令牌
 * - 明确说明出站请求用途，自托管用户对联网行为敏感
 */
export function VersionCheckSetting({
  initialEnabled,
  initialUpdate,
  initialToken = '',
}: VersionCheckSettingProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [update, setUpdate] = useState<VersionUpdateInfo | null>(initialUpdate);
  const [checking, setChecking] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [savedToken, setSavedToken] = useState(initialToken);
  const [tokenSaving, setTokenSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleToggle = async (checked: boolean) => {
    const prev = enabled;
    setEnabled(checked);
    try {
      await preferencesApi.update('versionCheckEnabled', checked);
    } catch {
      setEnabled(prev);
    }
  };

  const handleSaveToken = async () => {
    setTokenSaving(true);
    setMessage(null);
    const trimmed = token.trim();
    try {
      await preferencesApi.update('versionCheckToken', trimmed);
      setSavedToken(trimmed);
      setMessage({ type: 'success', text: '访问令牌已保存' });
    } catch {
      setMessage({ type: 'error', text: '保存令牌失败，请稍后重试' });
    } finally {
      setTokenSaving(false);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const result = await versionApi.check(true);
      setUpdate(result.update ?? null);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({
          type: 'success',
          text: result.updateAvailable
            ? `发现新版本 ${result.update?.tag ?? ''}`
            : '当前已是最新版本',
        });
      }
    } catch {
      setMessage({ type: 'error', text: '检查失败，请稍后重试' });
    } finally {
      setChecking(false);
    }
  };

  const isTokenDirty = token.trim() !== savedToken.trim();

  return (
    <SettingsSection
      title="版本更新"
      description={`当前版本 v${APP_VERSION}`}
      actions={
        <Button
          label={checking ? '检查中…' : '立即检查'}
          variant="secondary"
          size="sm"
          isDisabled={checking || !enabled}
          onClick={() => void handleCheck()}
        />
      }
    >
      <HStack justify="between" align="center" width="100%">
        <VStack gap={1} align="start">
          <Text size="sm" weight="medium">
            自动检测新版本
          </Text>
          <Text type="supporting" textWrap="pretty">
            每 24 小时请求一次远端 Releases，关闭后不再发起该请求
          </Text>
        </VStack>
        <Switch
          label="自动检测新版本"
          isLabelHidden
          value={enabled}
          onChange={handleToggle}
        />
      </HStack>
      <VStack gap={2} width="100%" className="border-t border-border/60 pt-3">
        <HStack justify="between" align="end" width="100%" gap={3}>
          <div className="flex-1">
            <TextInput
              label="访问令牌 (Token)"
              description="私有仓库检测新版本需配置具备读取权限的访问令牌，留空则默认使用系统环境变量"
              value={token}
              onChange={setToken}
              width="100%"
              hasClear
              type="password"
              placeholder="留空默认使用 MAIN_REPO_TOKEN"
            />
          </div>
          {isTokenDirty && (
            <Button
              label={tokenSaving ? '保存中…' : '保存令牌'}
              variant="secondary"
              size="sm"
              isDisabled={tokenSaving}
              onClick={() => void handleSaveToken()}
            />
          )}
        </HStack>
      </VStack>
      <VStack gap={1}>
        {update && (
          <Text size="sm" color="secondary">
            上次检查：{update.checkedAt.slice(0, 10)} · 远端最新 {update.tag}
            {update.tag !== `v${APP_VERSION}` && '（非当前运行版本）'}
          </Text>
        )}
        {message && (
          <Text
            size="sm"
            className={
              message.type === 'success' ? 'text-success' : 'text-error'
            }
          >
            {message.text}
          </Text>
        )}
      </VStack>
    </SettingsSection>
  );
}
