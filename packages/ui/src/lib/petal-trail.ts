export type PetalParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  w: number;
  h: number;
  angle: number;
  spin: number;
};

const MAX_PARTICLES = 140;

export const spawnPetalBurst = (
  particles: PetalParticle[],
  x: number,
  y: number,
  colors: readonly string[],
  count = 5,
) => {
  if (colors.length === 0) return;
  for (let index = 0; index < count; index += 1) {
    const direction = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2.2;
    particles.push({
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed - 0.45,
      life: 0.7 + Math.random() * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)] ?? colors[0] ?? 'currentColor',
      w: 2 + Math.random() * 4,
      h: 1.2 + Math.random() * 2.5,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.22,
    });
  }
  while (particles.length > MAX_PARTICLES) particles.shift();
};

export const stepPetalParticles = (particles: PetalParticle[]) => {
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    if (!particle) continue;
    particle.life -= 0.016;
    if (particle.life <= 0) {
      particles.splice(index, 1);
      continue;
    }
    particle.vx *= 0.97;
    particle.vy += 0.035;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.angle += particle.spin;
  }
};

export const drawPetalParticles = (
  ctx: CanvasRenderingContext2D,
  particles: readonly PetalParticle[],
) => {
  for (const particle of particles) {
    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.angle);
    ctx.globalAlpha = Math.min(1, particle.life * 0.85);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.roundRect(
      -particle.w / 2,
      -particle.h / 2,
      particle.w,
      particle.h,
      Math.min(particle.w, particle.h) * 0.35,
    );
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
};
