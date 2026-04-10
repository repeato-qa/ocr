# Electron App

## Getting Started

```sh
cd ../../.. && npm install
cd packages/electron
npm run start
```

## Notes

- This app bundles local workspace source with esbuild aliases instead of consuming the published npm package as an external dependency.
- Because of that, `import Ocr from '@repeato/ocr'` here is simpler than in apps that load the published package through Electron and webpack externals.
- The published package is verified against both ESM `import()` and CommonJS `require()` so externalized Electron consumers keep seeing a stable `create()` API.

## Compare Main Vs Renderer

```sh
npm run benchmark
```

The default comparison includes the supported paths for the current OCR models:

- renderer WASM
- renderer WebGPU
- main thread

WebGL stays available only as an explicit experimental compatibility check because the current OCR models fail on that backend.

Explicit modes:

```sh
npm run benchmark:main
npm run benchmark:renderer:wasm
npm run benchmark:renderer:webgpu
npm run benchmark:renderer:webgl
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