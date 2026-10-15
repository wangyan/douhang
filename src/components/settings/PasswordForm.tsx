'use client';

import { IconButton } from '@astryxdesign/core/IconButton';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  type FormMessage,
  FormSaveBar,
} from '@/components/settings/FormSaveBar';
import { SettingRow } from '@/components/settings/SettingRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
import { ICON_SIZE } from '@/lib/design-tokens';
import { ApiError } from '@/lib/request/ApiError';
import { accountApi } from '@/services';

type PasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';
type PasswordErrors = Partial<Record<PasswordField, string>>;

/** 安全设置：新密码至少 8 位，两次输入须一致。 */
export function PasswordForm() {
  const router = useRouter();
  const feedback = useSaveFeedback();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const pending = useRef(false);

  const isDirty = !!currentPassword || !!newPassword || !!confirmPassword;
  const inputType = showPasswords ? 'text' : 'password';

  const clearFieldError = (field: PasswordField) => {
    setErrors((previous) => ({
      ...previous,
      [field]: undefined,
      ...(field === 'newPassword' ? { confirmPassword: undefined } : {}),
    }));
    setMessage(null);
  };

  const handleSave = async () => {
    if (pending.current) return;

    const nextErrors: PasswordErrors = {};
    if (!currentPassword) nextErrors.currentPassword = '当前密码必填';
    if (!newPassword) {
      nextErrors.newPassword = '新密码必填';
    } else if (newPassword.length < 8) {
      nextErrors.newPassword = '新密码至少 8 位';
    } else if (newPassword.length > 100) {
      nextErrors.newPassword = '新密码最多 100 位';
    }
    if (!confirmPassword) {
      nextErrors.confirmPassword = '请确认新密码';
    } else if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = '两次输入的新密码不一致';
    }
    setErrors(nextErrors);
    const validationMessage =
      nextErrors.currentPassword ??
      nextErrors.newPassword ??
      nextErrors.confirmPassword;
    if (validationMessage) {
      setMessage({ type: 'error', text: validationMessage });
      return;
    }

    pending.current = true;
    setSaving(true);
    setMessage(null);
    try {
      await accountApi.update({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
      setShowPasswords(false);
      feedback.success('密码已更新，请重新登录');
      router.replace('/login?callbackUrl=%2Fsettings%2Faccount');
      router.refresh();
    } catch (error) {
      const text =
        error instanceof ApiError
          ? error.isNetworkError
            ? '网络错误'
            : error.message
          : '修改失败';
      if (error instanceof ApiError) {
        setErrors({
          currentPassword: error.fieldErrors?.currentPassword?.[0],
          newPassword: error.fieldErrors?.newPassword?.[0],
        });
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
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({});
    setMessage(null);
    setShowPasswords(false);
  };

  return (
    <SettingsSection
      title="安全"
      description="修改登录密码"
      layout="rows"
      actions={
        <IconButton
          label={showPasswords ? '隐藏密码' : '显示密码'}
          icon={
            showPasswords ? (
              <EyeOff size={ICON_SIZE.md} />
            ) : (
              <Eye size={ICON_SIZE.md} />
            )
          }
          variant="ghost"
          size="sm"
          aria-pressed={showPasswords}
          onClick={() => setShowPasswords((previous) => !previous)}
        />
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <SettingRow label="当前密码">
          <TextInput
            label="当前密码"
            isLabelHidden
            type={inputType}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(value) => {
              if (pending.current) return;
              setCurrentPassword(value);
              clearFieldError('currentPassword');
            }}
            width="100%"
            placeholder="请输入当前密码"
            isRequired
            isDisabled={saving}
            status={
              errors.currentPassword
                ? { type: 'error', message: errors.currentPassword }
                : undefined
            }
            statusVariant="detached"
          />
        </SettingRow>
        <SettingRow label="新密码" description="至少 8 位，最多 100 位">
          <TextInput
            label="新密码"
            isLabelHidden
            type={inputType}
            autoComplete="new-password"
            value={newPassword}
            onChange={(value) => {
              if (pending.current) return;
              setNewPassword(value);
              clearFieldError('newPassword');
            }}
            width="100%"
            placeholder="至少 8 位"
            isRequired
            isDisabled={saving}
            status={
              errors.newPassword
                ? { type: 'error', message: errors.newPassword }
                : undefined
            }
            statusVariant="detached"
          />
        </SettingRow>
        <SettingRow label="确认新密码">
          <TextInput
            label="确认新密码"
            isLabelHidden
            type={inputType}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(value) => {
              if (pending.current) return;
              setConfirmPassword(value);
              clearFieldError('confirmPassword');
            }}
            width="100%"
            placeholder="再次输入新密码"
            isRequired
            isDisabled={saving}
            status={
              errors.confirmPassword
                ? { type: 'error', message: errors.confirmPassword }
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
          saveLabel="更新密码"
        />
      </form>
    </SettingsSection>
  );
}
