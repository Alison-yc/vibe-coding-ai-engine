import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

const STORED = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;

/**
 * 参数写进哈希，方便以后更换。当前只接受这一组：被改写的 N 会把单次校验放大成拒绝服务。
 */
@Injectable()
export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const derived = await this.derive(password, salt, N, R, P);
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${derived.toString('base64')}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const parsed = STORED.exec(stored);
    if (!parsed) return false;
    const cost = Number(parsed[1]);
    const blockSize = Number(parsed[2]);
    const parallel = Number(parsed[3]);
    if (cost !== N || blockSize !== R || parallel !== P) return false;
    const salt = Buffer.from(parsed[4] ?? '', 'base64');
    const expected = Buffer.from(parsed[5] ?? '', 'base64');
    if (salt.length !== SALT_BYTES || expected.length !== KEY_LENGTH) return false;
    const derived = await this.derive(password, salt, cost, blockSize, parallel);
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }

  /** 账号不存在时也走一次真实 scrypt，避免用响应时间判断账号是否存在。 */
  async dummyVerify(password: string): Promise<void> {
    this.dummyHash ??= this.hash('auth-dummy-password');
    await this.verify(password, await this.dummyHash);
  }

  private derive(
    password: string,
    salt: Buffer,
    cost: number,
    blockSize: number,
    parallel: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        KEY_LENGTH,
        { N: cost, r: blockSize, p: parallel, maxmem: 64 * 1024 * 1024 },
        (error, key) => {
          if (error) reject(error);
          else resolve(key);
        },
      );
    });
  }
}
