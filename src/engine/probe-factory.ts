import type { Probe } from "./probe-types";
import { AptProbe } from "./AptProbe";
import { GithubProbe } from "./GithubProbe";
import { NpmProbe } from "./NpmProbe";
import { DockerHubProbe } from "./DockerHubProbe";
import { GhcrProbe } from "./GhcrProbe";
import { BinaryProbe } from "./BinaryProbe";
import { ScriptProbe } from "./ScriptProbe";

export function createProbe(
  probeType: string,
  githubToken?: string
): Probe | null {
  switch (probeType.toLowerCase()) {
    case "apt":
      return new AptProbe();
    case "github":
      return new GithubProbe(githubToken);
    case "npm":
      return new NpmProbe();
    case "dockerhub":
      return new DockerHubProbe();
    case "ghcr":
      return new GhcrProbe(githubToken);
    case "binary":
      return new BinaryProbe();
    case "script":
      return new ScriptProbe();
    default:
      return null;
  }
}
