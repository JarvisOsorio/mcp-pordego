import type { StaticRule } from "../../types.js";
import { broadFsRoot } from "./broad-fs-root.js";
import { inlineSecret } from "./inline-secret.js";
import { remoteHttpNoTls } from "./remote-http-no-tls.js";
import { shellServer } from "./shell-server.js";
import { unpinnedDocker } from "./unpinned-docker.js";
import { unpinnedGit } from "./unpinned-git.js";
import { unpinnedNpx } from "./unpinned-npx.js";
import { unpinnedUvx } from "./unpinned-uvx.js";

export const STATIC_RULES: StaticRule[] = [
  unpinnedNpx,
  unpinnedUvx,
  unpinnedDocker,
  unpinnedGit,
  inlineSecret,
  remoteHttpNoTls,
  broadFsRoot,
  shellServer,
];

export {
  broadFsRoot,
  inlineSecret,
  remoteHttpNoTls,
  shellServer,
  unpinnedDocker,
  unpinnedGit,
  unpinnedNpx,
  unpinnedUvx,
};
