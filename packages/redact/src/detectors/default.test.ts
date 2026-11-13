import { describe, expect, it } from "vitest";
import { detectSecrets, hasSecret } from "./default.js";

describe("default detectors", () => {
  it("detects AWS access keys", () => {
    expect(hasSecret("key=AKIAIOSFODNN7EXAMPLE")).toBe("aws_access_key");
  });

  it("detects GitHub PATs", () => {
    expect(
      hasSecret("tok=ghp_abcdefghijklmnopqrstuvwxyz0123456789AB"),
    ).toBe("github_token");
  });

  it("detects Slack tokens", () => {
    expect(hasSecret("xoxb-1234567890-abcdefghij")).toBe("slack_token");
  });

  it("detects Stripe keys", () => {
    expect(hasSecret("sk_live_abcdefghijklmnopqrstuv")).toBe("stripe_key");
  });

  it("detects Anthropic keys", () => {
    expect(hasSecret("sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).toBe(
      "anthropic_key",
    );
  });

  it("detects OpenAI keys (not anthropic)", () => {
    expect(hasSecret("sk-abcdefghijklmnopqrstuvwxyz")).toBe("openai_key");
  });

  it("detects Google API keys", () => {
    expect(hasSecret("AIzaSyA-abcdefghijklmnopqrstuvwxyz12345")).toBe(
      "google_api_key",
    );
  });

  it("detects private keys", () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF6PZN3+\n-----END RSA PRIVATE KEY-----`;
    expect(hasSecret(pem)).toBe("private_key");
  });

  it("detects bearer headers", () => {
    expect(hasSecret("Authorization: Bearer abc.def.ghi")).toBe("bearer_header");
  });

  it("detects db url passwords only", () => {
    const hits = detectSecrets("postgres://user:s3cret@host/db");
    expect(hits.some((h) => h.detector === "db_url_password")).toBe(true);
  });

  it("detects JWTs with alg header", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    );
    const payload = Buffer.from(JSON.stringify({ sub: "1" })).toString("base64url");
    const jwt = `${header}.${payload}.signaturepartxx`;
    expect(hasSecret(`token=${jwt}`)).toBe("jwt");
  });

  it("ignores lookalike non-secrets", () => {
    expect(hasSecret("hello world AKIA short")).toBeUndefined();
    expect(hasSecret("sk-ant")).toBeUndefined();
    expect(hasSecret("https://example.com")).toBeUndefined();
  });
});
