export type { CreateWsfeServiceOptions, WsfeService } from "./services/wsfe";
// biome-ignore lint/performance/noBarrelFile: package subpath re-exports runtime WSFE factory
export { createWsfeService } from "./services/wsfe";
