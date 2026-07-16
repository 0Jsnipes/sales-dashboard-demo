import { createHmac, timingSafeEqual } from "crypto";

type MailgunSignature = {
  timestamp: string;
  token: string;
  signature: string;
};

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function mailgunSignatureValid(values: MailgunSignature, signingKey: string) {
  if (!values.timestamp || !values.token || !values.signature || !signingKey) return false;
  const expected = createHmac("sha256", signingKey)
    .update(`${values.timestamp}${values.token}`)
    .digest("hex");
  return safeEqual(values.signature, expected);
}

function mailbox(value: string) {
  const match = value.trim().toLowerCase().match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

export function senderAllowed(sender: string, configuredSenders: string | undefined) {
  const allowed = String(configuredSenders ?? "")
    .split(",")
    .map(mailbox)
    .filter(Boolean);
  return !allowed.length || allowed.includes(mailbox(sender));
}

export function sharedSecretValid(provided: string, expected: string) {
  return Boolean(provided && expected) && safeEqual(provided, expected);
}
