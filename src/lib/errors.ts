export class FlexError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "FlexError";
  }
}

export class AuthError extends FlexError {
  constructor(message: string) {
    super(message, "AUTH_ERROR");
    this.name = "AuthError";
  }
}

export class ApiError extends FlexError {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message, "API_ERROR");
    this.name = "ApiError";
  }
}

export function handleError(error: unknown): never {
  if (error instanceof FlexError) {
    console.error(`\x1b[31m✗\x1b[0m ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`\x1b[31m✗\x1b[0m ${error.message}`);
  } else {
    console.error(`\x1b[31m✗\x1b[0m An unknown error occurred`);
  }
  process.exit(1);
}
