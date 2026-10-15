import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';

export interface FormMessage {
  type: 'success' | 'error';
  text: string;
}

interface FormSaveBarProps {
  message?: FormMessage | null;
  isDirty: boolean;
  saving?: boolean;
  saveDisabled?: boolean;
  onReset: () => void;
  onSave?: () => void;
  saveLabel?: string;
  resetLabel?: string;
}

export function FormSaveBar({
  message,
  isDirty,
  saving = false,
  saveDisabled = false,
  onReset,
  onSave,
  saveLabel = '保存',
  resetLabel = '撤销',
}: FormSaveBarProps) {
  if (!isDirty && message?.type !== 'error') return null;

  return (
    <div className="settings-save-bar">
      <div className="min-w-0 flex-1" aria-live="polite">
        <Text
          size="sm"
          className={
            message?.type === 'error' ? 'text-error' : 'text-secondary'
          }
        >
          {message?.text ?? '有未保存的修改'}
        </Text>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          label={resetLabel}
          variant="ghost"
          size="sm"
          type="button"
          isDisabled={!isDirty || saving}
          onClick={onReset}
        />
        <Button
          label={saveLabel}
          variant="primary"
          size="sm"
          type={onSave ? 'button' : 'submit'}
          isLoading={saving}
          isDisabled={!isDirty || saving || saveDisabled}
          onClick={onSave}
        />
      </div>
    </div>
  );
}
