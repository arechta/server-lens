import type { Probe } from "./probe-types";
import { AptProbe } from "../probes/apt.probe";
import { GithubProbe } from "../probes/github.probe";
import { NpmProbe } from "../probes/npm.probe";
import { NodeProbe } from "../probes/node.probe";
import { DockerHubProbe } from "../probes/dockerhub.probe";
import { GhcrProbe } from "../probes/ghcr.probe";
import { SnapProbe } from "../probes/snap.probe";
import { BinaryProbe } from "../probes/binary.probe";
import { ScriptProbe } from "../probes/script.probe";

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
    case "node":
      return new NodeProbe();
    case "dockerhub":
      return new DockerHubProbe();
    case "ghcr":
      return new GhcrProbe(githubToken);
    case "snap":
      return new SnapProbe();
    case "binary":
      return new BinaryProbe();
    case "script":
      return new ScriptProbe();
    default:
      return null;
  }
}
