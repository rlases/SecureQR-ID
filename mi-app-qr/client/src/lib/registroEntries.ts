import type { Registro } from '@mi-app-qr/shared';

// El listado contiene solo las versiones vigentes. Una corrección reciente
// puede describir un evento antiguo: ordenar por fecha, no por id.
export function findOpenEntry(registros: Registro[], documento: string): Registro | null {
  const latest = registros
    .filter((registro) => registro.documento === documento)
    .reduce<Registro | null>((current, registro) => {
      if (!current) return registro;
      const order = registro.timestamp.replace('T', ' ').localeCompare(current.timestamp.replace('T', ' '));
      return order > 0 || (order === 0 && registro.id > current.id) ? registro : current;
    }, null);
  return latest?.tipo === 'entrada' ? latest : null;
}
