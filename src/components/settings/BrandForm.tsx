'use client';

import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Image as ImageIcon, Upload } from 'lucide-react';
import { BrandMark } from '@/components/layout/BrandMark';
import { FormSaveBar } from '@/components/settings/FormSaveBar';
import { SettingRow } from '@/components/settings/SettingRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SwitchSettingRow } from '@/components/settings/SwitchSettingRow';
import { useBrandFormController } from '@/components/settings/useBrandFormController';
import { DEFAULT_BRAND_CONFIG } from '@/lib/brand-constants';
import { ICON_SIZE } from '@/lib/design-tokens';
import type { BrandConfig } from '@/types';

interface BrandFormProps {
  initialBrand: BrandConfig;
}

/** 品牌设置：标题、Logo 与显示方式。 */
export function BrandForm({ initialBrand }: BrandFormProps) {
  const ctl = useBrandFormController(initialBrand);
  const busy = ctl.saving || ctl.logoUpload.uploading;

  return (
    <SettingsSection
      title="品牌"
      description="自定义站点标题与 Logo"
      layout="rows"
    >
      {ctl.logoUpload.input}

      <SettingRow label="站点 Logo" description="上传图片作为站点标识">
        <div className="flex flex-col gap-2">
          <HStack gap={3} align="center">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control">
              <BrandMark
                size="lg"
                logo={ctl.logoError ? '' : ctl.brand.logo.trim()}
                aria-label={ctl.brand.title || DEFAULT_BRAND_CONFIG.title}
              />
            </div>
            <Button
              label="上传 Logo"
              variant="secondary"
              size="sm"
              icon={<Upload size={ICON_SIZE.sm} />}
              isLoading={ctl.logoUpload.uploading}
              isDisabled={busy}
              onClick={ctl.logoUpload.open}
            />
          </HStack>
          {ctl.uploadNotice && (
            <Text size="sm" color="secondary" role="status">
              {ctl.uploadNotice}
            </Text>
          )}
          {ctl.logoUpload.error && (
            <Text size="sm" className="text-error" role="alert">
              {ctl.logoUpload.error}
            </Text>
          )}
        </div>
      </SettingRow>

      <SettingRow label="站点标题" description="显示在页面与浏览器标签中">
        <TextInput
          label="站点标题"
          isLabelHidden
          value={ctl.brand.title}
          onChange={(value) => ctl.update('title', value)}
          width="100%"
          placeholder="DouHang"
          isRequired
          isDisabled={busy}
          status={
            ctl.titleError
              ? { type: 'error', message: ctl.titleError }
              : undefined
          }
          statusVariant="detached"
        />
      </SettingRow>

      <SettingRow label="Logo 地址" description="留空使用内置标识">
        <TextInput
          label="Logo 地址"
          isLabelHidden
          value={ctl.brand.logo}
          onChange={(value) => ctl.update('logo', value)}
          width="100%"
          placeholder="上传文件或 http(s) 地址"
          startIcon={<ImageIcon size={ICON_SIZE.md} />}
          hasClear
          isDisabled={busy}
          status={
            ctl.logoError
              ? { type: 'error', message: ctl.logoError }
              : undefined
          }
          statusVariant="detached"
        />
      </SettingRow>

      <SwitchSettingRow
        label="显示 Logo"
        description="在站点品牌区域显示标识"
        checked={ctl.brand.showLogo}
        disabled={busy}
        onChange={(checked) => ctl.update('showLogo', checked)}
      />
      <SwitchSettingRow
        label="显示标题"
        description="在站点品牌区域显示标题"
        checked={ctl.brand.showTitle}
        disabled={busy}
        onChange={(checked) => ctl.update('showTitle', checked)}
      />

      <FormSaveBar
        message={ctl.message}
        isDirty={ctl.isDirty}
        saving={busy}
        saveDisabled={!ctl.canSave}
        onReset={ctl.resetToSaved}
        onSave={() => void ctl.handleSave()}
      />
    </SettingsSection>
  );
}
