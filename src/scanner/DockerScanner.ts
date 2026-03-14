import type { Scanner, DiscoveredTool } from "./types";

interface DockerPsImage {
  Image?: string;
  Names?: string;
}

/** Discovers Docker engine + running container images */
export class DockerScanner implements Scanner {
  readonly source = "docker" as const;

  async scan(): Promise<DiscoveredTool[]> {
    const tools: DiscoveredTool[] = [];

    try {
      const versionProc = Bun.spawn(["docker", "version", "--format", "{{.Server.Version}}"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const versionOut = await new Response(versionProc.stdout).text();
      await versionProc.exited;
      const dockerVersion = versionOut.trim();
      if (dockerVersion) {
        tools.push({
          name: "docker",
          display_name: "Docker",
          current_version: dockerVersion,
          category: "tools",
          source: "docker",
        });
      }
    } catch {
      return [];
    }

    try {
      const psProc = Bun.spawn(
        ["docker", "ps", "--format", "{{json .}}"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const psOut = await new Response(psProc.stdout).text();
      await psProc.exited;

      const seen = new Set<string>();
      for (const line of psOut.trim().split("\n")) {
        if (!line) continue;
        try {
          const row = JSON.parse(line) as DockerPsImage;
          const image = row.Image;
          if (!image) continue;

          const [name, tag] = image.includes(":")
            ? image.split(":", 2)
            : [image, "latest"];
          const shortName = name.includes("/") ? name.split("/").pop()! : name;
          const key = `${shortName}:${tag}`;
          if (seen.has(key)) continue;
          seen.add(key);

          tools.push({
            name: shortName,
            display_name: shortName,
            current_version: tag,
            category: "container",
            source: "docker",
            source_key: image,
          });
        } catch {
          // skip malformed line
        }
      }
    } catch {
      // docker ps failed
    }

    return tools;
  }
}
