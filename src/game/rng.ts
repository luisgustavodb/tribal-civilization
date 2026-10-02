export function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rand {
  r: () => number;
  constructor(seed: number) {
    this.r = mulberry32(seed);
  }
  f() {
    return this.r();
  }
  range(a: number, b: number) {
    return a + (b - a) * this.r();
  }
  int(a: number, b: number) {
    return Math.floor(a + (b - a + 1) * this.r());
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.r() * arr.length)];
  }
}

export const rnd = {
  f: () => Math.random(),
  range: (a: number, b: number) => a + (b - a) * Math.random(),
  int: (a: number, b: number) => Math.floor(a + (b - a + 1) * Math.random()),
  pick: <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)],
};

export class Noise {
  perm = new Uint8Array(512);
  constructor(seed: number) {
    const r = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  private grad(h: number, x: number, y: number) {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }
  // perlin noise in about [-1,1]
  n2(x: number, y: number) {
    const X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y;
    const xi = X & 255, yi = Y & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const p = this.perm;
    const aa = p[p[xi] + yi], ab = p[p[xi] + yi + 1], ba = p[p[xi + 1] + yi], bb = p[p[xi + 1] + yi + 1];
    const x1 = this.grad(aa, xf, yf) * (1 - u) + this.grad(ba, xf - 1, yf) * u;
    const x2 = this.grad(ab, xf, yf - 1) * (1 - u) + this.grad(bb, xf - 1, yf - 1) * u;
    return (x1 * (1 - v) + x2 * v) * 1.41;
  }
  // fbm normalized to ~[0,1]
  fbm(x: number, y: number, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.n2(x * f, y * f);
      n += a;
      a *= gain;
      f *= lac;
    }
    return Math.min(1, Math.max(0, (s / n) * 0.5 + 0.5));
  }
  ridged(x: number, y: number, oct = 4) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * (1 - Math.abs(this.n2(x * f, y * f)));
      n += a;
      a *= 0.5;
      f *= 2;
    }
    return s / n;
  }
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
