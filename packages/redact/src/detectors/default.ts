import type { Detector, DetectorId, Match } from "../types.js";

function matchesFromRegex(
  detector: DetectorId,
  text: string,
  re: RegExp,
  groupIndex?: number,
): Match[] {
  const out: Match[] = [];
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const rx = new RegExp(re.source, flags);
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    if (groupIndex !== undefined && m[groupIndex] !== undefined) {
      const full = m[0]!;
      const group = m[groupIndex]!;
      const offset = full.indexOf(group);
      const start = m.index + (offset >= 0 ? offset : 0);
      out.push({ detector, start, end: start + group.length, length: group.length });
    } else {
      out.push({
        detector,
        start: m.index,
        end: m.index + m[0]!.length,
        length: m[0]!.length,
      });
    }
    if (m[0]!.length === 0) rx.lastIndex++;
  }
  return out;
}

function isLikelyJwt(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const header = parts[0]!;
    const padded = header + "=".repeat((4 - (header.length % 4)) % 4);
    const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    const parsed = JSON.parse(json) as { alg?: unknown };
    return typeof parsed.alg === "string" && parsed.alg.length > 0;
  } catch {
    return false;
  }
}

function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const AWS_ACCESS: Detector = {
  id: "aws_access_key",
  detect: (t) => matchesFromRegex("aws_access_key", t, /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/),
};

const AWS_SECRET: Detector = {
  id: "aws_secret_key",
  detect(text) {
    const out: Match[] = [];
    const keyword =
      /(?:aws[_-]?secret(?:[_-]?access)?[_-]?key|secretAccessKey)\s*[:=]\s*['"]?([A-Za-z0-9/+]{40})['"]?/gi;
    let m: RegExpExecArray | null;
    while ((m = keyword.exec(text)) !== null) {
      const group = m[1]!;
      const start = m.index + m[0]!.indexOf(group);
      out.push({ detector: "aws_secret_key", start, end: start + 40, length: 40 });
    }
    return out;
  },
};

const GITHUB: Detector = {
  id: "github_token",
  detect(text) {
    return [
      ...matchesFromRegex("github_token", text, /\bgh[pousr]_[A-Za-z0-9]{36,}\b/),
      ...matchesFromRegex("github_token", text, /\bgithub_pat_[A-Za-z0-9_]{50,}\b/),
    ];
  },
};

const SLACK: Detector = {
  id: "slack_token",
  detect: (t) => matchesFromRegex("slack_token", t, /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/),
};

const STRIPE: Detector = {
  id: "stripe_key",
  detect: (t) =>
    matchesFromRegex("stripe_key", t, /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/),
};

const OPENAI: Detector = {
  id: "openai_key",
  detect(text) {
    // Exclude anthropic sk-ant- keys
    return matchesFromRegex("openai_key", text, /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}\b/);
  },
};

const ANTHROPIC: Detector = {
  id: "anthropic_key",
  detect: (t) => matchesFromRegex("anthropic_key", t, /\bsk-ant-[A-Za-z0-9_-]{20,}\b/),
};

const GOOGLE: Detector = {
  id: "google_api_key",
  detect: (t) => matchesFromRegex("google_api_key", t, /\bAIza[0-9A-Za-z_-]{35}\b/),
};

const JWT: Detector = {
  id: "jwt",
  detect(text) {
    const out: Match[] = [];
    const re =
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (isLikelyJwt(m[0]!)) {
        out.push({
          detector: "jwt",
          start: m.index,
          end: m.index + m[0]!.length,
          length: m[0]!.length,
        });
      }
    }
    return out;
  },
};

const PRIVATE_KEY: Detector = {
  id: "private_key",
  detect: (t) =>
    matchesFromRegex(
      "private_key",
      t,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/,
    ),
};

const BEARER: Detector = {
  id: "bearer_header",
  detect: (t) =>
    matchesFromRegex("bearer_header", t, /authorization:\s*bearer\s+\S+/i),
};

const DB_URL: Detector = {
  id: "db_url_password",
  detect: (t) =>
    matchesFromRegex(
      "db_url_password",
      t,
      /\b[a-z][a-z0-9+.-]*:\/\/[^:\s/]+:([^@\s]+)@/i,
      1,
    ),
};

const EMAIL: Detector = {
  id: "email",
  detect: (t) =>
    matchesFromRegex(
      "email",
      t,
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    ),
};

function luhnOk(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const CREDIT_CARD: Detector = {
  id: "credit_card",
  detect(text) {
    const out: Match[] = [];
    const re = /\b(?:\d[ -]*?){13,19}\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0]!;
      const digits = raw.replace(/\D/g, "");
      if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) {
        out.push({
          detector: "credit_card",
          start: m.index,
          end: m.index + raw.length,
          length: raw.length,
        });
      }
    }
    return out;
  },
};

const HIGH_ENTROPY: Detector = {
  id: "high_entropy",
  detect(text) {
    const out: Match[] = [];
    const keywordNearby =
      /(?:key|token|secret|password)\s*[:=]\s*['"]?([A-Za-z0-9+/=_-]{24,})['"]?/gi;
    let m: RegExpExecArray | null;
    while ((m = keywordNearby.exec(text)) !== null) {
      const token = m[1]!;
      if (shannonEntropy(token) > 4.0) {
        const start = m.index + m[0]!.indexOf(token);
        out.push({
          detector: "high_entropy",
          start,
          end: start + token.length,
          length: token.length,
        });
      }
    }
    return out;
  },
};

/** Default detector set used for inline-secret scanning and response redaction. */
export const DEFAULT_DETECTORS: Detector[] = [
  AWS_ACCESS,
  AWS_SECRET,
  GITHUB,
  SLACK,
  STRIPE,
  OPENAI,
  ANTHROPIC,
  GOOGLE,
  JWT,
  PRIVATE_KEY,
  BEARER,
  DB_URL,
];

export const PII_DETECTORS: Detector[] = [EMAIL, CREDIT_CARD];

export const ALL_DETECTORS: Detector[] = [
  ...DEFAULT_DETECTORS,
  ...PII_DETECTORS,
  HIGH_ENTROPY,
];

export function detectSecrets(
  text: string,
  detectors: Detector[] = DEFAULT_DETECTORS,
): Match[] {
  const all: Match[] = [];
  for (const d of detectors) {
    try {
      all.push(...d.detect(text));
    } catch {
      // detectors must never throw; ignore broken ones
    }
  }
  return all.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function hasSecret(
  text: string,
  detectors: Detector[] = DEFAULT_DETECTORS,
): DetectorId | undefined {
  for (const d of detectors) {
    try {
      const hits = d.detect(text);
      if (hits.length > 0) return d.id;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}
