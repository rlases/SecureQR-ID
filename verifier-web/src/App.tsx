import { RefreshCw, ScanLine, Wifi, WifiOff } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { checkService, verifyCredential } from "./api/verifierApi";
import { ResultPanel } from "./components/ResultPanel";
import { ScannerPanel } from "./components/ScannerPanel";
import { SessionHistory } from "./components/SessionHistory";
import { useQrScanner } from "./hooks/useQrScanner";
import type {
  InputMode,
  ServiceStatus,
  SessionEntry,
  VerificationPhase,
} from "./types";

const MAX_SESSION_ENTRIES = 8;

const DATE_FORMAT = new Intl.DateTimeFormat("es-CO", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const TIME_FORMAT = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
});

export default function App() {
  const [inputMode, setInputMode] = useState<InputMode>("camera");
  const [manualToken, setManualToken] = useState("");
  const [phase, setPhase] = useState<VerificationPhase>("ready");
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>("checking");
  const [sessionEntries, setSessionEntries] = useState<SessionEntry[]>([]);
  const [now, setNow] = useState(() => new Date());
  const inFlightRef = useRef(false);
  const entryIdRef = useRef(0);

  const verifyToken = useCallback(async (opaqueToken: string) => {
    if (inFlightRef.current || !opaqueToken) {
      return;
    }
    inFlightRef.current = true;
    setPhase("verifying");
    try {
      const accepted = await verifyCredential(opaqueToken);
      setServiceStatus("online");
      setPhase(accepted ? "accepted" : "rejected");
      entryIdRef.current += 1;
      const entry: SessionEntry = {
        id: entryIdRef.current,
        accepted,
        verifiedAt: new Date(),
      };
      setSessionEntries((current) =>
        [entry, ...current].slice(0, MAX_SESSION_ENTRIES),
      );
    } catch {
      setServiceStatus("offline");
      setPhase("offline");
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const scanner = useQrScanner({ onDetected: verifyToken });

  const refreshService = useCallback(async () => {
    setServiceStatus("checking");
    const online = await checkService();
    setServiceStatus(online ? "online" : "offline");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkService(controller.signal).then((online) => {
      if (!controller.signal.aborted) {
        setServiceStatus(online ? "online" : "offline");
      }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const changeInputMode = (mode: InputMode) => {
    if (mode === "manual") {
      scanner.stop();
    }
    setInputMode(mode);
    if (phase !== "verifying") {
      setPhase("ready");
    }
  };

  const submitManualToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const opaqueToken = manualToken.trim();
    if (!opaqueToken) {
      return;
    }
    setManualToken("");
    void verifyToken(opaqueToken);
  };

  const startNextVerification = () => {
    setPhase("ready");
    if (inputMode === "camera") {
      void scanner.start();
    }
  };

  const ServiceIcon = serviceStatus === "offline" ? WifiOff : Wifi;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup" aria-label="SecureQR-ID">
          <span className="brand-mark" aria-hidden="true">
            <ScanLine size={25} />
          </span>
          <span>
            <strong>SecureQR-ID</strong>
            <small>Portal de verificación</small>
          </span>
        </div>

        <div className="header-status">
          <div
            className={`service-state service-${serviceStatus}`}
            role="status"
            aria-label={
              serviceStatus === "checking"
                ? "Comprobando servicio"
                : serviceStatus === "online"
                  ? "Servicio conectado"
                  : "Servicio sin conexión"
            }
            aria-live="polite"
          >
            <ServiceIcon aria-hidden="true" size={16} />
            <span>
              {serviceStatus === "checking"
                ? "Comprobando servicio"
                : serviceStatus === "online"
                  ? "Servicio conectado"
                  : "Servicio sin conexión"}
            </span>
          </div>
          <button
            type="button"
            className="icon-button header-refresh"
            aria-label="Comprobar conexión"
            title="Comprobar conexión"
            onClick={() => void refreshService()}
          >
            <RefreshCw
              className={serviceStatus === "checking" ? "spin" : ""}
              aria-hidden="true"
              size={17}
            />
          </button>
          <div className="header-clock" aria-label="Fecha y hora actuales">
            <span>{DATE_FORMAT.format(now)}</span>
            <strong>{TIME_FORMAT.format(now)}</strong>
          </div>
        </div>
      </header>

      <main className={`portal-layout ${phase === "accepted" || phase === "rejected" ? "is-decision" : ""}`}>
        {phase === "accepted" || phase === "rejected" ? (
          <>
            <ResultPanel
              cameraStatus={scanner.status}
              phase={phase}
              onNext={startNextVerification}
            />
            <SessionHistory
              entries={sessionEntries}
              onClear={() => setSessionEntries([])}
              summaryOnly
            />
          </>
        ) : (
          <>
            <ScannerPanel
              cameraStatus={scanner.status}
              devices={scanner.devices}
              inputMode={inputMode}
              manualToken={manualToken}
              selectedDeviceId={scanner.selectedDeviceId}
              verificationPhase={phase}
              videoRef={scanner.videoRef}
              onInputModeChange={changeInputMode}
              onManualSubmit={submitManualToken}
              onManualTokenChange={setManualToken}
              onSelectDevice={(deviceId) => void scanner.selectDevice(deviceId)}
              onStartCamera={() => {
                setPhase("ready");
                void scanner.start();
              }}
              onStopCamera={scanner.stop}
            />

            <aside className="decision-column" aria-label="Decisión y actividad">
              <ResultPanel
                cameraStatus={scanner.status}
                phase={phase}
                onNext={startNextVerification}
              />
              <SessionHistory
                entries={sessionEntries}
                onClear={() => setSessionEntries([])}
              />
            </aside>
          </>
        )}
      </main>

      <footer className="app-footer">
        <span>Sesión local</span>
        <span aria-hidden="true">·</span>
        <span>
          {sessionEntries.length} {sessionEntries.length === 1 ? "lectura" : "lecturas"}
        </span>
      </footer>
    </div>
  );
}
