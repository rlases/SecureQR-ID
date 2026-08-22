import type { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CameraDevice, CameraStatus } from "../types";

interface UseQrScannerOptions {
  onDetected: (token: string) => void;
}

function classifyCameraError(error: unknown): CameraStatus {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "blocked";
    }
    if (
      error.name === "NotFoundError" ||
      error.name === "OverconstrainedError"
    ) {
      return "unavailable";
    }
  }
  return "error";
}

export function useQrScanner({ onDetected }: UseQrScannerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const detectionLockedRef = useRef(false);
  const generationRef = useRef(0);
  const onDetectedRef = useRef(onDetected);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    detectionLockedRef.current = false;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (typeof MediaStream !== "undefined" && stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus("idle");
  }, []);

  const start = useCallback(
    async (requestedDeviceId?: string) => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      controlsRef.current?.stop();
      controlsRef.current = null;
      detectionLockedRef.current = false;

      if (!navigator.mediaDevices || !videoRef.current) {
        setStatus("unavailable");
        return;
      }

      setStatus("requesting");
      try {
        const { BrowserCodeReader, BrowserQRCodeReader } = await import(
          "@zxing/browser"
        );
        const reader = readerRef.current ?? new BrowserQRCodeReader();
        readerRef.current = reader;
        const availableDevices = await BrowserCodeReader.listVideoInputDevices();
        if (generationRef.current !== generation) {
          return;
        }
        if (availableDevices.length === 0) {
          setStatus("unavailable");
          return;
        }

        const mappedDevices = availableDevices.map((device, index) => ({
          id: device.deviceId,
          label: device.label || `Cámara ${index + 1}`,
        }));
        setDevices(mappedDevices);

        const nextDeviceId =
          requestedDeviceId ||
          selectedDeviceId ||
          mappedDevices.find((device) =>
            /back|rear|environment|trasera/i.test(device.label),
          )?.id ||
          mappedDevices[0].id;
        setSelectedDeviceId(nextDeviceId);

        const controls = await reader.decodeFromVideoDevice(
          nextDeviceId,
          videoRef.current,
          (result) => {
            if (!result || detectionLockedRef.current) {
              return;
            }
            detectionLockedRef.current = true;
            controlsRef.current?.stop();
            controlsRef.current = null;
            setStatus("idle");
            onDetectedRef.current(result.getText());
          },
        );

        if (generationRef.current !== generation) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStatus("scanning");
      } catch (error) {
        if (generationRef.current === generation) {
          setStatus(classifyCameraError(error));
        }
      }
    },
    [selectedDeviceId],
  );

  const selectDevice = useCallback(
    async (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      await start(deviceId);
    },
    [start],
  );

  useEffect(() => stop, [stop]);

  return {
    devices,
    selectedDeviceId,
    selectDevice,
    start,
    status,
    stop,
    videoRef,
  };
}
