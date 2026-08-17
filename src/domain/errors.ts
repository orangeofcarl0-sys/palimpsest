/** Failures raised by the authoritative domain rules. */

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

export class SchedulerInvariantError extends DomainValidationError {
  constructor(message: string) {
    super(message);
    this.name = "SchedulerInvariantError";
  }
}

export class PolicyError extends DomainValidationError {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}
