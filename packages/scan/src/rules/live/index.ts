import type { LiveRule } from "../../types.js";
import { descCrossToolRef } from "./desc-cross-tool-ref.js";
import { descExfilUrl } from "./desc-exfil-url.js";
import { descHiddenChars } from "./desc-hidden-chars.js";
import { descInjectionPhrases } from "./desc-injection-phrases.js";
import { descMarkupHidden } from "./desc-markup-hidden.js";
import { descOversized } from "./desc-oversized.js";
import { noReadonlyHint } from "./no-readonly-hint.js";
import {
  schemaFreeformExec,
  schemaFreeformPath,
  schemaFreeformUrl,
} from "./schema-freeform.js";
import { toolNameCollision } from "./tool-name-collision.js";

export const LIVE_RULES: LiveRule[] = [
  descInjectionPhrases,
  descHiddenChars,
  descMarkupHidden,
  descCrossToolRef,
  descExfilUrl,
  schemaFreeformExec,
  schemaFreeformPath,
  schemaFreeformUrl,
  noReadonlyHint,
  toolNameCollision,
  descOversized,
];

export {
  descCrossToolRef,
  descExfilUrl,
  descHiddenChars,
  descInjectionPhrases,
  descMarkupHidden,
  descOversized,
  noReadonlyHint,
  schemaFreeformExec,
  schemaFreeformPath,
  schemaFreeformUrl,
  toolNameCollision,
};
