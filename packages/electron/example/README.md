# Example Electron

## Getting Started

```sh
cd ../../.. && npm install
cd packages/electron/example
npm run start
```

## Notes

- This example bundles local workspace source with esbuild aliases instead of consuming the published npm package as an external dependency.
- Because of that, `import Ocr from '@repeato/ocr'` here is simpler than in apps that load the published package through Electron and webpack externals.
- The published package is verified against both ESM `import()` and CommonJS `require()` so externalized Electron consumers keep seeing a stable `create()` API.

## Compare Main Vs Renderer

```sh
npm run benchmark
```

## Smoke Test

```sh
npm run test:smoke
```

## Packaged Smoke Test

```sh
npm run test:smoke:packaged
```

## Asset Regression Tests

```sh
npm run test:assets
```