import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface ExportCsvModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onExport: (rolFiltro: string | 'all') => void;
}

export function ExportCsvModal({
  isOpen,
  onCancel,
  onExport,
}: ExportCsvModalProps) {
  const [rol, setRol] = useState('');

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Exportar Reporte CSV"
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Exportar Reporte CSV
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Selecciona qué registros deseas exportar:
        </p>

        <div className="space-y-4">
          <Button
            className="w-full"
            onClick={() => onExport('all')}
          >
            Exportar Todos
          </Button>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink-0 px-4 text-sm text-muted-foreground">o</span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-rol">Filtrar por rol</Label>
            <Input
              id="export-rol"
              placeholder="Ej. Docente, Administrativo..."
              value={rol}
              onChange={(e) => setRol(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            variant="secondary"
            disabled={!rol.trim()}
            onClick={() => onExport(rol.trim())}
          >
            Exportar Filtrados
          </Button>
        </div>

        <div className="flex justify-end gap-2 pt-6">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
