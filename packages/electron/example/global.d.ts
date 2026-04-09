export {}

declare global {
  interface Window {
    electronOcr: {
      detectInMain: (imagePath: string) => Promise<BenchmarkDetection>
      loadAsset: (name: string) => Promise<Uint8Array>
      openImage: () => Promise<{ imagePath: string; imageUrl: string } | null>
    }
    runRendererBenchmark: (request: BenchmarkRequest) => Promise<BenchmarkResult>
  }
}

type DetectionLine = {
  text: string
  mean: number
}

type BenchmarkDetection = {
  durationMs: number
  texts: DetectionLine[]
}

type BenchmarkMode = 'main' | 'renderer' | 'renderer-wasm' | 'renderer-webgl' | 'renderer-webgpu' | 'compare'

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