# Repeato OCR

> [Demo](https://gutenye-ocr.netlify.app/) | [Roadmap](https://github.com/users/gutenye/projects/5/views/4)

**an OCR Javascript library for Node.js and Electron main processes** 

Based on [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) and [ONNX Runtime](https://github.com/microsoft/onnxruntime), supports PP-OCRv4 model

## Getting Started

### Node

> [Example](./packages/node/example/README.md)

```ts
bun add @repeato/ocr
import Ocr from '@repeato/ocr'
const ocr = await Ocr.create()
const result = await ocr.detect('a.jpg')
```

### Electron

> [Electron App](./packages/electron/README.md)

Use `@repeato/ocr/electron` in the Electron main process.
The repository still contains renderer-side example code for the packaged Electron smoke app, but there is no separate browser package in the Repeato publish flow.

Package export notes:

- `import Ocr from '@repeato/ocr'` and `import Ocr from '@repeato/ocr/electron'` are the preferred ESM entrypoints.
- The published package also exposes explicit CommonJS `require()` entrypoints for both `@repeato/ocr` and `@repeato/ocr/electron`.
- Those `require()` exports exist so Electron apps that externalize OCR instead of bundling it, such as Repeato-Studio, receive a stable CommonJS shape with `create()` directly on the loaded module.
- The Electron app in this repository bundles local source files with esbuild aliases, so its import path is simpler than an application that loads the published package through webpack externals.

### React Native

> [Example](./packages/react-native/example/README.md)

```ts
bun add @gutenye/ocr-react-native
import Ocr from '@gutenye/ocr-react-native'
const ocr = await Ocr.create()
const result = await ocr.detect('a.jpg')
```

### C++

> [Example](./packages/react-native/cpp/example/README.md)

```cpp
#include "native-ocr.h"
NativeOcr* ocr = new NativeOcr(..)
auto result = ocr->detect("a.jpg");
```

### API Reference

```ts
Ocr.create({
  models?: {
    detectionPath: string
    recognitionPath: string
    dictionaryPath: string
  },
  isDebug?: boolean
  debugOutputDir?: string // Node only
  recognitionImageMaxSize?: number // RN only
  detectionThreshold?: number // RN only
  detectionBoxThreshold?: number // RN only
  detectionUnclipRatiop?: number // RN only
  detectionUseDilate?: boolean // RN only
  detectionUsePolygonScore?: boolean // RN only
  useDirectionClassify?: boolean // RN only
  onnxOptions?: {}       // Node only. Pass to ONNX Runtime
}): Promise<Ocr>

ocr.detect(imagePath: string | {data: Uint8Array | Uint8ClampedArray | Buffer, width: number, height: number}, {
  onnxOptions?: {}     // Node only. Pass to ONNX Runtime
}): Promise<{texts: TextLine[], resizedImageWidth: number, resizedImageHeight: number}>

TextLine {
  text: string
  score: number
  frame: { top, left, width, height }
}

```

## Development

- Requires Git LFS to clone the repo

```sh
brew install git-lfs 
git clone git@github.com:gutenye/ocr.git
```

- [Development](docs/Development.md)

## Publishing

- GitHub Actions publishes only `@repeato/ocr` from `packages/node`
- Release publication happens after the packaged Electron smoke matrix passes
- A local `npm publish` is not required to create the package on npm if the `@repeato` scope and token permissions are already set up correctly

## Related Projects

| Name                                                           | Platforms | Note                            |
| -------------------------------------------------------------- | --------- | ------------------------------- |
| [eSearch-OCR](https://github.com/xushengfeng/eSearch-OCR)      | Electron  |                                 |
| [paddleocr-onnx](https://github.com/backrunner/paddleocr-onnx) | Node      | Recogination part is incomplete |
| [ocrjs](https://github.com/SOVLOOKUP/ocrjs)                    | Node      | Recogination part is incomplete |
| [Paddle-Lite-Demo](https://github.com/PaddlePaddle/Paddle-Lite-Demo) | Mobile, C++ | |
