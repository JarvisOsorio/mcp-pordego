import type { StaticRule } from "../../types.js";

function isDocker(command?: string): boolean {
  if (!command) return false;
  const base = command.replace(/\\/g, "/").split("/").pop() ?? command;
  return base === "docker" || base === "docker.exe";
}

/** Image is unpinned if :latest, no tag, and no digest. */
export function isUnpinnedDockerImage(image: string): boolean {
  if (image.includes("@sha256:")) return false;
  const lastSlash = image.lastIndexOf("/");
  const name = lastSlash >= 0 ? image.slice(lastSlash + 1) : image;
  if (!name.includes(":")) return true;
  const tag = name.slice(name.lastIndexOf(":") + 1);
  return tag === "latest" || tag === "";
}

export const unpinnedDocker: StaticRule = {
  id: "unpinned-docker",
  severity: "high",
  check(server) {
    if (!isDocker(server.command)) return [];
    const args = server.args ?? [];
    // docker run [flags] image
    const runIdx = args.findIndex((a) => a === "run");
    if (runIdx < 0) return [];
    let i = runIdx + 1;
    while (i < args.length) {
      const a = args[i]!;
      if (a === "--") {
        i++;
        break;
      }
      if (a.startsWith("-")) {
        // flags that take a value
        if (
          a === "-e" ||
          a === "-v" ||
          a === "-p" ||
          a === "-w" ||
          a === "-u" ||
          a === "-m" ||
          a === "--name" ||
          a === "--network" ||
          a === "--entrypoint" ||
          a === "--mount" ||
          a === "--memory" ||
          a === "--cpus" ||
          a === "--user" ||
          a === "--workdir" ||
          a === "--env-file" ||
          a.startsWith("--env") ||
          a.startsWith("--volume") ||
          a === "-env"
        ) {
          // if form is --flag=value, no extra skip; if --flag value, skip next
          if (!a.includes("=") && i + 1 < args.length && !args[i + 1]!.startsWith("-")) {
            i += 2;
            continue;
          }
        }
        i++;
        continue;
      }
      break;
    }
    const image = args[i];
    if (!image) {
      return [
        {
          rule: "unpinned-docker",
          severity: "high",
          server: server.name,
          message: "docker run with no image",
          source: server.source,
        },
      ];
    }
    if (!isUnpinnedDockerImage(image)) return [];
    return [
      {
        rule: "unpinned-docker",
        severity: "high",
        server: server.name,
        message: `Docker image is unpinned: ${image}`,
        evidence: image,
        source: server.source,
      },
    ];
  },
};
