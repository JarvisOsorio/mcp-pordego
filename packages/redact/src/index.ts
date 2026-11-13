export type { Detector, DetectorId, Match } from "./types.js";
export {
  ALL_DETECTORS,
  DEFAULT_DETECTORS,
  PII_DETECTORS,
  detectSecrets,
  hasSecret,
} from "./detectors/default.js";
