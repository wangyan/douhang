'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { type FormMessage } from '@/components/settings/FormSaveBar';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
import { useFileUpload } from '@/hooks/useFileUpload';
import { ApiError } from '@/lib/request/ApiError';
import { iconsApi, preferencesApi } from '@/services';
import type { BrandConfig } from '@/types';

const LOGO_PATTERN = /^(|https?:\/\/.+|\/api\/icons\/file.+)$/;

/** 品牌表单的状态、校验与保存逻辑。 */
export function useBrandFormController(initialBrand: BrandConfig) {
  const router = useRouter();
  const feedback = useSaveFeedback();
  const [brand, setBrand] = useState(initialBrand);
  const [savedBrand, setSavedBrand] = useState(initialBrand);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const pending = useRef<'save' | 'upload' | null>(null);

  const update = <K extends keyof BrandConfig>(
    key: K,
    value: BrandConfig[K],
  ) => {
    if (pending.current) return;
    setBrand((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
    if (key === 'logo') {
      setUploadNotice(null);
      logoUpload.clearError();
    }
  };

  const logoUpload = useFileUpload({
    accept:
      'image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon',
    onFile: async (file) => {
      if (pending.current) return;
      pending.current = 'upload';
      setUploadNotice(null);
      setMessage(null);
      try {
        const result = await iconsApi.upload(file, 'brand');
        setBrand((prev) => ({ ...prev, logo: result.path }));
        setUploadNotice('Logo 已上传，保存后生效');
      } finally {
        pending.current = null;
      }
    },
  });

  const title = brand.title.trim();
  const logo = brand.logo.trim();
  const titleError = !title
    ? '标题必填'
    : title.length > 30
      ? '标题最多 30 个字符'
      : undefined;
  const logoError =
    logo.length > 500
      ? 'Logo 地址最多 500 个字符'
      : LOGO_PATTERN.test(logo)
        ? undefined
        : 'Logo 仅支持上传文件或 http(s) 地址';
  const isDirty =
    brand.title !== savedBrand.title ||
    brand.logo !== savedBrand.logo ||
    brand.showLogo !== savedBrand.showLogo ||
    brand.showTitle !== savedBrand.showTitle;
  const canSave =
    !saving && !logoUpload.uploading && isDirty && !titleError && !logoError;

  const handleSave = async () => {
    if (pending.current || !canSave) return;

    const nextBrand = {
      title,
      logo,
      showLogo: brand.showLogo,
      showTitle: brand.showTitle,
    };
    pending.current = 'save';
    setSaving(true);
    setMessage(null);
    try {
      await preferencesApi.update('brand', nextBrand);
      setBrand(nextBrand);
      setSavedBrand(nextBrand);
      setUploadNotice(null);
      feedback.success('品牌设置已保存');
      router.refresh();
    } catch (error) {
      const text = error instanceof ApiError ? error.message : '保存失败';
      setMessage({ type: 'error', text });
      feedback.error(text);
    } finally {
      pending.current = null;
      setSaving(false);
    }
  };

  const resetToSaved = () => {
    if (pending.current) return;
    setBrand(savedBrand);
    setMessage(null);
    setUploadNotice(null);
    logoUpload.clearError();
  };

  return {
    brand,
    message,
    uploadNotice,
    saving,
    isDirty,
    titleError,
    logoError,
    canSave,
    update,
    handleSave,
    resetToSaved,
    logoUpload,
  };
}
