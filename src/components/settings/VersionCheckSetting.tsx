'use client';

import { Button } from '@astryxdesign/core/Button';
import {
  MetadataList,
  MetadataListItem,
} from '@astryxdesign/core/MetadataList';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { SettingRow } from '@/components/settings/SettingRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
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

/** 版本检查偏好、远端发布信息与容器升级指引。 */
export function VersionCheckSetting({
  initialEnabled,
  initialCnMirror = false,
  initialUpdate,
}: VersionCheckSettingProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [cnMirror, setCnMirror] = useState(initialCnMirror);
  const [update, setUpdate] = useState<VersionUpdateInfo | null>(initialUpdate);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState<'enabled' | 'mirror' | null>(null);
  const [copying, setCopying] = useState(false);
  const requestPending = useRef(false);
  const copyPending = useRef(false);
  const { success, error } = useSaveFeedback();

  const handleToggle = async (checked: boolean) => {
    if (requestPending.current) return;
    requestPending.current = true;
    const previous = enabled;
    setEnabled(checked);
    setSaving('enabled');
    try {
      await preferencesApi.update('versionCheckEnabled', checked);
      success(checked ? '已开启自动检查更新' : '已关闭自动检查更新');
    } catch {
      setEnabled(previous);
      error('保存自动检查设置失败，请稍后重试');
    } finally {
      requestPending.current = false;
      setSaving(null);
    }
  };

  const handleToggleCnMirror = async (checked: boolean) => {
    if (requestPending.current) return;
    requestPending.current = true;
    const previous = cnMirror;
    setCnMirror(checked);
    setSaving('mirror');
    try {
      await preferencesApi.update('cnMirrorEnabled', checked);
      success(
        checked
          ? '已切换至国内线路，请点击「立即检查」刷新发布信息'
          : '已切换至海外线路，请点击「立即检查」刷新发布信息',
      );
      router.refresh();
    } catch {
      setCnMirror(previous);
      error('切换发布源失败，请稍后重试');
    } finally {
      requestPending.current = false;
      setSaving(null);
    }
  };

  const handleCheck = async () => {
    if (requestPending.current) return;
    requestPending.current = true;
    setChecking(true);
    try {
      const result = await versionApi.check(true);
      if (result.error) {
        if (result.update) setUpdate(result.update);
        error(result.error);
      } else {
        setUpdate(result.update ?? null);
        success(
          result.updateAvailable
            ? `发现新版本 ${result.update?.tag ?? ''}`
            : '当前已是最新版本',
        );
      }
    } catch {
      error('检查失败，请稍后重试');
    } finally {
      requestPending.current = false;
      setChecking(false);
    }
  };

  const handleCopyCommand = async () => {
    if (copyPending.current) return;
    if (!navigator.clipboard?.writeText) {
      error('当前浏览器无法访问剪贴板，请手动选择并复制命令');
      return;
    }
    copyPending.current = true;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(UPGRADE_COMMAND);
      success('升级命令已复制');
    } catch {
      error('复制失败，请手动选择并复制命令');
    } finally {
      copyPending.current = false;
      setCopying(false);
    }
  };

  const hasNewerVersion =
    update !== null && isNewerVersion(`v${APP_VERSION}`, update.tag);
  const busy = checking || saving !== null;
  const checkedAt = update ? new Date(update.checkedAt) : null;
  const checkedAtText =
    checkedAt && Number.isFinite(checkedAt.getTime())
      ? `${checkedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC`
      : '未知';

  return (
    <SettingsSection
      title="版本更新"
      description={`当前版本 v${APP_VERSION}`}
      layout="rows"
      actions={
        <Button
          label="立即检查"
          variant="secondary"
          size="sm"
          isLoading={checking}
          isDisabled={busy}
          onClick={() => void handleCheck()}
        />
      }
    >
      <SettingRow
        label="自动检查更新"
        description="自动查询远端发布信息；关闭后仍可手动检查"
        isSwitch
      >
        <Switch
          label="自动检查更新"
          isLabelHidden
          value={enabled}
          isDisabled={busy}
          isLoading={saving === 'enabled'}
          onChange={(checked) => void handleToggle(checked)}
        />
      </SettingRow>
      <SettingRow
        label="国内镜像加速"
        description="使用国内线路检查更新；切换后需重新检查"
        isSwitch
      >
        <Switch
          label="国内镜像加速"
          isLabelHidden
          value={cnMirror}
          isDisabled={busy}
          isLoading={saving === 'mirror'}
          onChange={(checked) => void handleToggleCnMirror(checked)}
        />
      </SettingRow>
      <SettingRow
        label="检查结果"
        description={
          update
            ? hasNewerVersion
              ? '发现可用更新'
              : '当前无可用更新'
            : '尚未检查'
        }
        stacked
      >
        {update ? (
          <MetadataList
            columns="single"
            label={{ position: 'start', width: '6rem' }}
          >
            <MetadataListItem label="远端最新">
              <Text size="sm" className="font-mono break-words">
                {update.tag}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="检查时间">
              <Text size="sm" className="font-mono break-words">
                {checkedAtText}
              </Text>
            </MetadataListItem>
          </MetadataList>
        ) : (
          <Text size="sm" color="secondary">
            点击「立即检查」获取远端最新版本与发布信息。
          </Text>
        )}
      </SettingRow>
      {hasNewerVersion && (
        <SettingRow label="容器升级" stacked>
          <div className="min-w-0 rounded-panel border border-border bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Text size="sm" weight="semibold">
                推荐容器升级命令
              </Text>
              <Button
                label="复制命令"
                icon={<Copy size={ICON_SIZE.sm} />}
                variant="secondary"
                size="sm"
                isLoading={copying}
                isDisabled={copying}
                onClick={() => void handleCopyCommand()}
              />
            </div>
            <code className="block select-all whitespace-pre-wrap break-words rounded-control bg-muted p-3 font-mono text-sm text-secondary">
              {UPGRADE_COMMAND}
            </code>
            <Text size="sm" color="secondary" className="mt-3">
              在部署目录执行前请备份数据，并确认 ./data 挂载配置保持不变。
            </Text>
          </div>
        </SettingRow>
      )}
    </SettingsSection>
  );
}
