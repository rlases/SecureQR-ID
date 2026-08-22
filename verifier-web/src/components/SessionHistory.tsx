import { Check, Clock3, ShieldX, Trash2 } from "lucide-react";

import type { SessionEntry } from "../types";

interface SessionHistoryProps {
  entries: SessionEntry[];
  onClear: () => void;
  summaryOnly?: boolean;
}

const TIME_FORMAT = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function SessionHistory({ entries, onClear, summaryOnly }: SessionHistoryProps) {
  if (entries.length === 0 || summaryOnly) {
    return (
      <section className="history-empty-strip" aria-labelledby="history-title-empty">
        <Clock3 aria-hidden="true" size={16} />
        <span id="history-title-empty">Actividad reciente: {entries.length} {entries.length === 1 ? "lectura" : "lecturas"}</span>
      </section>
    );
  }

  return (
    <section className="history-surface" aria-labelledby="history-title">
      <div className="history-heading">
        <div>
          <p className="eyebrow">Sesión actual</p>
          <h2 id="history-title">Actividad reciente</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Limpiar actividad de la sesión"
          title="Limpiar actividad"
          onClick={onClear}
        >
          <Trash2 aria-hidden="true" size={18} />
        </button>
      </div>

      <ol className="history-list">
        {entries.map((entry, index) => (
          <li key={entry.id} className="history-row">
            <span
              className={`history-icon ${entry.accepted ? "is-accepted" : "is-rejected"}`}
              aria-hidden="true"
            >
              {entry.accepted ? <Check size={16} /> : <ShieldX size={16} />}
            </span>
            <div>
              <strong>{entry.accepted ? "Aceptado" : "Rechazado"}</strong>
              <span>Verificación {entries.length - index}</span>
            </div>
            <time dateTime={entry.verifiedAt.toISOString()}>
              {TIME_FORMAT.format(entry.verifiedAt)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
