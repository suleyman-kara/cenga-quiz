import { GameError } from "./errors";

/**
 * Generates PINs until `tryClaim` atomically claims a free one.
 * `tryClaim` resolves false on collision.
 */
export async function allocatePin(
  tryClaim: (pin: string) => Promise<boolean>,
  generate: () => string,
  maxAttempts = 10,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const pin = generate();
    if (await tryClaim(pin)) return pin;
  }
  throw new GameError("resource-exhausted", "Boş bir oyun PIN'i bulunamadı, lütfen tekrar deneyin.");
}
