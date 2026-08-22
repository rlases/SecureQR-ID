import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT ?? "8000", 10);
const MAX_BODY_BYTES = 8_192;

const commonHeaders = {
  "cache-control": "no-store, no-cache, must-revalidate",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function send(response, status, body) {
  response.writeHead(status, commonHeaders);
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("request-too-large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("invalid-json"));
      }
    });
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/api/health") {
    send(response, 200, { status: "ready" });
    return;
  }

  if (request.method === "POST" && request.url === "/api/verify") {
    try {
      const body = await readJson(request);
      if (
        typeof body !== "object" ||
        body === null ||
        Object.keys(body).length !== 1 ||
        typeof body.token !== "string" ||
        body.token.length < 1 ||
        body.token.length > 4_096
      ) {
        send(response, 400, { accepted: false, message: "Token rechazado." });
        return;
      }

      const accepted = body.token === "LAB-ACCEPTED";
      send(response, 200, {
        accepted,
        message: accepted ? "Credencial válida." : "Token rechazado.",
      });
    } catch {
      if (!response.headersSent) {
        send(response, 400, { accepted: false, message: "Token rechazado." });
      }
    }
    return;
  }

  send(response, 404, { accepted: false, message: "Recurso no disponible." });
});

server.listen(PORT, HOST, () => {
  console.log(`API visual de desarrollo: http://${HOST}:${PORT}`);
  console.log("Acepta solo el token sintético LAB-ACCEPTED; nunca usar en producción.");
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
