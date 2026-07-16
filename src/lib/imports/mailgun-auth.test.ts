import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { mailgunSignatureValid, senderAllowed, sharedSecretValid } from "./mailgun-auth";

describe("Mailgun inbound authentication", () => {
  it("validates Mailgun's timestamp and token signature", () => {
    const signingKey = "test-signing-key";
    const timestamp = "1770920772";
    const token = "mailgun-token";
    const signature = createHmac("sha256", signingKey).update(`${timestamp}${token}`).digest("hex");
    expect(mailgunSignatureValid({ timestamp, token, signature }, signingKey)).toBe(true);
    expect(mailgunSignatureValid({ timestamp, token, signature: "invalid" }, signingKey)).toBe(false);
  });

  it("supports an optional envelope sender allowlist", () => {
    expect(senderAllowed("Reports <reports@outlook.com>", "reports@outlook.com, other@example.com")).toBe(true);
    expect(senderAllowed("unknown@example.com", "reports@outlook.com")).toBe(false);
    expect(senderAllowed("unknown@example.com", "")).toBe(true);
  });

  it("compares fallback shared secrets", () => {
    expect(sharedSecretValid("correct-secret", "correct-secret")).toBe(true);
    expect(sharedSecretValid("wrong-secret", "correct-secret")).toBe(false);
  });
});
