import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const signatureHeaderName = "x-webhook-flow-signature";

export function generateEndpointSecret(): string {
  return `wfsec_${randomBytes(24).toString("base64url")}`;
}

export function deriveSigningKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function signPayload(secret: string, rawBody: string | Buffer): string {
  return signPayloadWithKey(deriveSigningKey(secret), rawBody);
}

export function signPayloadWithKey(signingKey: string, rawBody: string | Buffer): string {
  const digest = createHmac("sha256", signingKey).update(rawBody).digest("hex");
  return `sha256=${digest}`;
}

export function verifyPayloadSignature(
  signingKey: string,
  rawBody: string | Buffer,
  receivedSignature: string | undefined
): boolean {
  if (!receivedSignature) return false;
  const expected = signPayloadWithKey(signingKey, rawBody);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(receivedSignature);
  return (
    expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
