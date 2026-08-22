import { checkService, verifyCredential } from "../src/api/verifierApi";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("verifierApi", () => {
  it("detecta un servicio disponible sin usar cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ status: "ready" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkService()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
    );
  });

  it("trata fallos de salud como servicio no disponible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));

    await expect(checkService()).resolves.toBe(false);
  });

  it("envía el token opaco una sola vez y devuelve solo la decisión", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ accepted: true, message: "Token aceptado." }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyCredential("opaque-token")).resolves.toBe(true);

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ token: "opaque-token" });
    expect(request.cache).toBe("no-store");
  });

  it("rechaza respuestas inválidas y fallos del servidor", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ accepted: "yes" }))
      .mockResolvedValueOnce(response({}, 503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyCredential("first")).rejects.toThrow(
      "verification_response_invalid",
    );
    await expect(verifyCredential("second")).rejects.toThrow(
      "verification_service_unavailable",
    );
  });
});
