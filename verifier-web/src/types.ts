export type InputMode = "camera" | "manual";

export type CameraStatus =
  | "idle"
  | "requesting"
  | "scanning"
  | "blocked"
  | "unavailable"
  | "error";

export type VerificationPhase =
  | "ready"
  | "verifying"
  | "accepted"
  | "rejected"
  | "offline";

export type ServiceStatus = "checking" | "online" | "offline";

export interface CameraDevice {
  id: string;
  label: string;
}

export interface SessionEntry {
  id: number;
  accepted: boolean;
  verifiedAt: Date;
}
