import { describe, expect, it } from 'vitest';
import { spawnPetalBurst, stepPetalParticles, type PetalParticle } from './petal-trail';

describe('petal-trail', () => {
  it('生成粒子并在步进后衰减', () => {
    const particles: PetalParticle[] = [];
    spawnPetalBurst(particles, 10, 20, ['rgb(1, 2, 3)'], 3);
    expect(particles.length).toBe(3);
    const initialLife = particles[0]?.life ?? 0;
    for (let step = 0; step < 80; step += 1) stepPetalParticles(particles);
    expect(particles.length).toBe(0);
    expect(initialLife).toBeGreaterThan(0);
  });
});
