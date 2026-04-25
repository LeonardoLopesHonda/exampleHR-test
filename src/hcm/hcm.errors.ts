export class HcmTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HcmTransientError';
  }
}

export class HcmPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HcmPermanentError';
  }
}
