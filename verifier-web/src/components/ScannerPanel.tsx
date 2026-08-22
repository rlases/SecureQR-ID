import {
  Camera,
  CameraOff,
  Keyboard,
  LoaderCircle,
  Play,
  ScanLine,
  Send,
  Square,
} from "lucide-react";
import { type FormEvent, type RefObject } from "react";

import type {
  CameraDevice,
  CameraStatus,
  InputMode,
  VerificationPhase,
} from "../types";

interface ScannerPanelProps {
  cameraStatus: CameraStatus;
  devices: CameraDevice[];
  inputMode: InputMode;
  manualToken: string;
  selectedDeviceId: string;
  verificationPhase: VerificationPhase;
  videoRef: RefObject<HTMLVideoElement>;
  onInputModeChange: (mode: InputMode) => void;
  onManualSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onManualTokenChange: (token: string) => void;
  onSelectDevice: (deviceId: string) => void;
  onStartCamera: () => void;
  onStopCamera: () => void;
}

const CAMERA_ERROR_COPY: Partial<Record<CameraStatus, string>> = {
  blocked: "Permiso de cámara bloqueado",
  unavailable: "No se encontró una cámara disponible",
  error: "No fue posible iniciar la cámara",
};

export function ScannerPanel({
  cameraStatus,
  devices,
  inputMode,
  manualToken,
  selectedDeviceId,
  verificationPhase,
  videoRef,
  onInputModeChange,
  onManualSubmit,
  onManualTokenChange,
  onSelectDevice,
  onStartCamera,
  onStopCamera,
}: ScannerPanelProps) {
  const cameraPaused =
    verificationPhase === "verifying" ||
    verificationPhase === "accepted" ||
    verificationPhase === "rejected";
  const cameraError = CAMERA_ERROR_COPY[cameraStatus];

  return (
    <section className="scanner-surface" aria-labelledby="scanner-title">
      <div className="surface-heading">
        <div>
          <p className="eyebrow">Punto de control</p>
          <h1 id="scanner-title">Verificar credencial</h1>
        </div>

        <div className="mode-switch" role="tablist" aria-label="Método de lectura">
          <button
            type="button"
            id="mode-camera"
            role="tab"
            aria-controls="panel-camera"
            aria-selected={inputMode === "camera"}
            className={inputMode === "camera" ? "is-active" : ""}
            onClick={() => onInputModeChange("camera")}
          >
            <Camera aria-hidden="true" size={17} />
            Cámara
          </button>
          <button
            type="button"
            id="mode-manual"
            role="tab"
            aria-controls="panel-manual"
            aria-selected={inputMode === "manual"}
            className={inputMode === "manual" ? "is-active" : ""}
            onClick={() => onInputModeChange("manual")}
          >
            <Keyboard aria-hidden="true" size={17} />
            Manual
          </button>
        </div>
      </div>

      {inputMode === "camera" ? (
        <div
          id="panel-camera"
          className="camera-workspace"
          role="tabpanel"
          aria-labelledby="mode-camera"
        >
          <div className="camera-toolbar">
            <div className="field-group camera-field">
              <label htmlFor="camera-device">Cámara</label>
              <select
                id="camera-device"
                value={selectedDeviceId}
                disabled={devices.length === 0 || cameraStatus === "requesting"}
                onChange={(event) => onSelectDevice(event.target.value)}
              >
                {devices.length === 0 ? (
                  <option value="">Detección automática</option>
                ) : null}
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>

            {cameraStatus === "scanning" ? (
              <button
                type="button"
                className="icon-button"
                aria-label="Detener cámara"
                title="Detener cámara"
                onClick={onStopCamera}
              >
                <Square aria-hidden="true" size={18} />
              </button>
            ) : null}
          </div>

          <div
            className={`camera-viewport camera-${cameraStatus}`}
            data-testid="camera-viewport"
          >
            <video ref={videoRef} muted playsInline aria-hidden="true" />
            <div className="camera-shade" aria-hidden="true" />
            <div className="scan-target" aria-hidden="true">
              <span className="corner corner-top-left" />
              <span className="corner corner-top-right" />
              <span className="corner corner-bottom-left" />
              <span className="corner corner-bottom-right" />
              {cameraStatus === "scanning" ? <span className="scan-beam" /> : null}
            </div>

            {cameraStatus === "scanning" ? (
              <div className="camera-status-chip">
                <span className="live-dot" aria-hidden="true" />
                Buscando QR
              </div>
            ) : null}

            {cameraStatus === "requesting" ? (
              <div className="camera-empty-state" role="status">
                <LoaderCircle className="spin" aria-hidden="true" size={30} />
                <strong>Solicitando cámara</strong>
              </div>
            ) : null}

            {cameraStatus === "idle" && !cameraPaused ? (
              <div className="camera-empty-state">
                <div className="empty-icon" aria-hidden="true">
                  <ScanLine size={34} />
                </div>
                <strong>Escáner preparado</strong>
                <button type="button" className="primary-button" onClick={onStartCamera}>
                  <Play aria-hidden="true" size={18} />
                  Activar cámara
                </button>
              </div>
            ) : null}

            {cameraStatus === "idle" && cameraPaused ? (
              <div className="camera-empty-state" role="status">
                <div className="empty-icon is-paused" aria-hidden="true">
                  <ScanLine size={34} />
                </div>
                <strong>Lectura pausada</strong>
              </div>
            ) : null}

            {cameraError ? (
              <div className="camera-empty-state" role="alert">
                <div className="empty-icon is-error" aria-hidden="true">
                  <CameraOff size={32} />
                </div>
                <strong>{cameraError}</strong>
                <button type="button" className="secondary-button" onClick={onStartCamera}>
                  <Play aria-hidden="true" size={18} />
                  Reintentar
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          id="panel-manual"
          className="manual-panel"
          role="tabpanel"
          aria-labelledby="mode-manual"
        >
          <form className="manual-workspace" onSubmit={onManualSubmit}>
            <div className="manual-visual" aria-hidden="true">
              <div className="manual-glyph">
                <Keyboard size={42} />
              </div>
              <span />
              <span />
              <span />
            </div>
            <div className="manual-form-body">
              <div className="field-group token-field">
                <label htmlFor="manual-token">Token SQRID/1</label>
                <div className="secure-input">
                  <input
                    id="manual-token"
                    type="text"
                    value={manualToken}
                    maxLength={4096}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Pega el token capturado"
                    disabled={verificationPhase === "verifying"}
                    onChange={(event) => onManualTokenChange(event.target.value)}
                  />
                </div>
              </div>
              <button
                type="submit"
                className="primary-button verify-button"
                disabled={!manualToken.trim() || verificationPhase === "verifying"}
              >
                {verificationPhase === "verifying" ? (
                  <LoaderCircle className="spin" aria-hidden="true" size={18} />
                ) : (
                  <Send aria-hidden="true" size={18} />
                )}
                Verificar
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
