import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmContext } from './ConfirmContext.jsx';

// In-app replacement for window.confirm: looks the same on every device and
// makes risky actions look risky. Resolves true (confirm) or false (cancel).
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);

  const confirm = useCallback((opts) => new Promise(resolve => {
    setRequest({ ...(typeof opts === 'string' ? { message: opts } : opts), resolve });
  }), []);

  const close = (answer) => {
    request?.resolve(answer);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && <ConfirmDialog {...request} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ title = 'Are you sure?', message, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, onClose }) {
  const cancelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Cancel is the safe choice, so it gets the focus; Escape also cancels
  useEffect(() => {
    const previous = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="confirm-backdrop" onClick={() => onClose(false)}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="confirm-title">{title}</h3>
        {message && <p id="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button ref={cancelRef} className="btn" onClick={() => onClose(false)}>{cancelLabel}</button>
          <button className={danger ? 'btn danger solid' : 'btn primary'} onClick={() => onClose(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
