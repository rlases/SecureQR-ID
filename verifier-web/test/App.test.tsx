import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiMocks = vi.hoisted(() => ({
  checkService: vi.fn(),
  verifyCredential: vi.fn(),
}));

const scannerMocks = vi.hoisted(() => ({
  selectDevice: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("../src/api/verifierApi", () => apiMocks);
vi.mock("../src/hooks/useQrScanner", () => ({
  useQrScanner: () => ({
    devices: [],
    selectedDeviceId: "",
    selectDevice: scannerMocks.selectDevice,
    start: scannerMocks.start,
    status: "idle",
    stop: scannerMocks.stop,
    videoRef: { current: null },
  }),
}));

import App from "../src/App";

async function switchToManual() {
  await userEvent.click(screen.getByRole("tab", { name: "Manual" }));
  return screen.getByLabelText("Token SQRID/1");
}

describe("App", () => {
  beforeEach(() => {
    apiMocks.checkService.mockResolvedValue(true);
    apiMocks.verifyCredential.mockResolvedValue(true);
  });

  it("presenta el flujo operativo y el estado de conexión", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Verificar credencial" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cámara" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() =>
      expect(screen.getByText("Servicio conectado")).toBeInTheDocument(),
    );
  });

  it("acepta desde entrada manual sin conservar ni mostrar el token", async () => {
    const token = "synthetic-accepted-token";
    render(<App />);
    const input = await switchToManual();

    await userEvent.type(input, token);
    await userEvent.click(screen.getByRole("button", { name: "Verificar" }));

    expect(
      await screen.findByRole("heading", { name: "Acceso validado" }),
    ).toBeInTheDocument();
    expect(apiMocks.verifyCredential).toHaveBeenCalledOnce();
    expect(apiMocks.verifyCredential).toHaveBeenCalledWith(token);
    expect(document.body.textContent).not.toContain(token);
    const historyStrip = document.getElementById("history-title-empty");
    expect(historyStrip?.textContent).toContain("1 lectura");
  });

  it("muestra el mismo rechazo genérico sin detalles internos", async () => {
    apiMocks.verifyCredential.mockResolvedValue(false);
    render(<App />);
    const input = await switchToManual();

    await userEvent.type(input, "synthetic-rejected-token");
    await userEvent.click(screen.getByRole("button", { name: "Verificar" }));

    expect(
      await screen.findByRole("heading", { name: "Acceso denegado" }),
    ).toBeInTheDocument();
    expect(screen.getByText("La credencial fue rechazada.")).toBeInTheDocument();
    expect(screen.queryByText(/firma|nonce|revocación|expirad/i)).not.toBeInTheDocument();
  });

  it("bloquea solicitudes duplicadas mientras hay una verificación en curso", async () => {
    let finishVerification: ((accepted: boolean) => void) | undefined;
    apiMocks.verifyCredential.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishVerification = resolve;
        }),
    );
    render(<App />);
    const input = await switchToManual();
    await userEvent.type(input, "single-request-token");
    const form = input.closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(apiMocks.verifyCredential).toHaveBeenCalledOnce();
    finishVerification?.(true);
    expect(
      await screen.findByRole("heading", { name: "Acceso validado" }),
    ).toBeInTheDocument();
  });

  it("distingue un fallo de transporte sin crear una decisión en el historial", async () => {
    apiMocks.verifyCredential.mockRejectedValue(new TypeError("network"));
    render(<App />);
    const input = await switchToManual();

    await userEvent.type(input, "opaque-token");
    await userEvent.click(screen.getByRole("button", { name: "Verificar" }));

    expect(
      await screen.findByRole("heading", { name: "Servicio no disponible" }),
    ).toBeInTheDocument();
    const historyStrip = document.getElementById("history-title-empty");
    expect(historyStrip?.textContent).toContain("0 lecturas");
  });

  it("limpia la actividad efímera sin usar almacenamiento persistente", async () => {
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    render(<App />);
    const input = await switchToManual();
    await userEvent.type(input, "opaque-token");
    await userEvent.click(screen.getByRole("button", { name: "Verificar" }));
    
    await waitFor(() => {
      const historyStrip = document.getElementById("history-title-empty");
      expect(historyStrip?.textContent).toContain("1 lectura");
    });

    await userEvent.click(screen.getByRole("button", { name: "Nueva verificación" }));
    
    const history = screen.getByRole("heading", { name: "Actividad reciente" }).parentElement
      ?.parentElement;
    expect(history).not.toBeNull();
    await userEvent.click(
      within(history!).getByRole("button", {
        name: "Limpiar actividad de la sesión",
      }),
    );

    const historyStrip2 = document.getElementById("history-title-empty");
    expect(historyStrip2?.textContent).toContain("0 lecturas");
    expect(storageSpy).not.toHaveBeenCalled();
  });

  it("activa la cámara únicamente tras una acción explícita", async () => {
    render(<App />);

    expect(scannerMocks.start).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Activar cámara" }));

    expect(scannerMocks.start).toHaveBeenCalledOnce();
  });
});
