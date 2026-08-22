interface PublicVerification {
  accepted: boolean;
  message: string;
}

function isPublicVerification(value: unknown): value is PublicVerification {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accepted === "boolean" &&
    typeof candidate.message === "string"
  );
}

export async function checkService(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch("/api/health", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    if (!response.ok) {
      return false;
    }
    const body = (await response.json()) as unknown;
    return (
      typeof body === "object" &&
      body !== null &&
      (body as Record<string, unknown>).status === "ready"
    );
  } catch {
    return false;
  }
}

export async function verifyCredential(token: string): Promise<boolean> {
  const response = await fetch("/api/verify", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (response.status >= 500) {
    throw new Error("verification_service_unavailable");
  }

  const body = (await response.json()) as unknown;
  if (!isPublicVerification(body)) {
    throw new Error("verification_response_invalid");
  }
  return body.accepted;
}
