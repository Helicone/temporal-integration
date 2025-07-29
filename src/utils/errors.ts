export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

export class GitOperationError extends IntegrationError {
  constructor(message: string, cause?: Error) {
    super(message, 'GIT_OPERATION_FAILED', cause);
  }
}

export class ClaudeCodeError extends IntegrationError {
  constructor(message: string, cause?: Error) {
    super(message, 'CLAUDE_CODE_FAILED', cause);
  }
}

export class GitHubAPIError extends IntegrationError {
  constructor(message: string, cause?: Error) {
    super(message, 'GITHUB_API_FAILED', cause);
  }
}