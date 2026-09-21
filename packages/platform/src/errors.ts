export class NotImplementedError extends Error {
  constructor(capability: string, phase = '12-B') {
    super(`${capability} 尚未实现，见 plan ${phase}`);
    this.name = 'NotImplementedError';
  }
}
