/**
 * Seeded PRNG + Gaussian sampling.
 *
 * Seeded deliberately: VS_inf is a Monte-Carlo estimate, and stored values
 * across a growing .obj corpus must stay reproducible and comparable. Math.random()
 * would make the same file report slightly different numbers on every page load.
 */

/** mulberry32 — small, fast, good enough distribution for direction sampling. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard normal via Box-Muller.
 *
 * This matters: sampling a direction as uniform-in-[-1,1]^3 then normalising
 * biases towards the cube's corners and would skew VS_inf. Gaussian components
 * give a genuinely uniform direction on the sphere — the same guarantee
 * np.random.normal provides in the Python reference.
 */
export function makeGaussian(rng) {
  let spare = null;
  return function gauss() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u, v, s;
    do {
      u = rng() * 2 - 1;
      v = rng() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const f = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * f;
    return u * f;
  };
}

/** Fisher-Yates, seeded. Welzl needs a random permutation for its expected-O(n) bound. */
export function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
