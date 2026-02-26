/**
 * Custom error types for the NRL Schedule Scraper
 */

/** Base error class for application errors */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly validOptions?: (string | number)[]
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.validOptions && { validOptions: this.validOptions }),
    };
  }
}

/** Error for invalid parameters */
export class InvalidParameterError extends AppError {
  constructor(message: string, validOptions?: (string | number)[]) {
    super('INVALID_PARAMETER', message, 400, validOptions);
    this.name = 'InvalidParameterError';
  }
}

/** Error for resource not found */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

/** Error for scrape operations */
export class ScrapeError extends AppError {
  constructor(message: string) {
    super('SCRAPE_FAILED', message, 500);
    this.name = 'ScrapeError';
  }
}

/** Error for internal server errors */
export class InternalError extends AppError {
  constructor(message: string) {
    super('INTERNAL_ERROR', message, 500);
    this.name = 'InternalError';
  }
}
