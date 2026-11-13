export type DetectorId =
  | "aws_access_key"
  | "aws_secret_key"
  | "github_token"
  | "slack_token"
  | "stripe_key"
  | "openai_key"
  | "anthropic_key"
  | "google_api_key"
  | "jwt"
  | "private_key"
  | "bearer_header"
  | "db_url_password"
  | "email"
  | "credit_card"
  | "high_entropy";

export interface Match {
  detector: DetectorId;
  start: number;
  end: number;
  /** Matched text length only — never log the value. */
  length: number;
}

export interface Detector {
  id: DetectorId;
  /** Detect matches in text. Must not throw. */
  detect(text: string): Match[];
}
