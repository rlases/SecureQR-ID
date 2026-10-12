import type { Registro } from '@mi-app-qr/shared';

function escapeCsvValue(value: string | number) {
  const text = String(value);
  const spreadsheetSafe = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
}

export function buildRegistrosCsv(registros: Registro[]) {
  const rows = registros.map((registro) => [
    registro.nombre,
    registro.documento,
    registro.rol,
    registro.tipo,
    registro.timestamp,
  ]);
  return [
    ['Nombre', 'Documento', 'Rol', 'Tipo', 'Fecha y hora'],
    ...rows,
  ]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n');
}

export function downloadCsv(registros: Registro[]) {
  const csv = buildRegistrosCsv(registros);
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `informe-registros-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

