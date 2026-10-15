'use client';

import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';

export function useSaveFeedback() {
  const showToast = useToast();

  const success = (message: string, undo?: () => void) => {
    const dismiss = showToast({
      body: message,
      type: 'info',
      autoHideDuration: undo ? 5000 : 2000,
      endContent: undo ? (
        <Button
          label="撤销"
          size="sm"
          variant="ghost"
          onClick={() => {
            dismiss();
            undo();
          }}
        />
      ) : undefined,
    });
  };

  const error = (message: string) => {
    showToast({ body: message, type: 'error', isAutoHide: false });
  };

  return { success, error };
}
