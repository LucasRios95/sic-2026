import { ReactNode } from 'react';

import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Quando provided, exibe botões padrão de Confirmar/Cancelar. */
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}

/**
 * Modal acessível mínimo — backdrop clica para fechar, ESC fecha (TODO via hook).
 * Usado para ações destrutivas: cancelamento de NF-e, CC-e, revogação de cert.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  onConfirm,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive,
  loading,
}: Props): React.ReactElement | null {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-lg w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          ) : null}
        </div>
        <div className="px-6 py-4">{children}</div>
        {onConfirm ? (
          <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              onClick={() => void onConfirm()}
              loading={loading}
            >
              {confirmLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
