import type { ImageRawData, ModelCreateOptions, OcrResult } from '#common/types'
import { Detection, Recognition } from './models'

export class Ocr {
  static async create(options: ModelCreateOptions = {}) {
    const detection = await Detection.create(options)
    const recognition = await Recognition.create(options)
    return new Ocr({ detection, recognition })
  }

  /** Tracks every live Ocr instance so releaseAll() can clean them all up. */
  static #instances = new Set<Ocr>()

  /**
   * Releases all live Ocr instances, freeing the underlying ONNX Runtime
   * InferenceSession native objects. Call this before process.exit() to
   * prevent the onnxruntime-node thread-pool mutex crash.
   */
  static async releaseAll() {
    const instances = [...Ocr.#instances]
    Ocr.#instances.clear()
    await Promise.all(instances.map(instance => instance.release()))
  }

  #detection: Detection
  #recognition: Recognition

  constructor({
    detection,
    recognition,
  }: {
    detection: Detection
    recognition: Recognition
  }) {
    this.#detection = detection
    this.#recognition = recognition
    Ocr.#instances.add(this)
  }

  async detect(image: string | ImageRawData, options = {}): Promise<OcrResult> {
    const { lineImages, resizedImageWidth, resizedImageHeight } = await this.#detection.run(image, options)
    const { texts, rawTexts } = await this.#recognition.run(lineImages, options)
    return {
      texts,
      rawTexts,
      resizedImageWidth,
      resizedImageHeight,
    }
  }

  /**
   * Releases the detection and recognition ONNX Runtime sessions. Prefer
   * calling the static Ocr.releaseAll() at shutdown instead of calling this
   * directly, so that all instances are covered.
   */
  async release() {
    Ocr.#instances.delete(this)
    await Promise.all([this.#detection.release(), this.#recognition.release()])
  }
}
