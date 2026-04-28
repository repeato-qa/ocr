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
- main thread CPU
- main thread WebGPU (experimental; may fail on the current OCR models/runtime)
- main thread CoreML (macOS)

WebGL stays available only as an explicit experimental compatibility check because the current OCR models fail on that backend.

Explicit modes:

```sh
npm run benchmark:main
npm run benchmark:main:webgpu
npm run benchmark:main:coreml
npm run benchmark:renderer:wasm
npm run benchmark:renderer:webgpu
npm run benchmark:renderer:webgl
```

## Findings

Current findings from the bundled sample assets on macOS:

- main thread CPU is the most reliable path
- renderer WebGPU is competitive and sometimes slightly faster than main thread CPU
- main thread WebGPU is currently not usable for these OCR models because ONNX Runtime fails during WGSL validation
- main thread CoreML is currently slower than CPU on the tested assets and degrades OCR quality on some images

Average timing from the four bundled sample images with 1 warmup run and 3 steady-state runs per asset:

- main thread CPU: cold-start about 468ms, steady-state about 393ms
- renderer WebGPU: cold-start about 518ms, steady-state about 390ms
- main thread CoreML: cold-start about 2422ms, steady-state about 1602ms

Interpretation:

- GPU offload is not automatically faster for this OCR pipeline because model startup, graph partitioning, CPU preprocessing/postprocessing, and provider handoff cost can dominate
- CoreML currently offloads only part of the graph, so it behaves like a mixed CPU and accelerator path rather than a full replacement for CPU inference
- renderer WebGPU does not require the native `onnxruntime-node` Windows runtime DLL staging used by the main-thread package path; it uses `onnxruntime-web` assets instead

## Production Recommendation

The simplest production comparison is not separate packages and not separate production builds.

Recommended approach:

- keep `@repeato/ocr` as the main-thread CPU path
- add one internal experiment switch in Repeato Studio that routes OCR calls either to:
	- main-thread CPU via `@repeato/ocr`
	- renderer WebGPU via the existing browser package path (`@gutenye/ocr-browser` today)
- persist the choice in settings or behind a feature flag
- log timing, OCR text count, and failure rate from real user assets

Why this is the simplest option:

- one production build instead of two
- no split release and support matrix
- much easier A/B testing on the same app version
- renderer WebGPU packaging stays simpler on Windows because it does not depend on `onnxruntime-node` DLL staging

What we do not recommend right now:

- shipping main-thread CoreML as the default path
- introducing separate public import points like `@repeato/ocr/renderer` and `@repeato/ocr/main` before there is evidence the product needs them
- maintaining separate production builds just to compare providers

If product code wants a cleaner abstraction later, prefer an app-level adapter such as `createOcrProvider('main-cpu' | 'renderer-webgpu')` over new package names first. That keeps the experiment local to Repeato Studio and avoids turning a temporary benchmark choice into a published API commitment.

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