# Rspack Playground

> [!NOTE]
> `@rspack/browser` is still in an early stage of development.

The playground for [Rspack](https://rspack.dev/) based on `@rspack/browser`.

Try it on https://playground.rspack.rs/

## Get started

Install the dependencies:

```bash
pnpm install
```

Start the dev server, and the app will be available at [http://localhost:3000](http://localhost:3000).

```bash
pnpm dev
```

## Node.js built-ins in configuration

`rspack.config.js` supports the following Node.js built-ins, including their `node:` aliases:

- File and path: `fs`, `fs/promises`, `path`, `path/posix`
- Common browser-compatible utilities: `assert`, `assert/strict`, `buffer`, `events`, `os`,
  `process`, `querystring`, `stream`, `string_decoder`, `timers`, `tty`, `url`, `util`, and `sys`

Built-ins are loaded on demand for static imports and literal `require()` calls.
The `fs` module accesses the Playground project's in-memory file system rooted at `/`; it does
not expose files from the user's device. Other built-ins use browser-compatible implementations
and do not expose Node.js host OS, process, or network capabilities.

## Acknowledgement

- https://bundler.sxzz.dev/
