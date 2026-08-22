import { act, renderHook, waitFor } from "@testing-library/react";

const zxingMocks = vi.hoisted(() => ({
  callback: undefined as ((result?: { getText: () => string }) => void) | undefined,
  listDevices: vi.fn(),
  decode: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
  BrowserCodeReader: {
    listVideoInputDevices: zxingMocks.listDevices,
  },
  BrowserQRCodeReader: class {
    decodeFromVideoDevice(
      deviceId: string,
      video: HTMLVideoElement,
      callback: (result?: { getText: () => string }) => void,
    ) {
      zxingMocks.callback = callback;
      return zxingMocks.decode(deviceId, video, callback);
    }
  },
}));

import { useQrScanner } from "../src/hooks/useQrScanner";

describe("useQrScanner", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {},
    });
    zxingMocks.listDevices.mockResolvedValue([
      {
        deviceId: "rear-camera",
        label: "Cámara trasera",
        kind: "videoinput",
        groupId: "group",
      },
    ]);
    zxingMocks.decode.mockResolvedValue({ stop: zxingMocks.stop });
  });

  it("detiene la cámara en la primera detección y entrega el token una sola vez", async () => {
    const onDetected = vi.fn();
    const { result } = renderHook(() => useQrScanner({ onDetected }));
    Object.defineProperty(result.current.videoRef, "current", {
      configurable: true,
      value: document.createElement("video"),
    });

    await act(async () => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("scanning"));
    expect(result.current.selectedDeviceId).toBe("rear-camera");

    act(() => {
      zxingMocks.callback?.({ getText: () => "opaque-scanned-token" });
      zxingMocks.callback?.({ getText: () => "duplicate" });
    });

    expect(zxingMocks.stop).toHaveBeenCalledOnce();
    expect(onDetected).toHaveBeenCalledOnce();
    expect(onDetected).toHaveBeenCalledWith("opaque-scanned-token");
  });

  it("clasifica un permiso denegado sin iniciar una verificación", async () => {
    const onDetected = vi.fn();
    zxingMocks.listDevices.mockRejectedValue(
      new DOMException("denied", "NotAllowedError"),
    );
    const { result } = renderHook(() => useQrScanner({ onDetected }));
    Object.defineProperty(result.current.videoRef, "current", {
      configurable: true,
      value: document.createElement("video"),
    });

    await act(async () => result.current.start());

    expect(result.current.status).toBe("blocked");
    expect(onDetected).not.toHaveBeenCalled();
  });
});
