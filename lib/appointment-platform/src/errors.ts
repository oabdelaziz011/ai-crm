export class AppointmentNotFoundError extends Error {
  constructor(message = "Appointment not found.") {
    super(message);
    this.name = "AppointmentNotFoundError";
  }
}

export class AppointmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppointmentValidationError";
  }
}

export class AppointmentPermissionError extends Error {
  constructor(message = "Permission denied.") {
    super(message);
    this.name = "AppointmentPermissionError";
  }
}

export class AppointmentConflictError extends Error {
  constructor(message = "Appointment conflict.") {
    super(message);
    this.name = "AppointmentConflictError";
  }
}
