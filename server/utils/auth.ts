import { timingSafeEqual } from "node:crypto";

/**
 * Timing-safe string comparison to prevent timing attacks on secret values.
 * Handles length mismatch by performing a dummy comparison to avoid
 * leaking length information through response timing.
 */
export const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Perform dummy comparison to avoid length-based timing leak
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
};
