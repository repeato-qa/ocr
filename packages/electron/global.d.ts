export {}

declare global {
  interface Window {
    electronOcr: {
      detectInMain: (imagePath: string, mode?: MainBenchmarkMode) => Promise<BenchmarkDetection>
      loadAsset: (name: string) => Promise<Uint8Array>
      loadImageDataUrl: (imagePath: string) => Promise<string>
      openImage: () => Promise<{ imagePath: string; imageUrl: string } | null>
    }
    runRendererBenchmark: (request: BenchmarkRequest) => Promise<BenchmarkResult>
  }
}

type DetectionLine = {
  text: string
  mean: number
  box?: [[number, number], [number, number], [number, number], [number, number]]
}

type BenchmarkDetection = {
  durationMs: number
  texts: DetectionLine[]
  rawTexts: DetectionLine[]
}

type MainBenchmarkMode = 'main' | 'main-webgpu' | 'main-coreml'

type BenchmarkMode = MainBenchmarkMode | 'renderer' | 'renderer-wasm' | 'renderer-webgl' | 'renderer-webgpu' | 'compare'

type BenchmarkRequest = {
  imagePath?: string
  imageUrl: string
  iterations: number
  mode: 'renderer-wasm' | 'renderer-webgl' | 'renderer-webgpu'
}

type BenchmarkResult = {
  mode: 'renderer-wasm' | 'renderer-webgl' | 'renderer-webgpu'
  iterations: number
  warmupIterations: number
  coldStartDurationMs: number
  steadyStateAverageDurationMs: number
  averageDurationMs: number
  steadyStateDurationsMs: number[]
  durationsMs: number[]
  texts: DetectionLine[]
}