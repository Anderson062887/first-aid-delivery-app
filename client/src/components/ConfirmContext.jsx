import { createContext, useContext } from 'react';

export const ConfirmContext = createContext(null);

/**
 * const confirm = useConfirm();
 * if (!await confirm({ title, message, confirmLabel, danger })) return;
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
