export type NodeOdmErrorKind =
  | "auth"
  | "network"
  | "validation"
  | "not_found"
  | "task_failed"
  | "unknown";

export class NodeOdmError extends Error {
  readonly kind: NodeOdmErrorKind;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(kind: NodeOdmErrorKind, message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message);
    this.name = "NodeOdmError";
    this.kind = kind;
    this.status = options.status;
    this.cause = options.cause;
  }
}

export function isNodeOdmError(error: unknown): error is NodeOdmError {
  return error instanceof NodeOdmError;
}
