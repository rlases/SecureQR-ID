import {
  ArrowRight,
  Check,
  LoaderCircle,
  ScanQrCode,
  ShieldCheck,
  ShieldX,
  WifiOff,
} from "lucide-react";

import type { CameraStatus, VerificationPhase } from "../types";

interface ResultPanelProps {
  cameraStatus: CameraStatus;
  phase: VerificationPhase;
  onNext: () => void;
}

interface StatusCopy {
  eyebrow: string;
  title: string;
  description: string;
  tone: string;
  icon: typeof ScanQrCode;
}

function getStatusCopy(
  phase: VerificationPhase,
  cameraStatus: CameraStatus,
): StatusCopy {
  if (phase === "verifying") {
    return {
      eyebrow: "En proceso",
      title: "Verificando credencial",
      description: "Espera un momento antes de presentar otro código.",
      tone: "working",
      icon: LoaderCircle,
    };
  }
  if (phase === "accepted") {
    return {
      eyebrow: "Decisión",
      title: "Acceso validado",
      description: "La credencial fue aceptada.",
      tone: "accepted",
      icon: ShieldCheck,
    };
  }
  if (phase === "rejected") {
    return {
      eyebrow: "Decisión",
      title: "Acceso denegado",
      description: "La credencial fue rechazada.",
      tone: "rejected",
      icon: ShieldX,
    };
  }
  if (phase === "offline") {
    return {
      eyebrow: "Sin decisión",
      title: "Servicio no disponible",
      description: "No se pudo completar la verificación.",
      tone: "offline",
      icon: WifiOff,
    };
  }
  if (cameraStatus === "scanning") {
    return {
      eyebrow: "Cámara activa",
      title: "Buscando código QR",
      description: "Alinea la credencial dentro del marco de lectura.",
      tone: "scanning",
      icon: ScanQrCode,
    };
  }
  if (cameraStatus === "requesting") {
    return {
      eyebrow: "Preparando",
      title: "Solicitando cámara",
      description: "Confirma el permiso en el navegador para continuar.",
      tone: "working",
      icon: LoaderCircle,
    };
  }
  return {
    eyebrow: "Estado",
    title: "Listo para verificar",
    description: "Activa la cámara o utiliza la entrada manual.",
    tone: "ready",
    icon: ScanQrCode,
  };
}

export function ResultPanel({ cameraStatus, phase, onNext }: ResultPanelProps) {
  const status = getStatusCopy(phase, cameraStatus);
  const Icon = status.icon;
  const canContinue =
    phase === "accepted" || phase === "rejected" || phase === "offline";

  if (phase === "accepted" || phase === "rejected") {
    return (
      <div className={`decision-hero hero-${status.tone}`} role="alert" aria-live="assertive">
        <div className="hero-badge">
          {phase === "accepted" ? (
            <><Check size={16} /> Aceptado</>
          ) : (
            <><ShieldX size={16} /> Rechazado</>
          )}
        </div>
        <div className="hero-content">
          <div className="hero-icon-wrapper">
            <Icon size={72} strokeWidth={1.8} />
          </div>
          <h1 className="hero-title">{status.title}</h1>
          <p className="hero-description">{status.description}</p>
          <button type="button" className="hero-button" onClick={onNext}>
            Nueva verificación
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      className={`result-surface tone-${status.tone}`}
      aria-labelledby="result-title"
      aria-live="polite"
    >
      <div className="result-topline">
        <p className="eyebrow">{status.eyebrow}</p>
      </div>

      <div className="status-visual" aria-hidden="true">
        <div className="status-ring ring-outer" />
        <div className="status-ring ring-inner" />
        <div className="status-icon">
          <Icon
            className={status.tone === "working" ? "spin" : ""}
            size={42}
            strokeWidth={1.8}
          />
        </div>
      </div>

      <div className="result-copy">
        <h2 id="result-title">{status.title}</h2>
        <p>{status.description}</p>
      </div>

      {canContinue ? (
        <button type="button" className="next-button" onClick={onNext}>
          Nueva verificación
          <ArrowRight aria-hidden="true" size={18} />
        </button>
      ) : (
        <div className="result-progress" aria-hidden="true">
          <span className="is-complete" />
          <span className={phase === "verifying" ? "is-current" : ""} />
          <span />
        </div>
      )}
    </section>
  );
}
