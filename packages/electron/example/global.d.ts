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

type BenchmarkMode = 'main' | 'renderer' | 'compare'

type BenchmarkRequest = {
  imageUrl: string
  iterations: number
}

type BenchmarkResult = {
  mode: 'renderer'
  iterations: number
  averageDurationMs: number
  durationsMs: number[]
  texts: DetectionLine[]
}