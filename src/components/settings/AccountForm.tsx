'use client';

import { TextInput } from '@astryxdesign/core/TextInput';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import {
  type FormMessage,
  FormSaveBar,
} from '@/components/settings/FormSaveBar';
import { SettingRow } from '@/components/settings/SettingRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
import { ApiError } from '@/lib/request/ApiError';
import { accountApi } from '@/services';
import type { AccountInfo } from '@/services/account';

interface AccountFormProps {
  initialUsername: string;
}

/** 账号设置：管理登录用户名。 */
export function AccountForm({ initialUsername }: AccountFormProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const feedback = useSaveFeedback();
  const [username, setUsername] = useState(initialUsername);
  const [savedUsername, setSavedUsername] = useState(initialUsername);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [serverError, setServerError] = useState<string | undefined>();
  const pending = useRef(false);

  const trimmedUsername = username.trim();
  const usernameError = !trimmedUsername
    ? '用户名必填'
    : trimmedUsername.length > 50
      ? '用户名最多 50 个字符'
      : serverError;
  const isDirty = username !== savedUsername;

  const handleSave = async () => {
    if (pending.current || !isDirty) return;
    if (usernameError) {
      setMessage({ type: 'error', text: usernameError });
      return;
    }

    pending.current = true;
    setSaving(true);
    setMessage(null);
    try {
      await accountApi.update({ username: trimmedUsername });
      setUsername(trimmedUsername);
      setSavedUsername(trimmedUsername);
      setServerError(undefined);
      void mutate(
        accountApi.getKey,
        (current: AccountInfo | undefined) =>
          current ? { ...current, username: trimmedUsername } : current,
        { revalidate: true },
      ).catch(() => {});
      feedback.success('用户名已保存');
      router.refresh();
    } catch (error) {
      const text =
        error instanceof ApiError
          ? error.isNetworkError
            ? '网络错误'
            : error.message
          : '保存失败';
      if (error instanceof ApiError) {
        setServerError(error.fieldErrors?.username?.[0]);
      }
      setMessage({ type: 'error', text });
      feedback.error(text);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (pending.current) return;
    setUsername(savedUsername);
    setServerError(undefined);
    setMessage(null);
  };

  return (
    <SettingsSection title="账号" description="管理登录用户名" layout="rows">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <SettingRow label="用户名" description="用于登录，保存后更新显示名称">
          <TextInput
            label="用户名"
            isLabelHidden
            autoComplete="username"
            value={username}
            onChange={(value) => {
              if (pending.current) return;
              setUsername(value);
              setServerError(undefined);
              setMessage(null);
            }}
            width="100%"
            hasClear
            isRequired
            isDisabled={saving}
            status={
              usernameError
                ? { type: 'error', message: usernameError }
                : undefined
            }
            statusVariant="detached"
          />
        </SettingRow>

        <FormSaveBar
          message={message}
          isDirty={isDirty}
          saving={saving}
          onReset={handleReset}
        />
      </form>
    </SettingsSection>
  );
}
