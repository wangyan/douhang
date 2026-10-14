'use client';

import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ICON_SIZE } from '@/lib/design-tokens';
import { APP_VERSION, isNewerVersion } from '@/lib/version';
import { preferencesApi, versionApi } from '@/services';
import type { VersionUpdateInfo } from '@/types';

interface VersionCheckSettingProps {
  initialEnabled: boolean;
  initialCnMirror?: boolean;
  /** SSR 读取的最近一次检查缓存（null = 从未检查过） */
  initialUpdate: VersionUpdateInfo | null;
}

const UPGRADE_COMMAND =
  'docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d';

/**
 * 版本更新检测设置
 *
 * - Switch 即时保存，失败回滚
 * - 支持国内线路 (AtomGit) 一键免代理直连加速
 * - 「立即检查」强制请求远端 Releases（跳过节流）
 * - 发现新版时展示官方推荐升级指令与一键复制
 */
export function VersionCheckSetting({
  initialEnabled,
  initialCnMirror = false,
  initialUpdate,
}: VersionCheckSettingProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [cnMirror, setCnMirror] = useState(initialCnMirror);
  const [update, setUpdate] = useState<VersionUpdateInfo | null>(initialUpdate);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const handleToggleCnMirror = async (checked: boolean) => {
    const prev = cnMirror;
    setCnMirror(checked);
    try {
      await preferencesApi.update('cnMirrorEnabled', checked);
      setMessage({
        type: 'success',
        text: checked
          ? '已切换至国内线路 (AtomGit)'
          : '已切换回海外线路 (GitHub)',
      });
    } catch {
      setCnMirror(prev);
      setMessage({ type: 'error', text: '切换线路失败，请稍后重试' });
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

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(UPGRADE_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 忽略剪贴板写入异常
    }
  };

  const hasNewerVersion =
    update !== null && isNewerVersion(`v${APP_VERSION}`, update.tag);

  return (
    <SettingsSection
      title="版本更新"
      description={`当前版本 v${APP_VERSION}`}
      actions={
        <Button
          label={checking ? '检查中…' : '立即检查'}
          variant="secondary"
          size="sm"
          isDisabled={checking}
          onClick={() => void handleCheck()}
        />
      }
    >
      {/* 自动检查更新开关 */}
      <HStack justify="between" align="center" width="100%">
        <VStack gap={1} align="start">
          <Text size="sm" weight="medium">
            自动检查更新
          </Text>
          <Text type="supporting" textWrap="pretty">
            定期检测远端 Releases；关闭后不再自动发起请求，仍可手动检查
          </Text>
        </VStack>
        <Switch
          label="自动检查更新"
          isLabelHidden
          value={enabled}
          onChange={handleToggle}
        />
      </HStack>

      {/* 国内环境加速开关 */}
      <HStack
        justify="between"
        align="center"
        width="100%"
        className="border-t border-border/60 pt-3"
      >
        <VStack gap={1} align="start">
          <Text size="sm" weight="medium">
            国内环境加速
          </Text>
          <Text type="supporting" textWrap="pretty">
            使用国内线路 (AtomGit) 直连拉取 Release 信息，免代理加速
          </Text>
        </VStack>
        <Switch
          label="国内环境加速"
          isLabelHidden
          value={cnMirror}
          onChange={handleToggleCnMirror}
        />
      </HStack>

      {/* 状态与升级指引 */}
      <VStack gap={2} width="100%" className="pt-1">
        {update && (
          <HStack justify="between" align="center" width="100%">
            <Text size="sm" color="secondary">
              上次检查：{update.checkedAt.slice(0, 10)} · 远端最新 {update.tag}
              {!hasNewerVersion && '（已是最新版本）'}
            </Text>
            {update.url && (
              <Button
                label="查看更新日志"
                icon={<ExternalLink size={ICON_SIZE.xs} />}
                variant="ghost"
                size="sm"
                onClick={() => window.open(update.url, '_blank', 'noopener')}
              />
            )}
          </HStack>
        )}

        {/* 发现新版本时的升级指引卡片 */}
        {hasNewerVersion && (
          <VStack
            gap={2}
            width="100%"
            className="rounded-panel bg-surface/60 border border-border/80 p-3 mt-1"
          >
            <HStack justify="between" align="center" width="100%">
              <Text size="sm" weight="semibold" className="text-primary">
                推荐容器升级命令
              </Text>
              <Button
                label={copied ? '已复制' : '复制命令'}
                icon={
                  copied ? (
                    <Check size={ICON_SIZE.xs} className="text-success" />
                  ) : (
                    <Copy size={ICON_SIZE.xs} />
                  )
                }
                variant="secondary"
                size="sm"
                onClick={() => void handleCopyCommand()}
              />
            </HStack>
            <div className="overflow-x-auto rounded-control bg-muted p-2 font-mono text-xs text-secondary select-all">
              {UPGRADE_COMMAND}
            </div>
            <Text type="supporting" size="sm">
              在部署目录执行上述命令即可完成升级，数据目录（./data）保持不变。
            </Text>
          </VStack>
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
