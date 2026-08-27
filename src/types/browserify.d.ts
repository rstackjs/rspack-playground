declare module "assert" {
  const assert: unknown;
  export default assert;
}

declare module "events" {
  const EventEmitter: unknown;
  export default EventEmitter;
}

declare module "os-browserify/browser.js" {
  const os: unknown;
  export default os;
}

declare module "process" {
  const process: Record<string, unknown>;
  export default process;
}

declare module "querystring-es3" {
  const querystring: unknown;
  export default querystring;
}

declare module "stream-browserify" {
  const Stream: unknown;
  export default Stream;
}

declare module "string_decoder" {
  const stringDecoder: unknown;
  export default stringDecoder;
}

declare module "timers-browserify" {
  const timers: unknown;
  export default timers;
}

declare module "tty-browserify" {
  const tty: unknown;
  export default tty;
}

declare module "url" {
  const url: unknown;
  export default url;
}

declare module "util" {
  const util: unknown;
  export default util;
}
