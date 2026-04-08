export type {
  CreatePadronServiceOptions,
  PadronService,
} from "./services/padron";
// biome-ignore lint/performance/noBarrelFile: package subpath re-exports runtime padron factory
export { createPadronService } from "./services/padron";
