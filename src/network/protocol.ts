export interface DriveInput {
  type: 'input';
  version: 1;
  steering: number;
  brake: boolean;
  horn: boolean;
  seq: number;
  sentAt?: number;
  receivedAt?: number;
}

export interface SessionNotice {
  type: 'status';
  connected: boolean;
}

export interface InputAck {
  type: 'ack';
  seq: number;
  receivedAt?: number;
}

export function isDriveInput(value: unknown): value is DriveInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<DriveInput>;
  return input.type === 'input' && input.version === 1 &&
    typeof input.steering === 'number' && Number.isFinite(input.steering) &&
    input.steering >= -1 && input.steering <= 1 &&
    typeof input.brake === 'boolean' && typeof input.horn === 'boolean' &&
    Number.isSafeInteger(input.seq) && (input.seq ?? -1) >= 0;
}
