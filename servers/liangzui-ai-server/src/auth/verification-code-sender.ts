import { Injectable } from '@nestjs/common';
import type { IdentityType, VerificationPurpose } from '@ai-engine/contracts';

export const VERIFICATION_CODE_SENDER = Symbol('VERIFICATION_CODE_SENDER');

export type VerificationCodeMessage = {
  type: IdentityType;
  identifier: string;
  purpose: VerificationPurpose;
  code: string;
};

export interface VerificationCodeSender {
  send(message: VerificationCodeMessage): Promise<void>;
}

@Injectable()
export class StaticVerificationCodeSender implements VerificationCodeSender {
  async send(_message: VerificationCodeMessage): Promise<void> {
    // 静态模式不外发。生产环境在校验成功时告警，这里不记录验证码。
  }
}
