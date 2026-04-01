import { FileUtilsBase } from '@gutenye/ocr-common'
import type { TextSource } from '@gutenye/ocr-common'

export class FileUtils extends FileUtilsBase {
  static async read(url: TextSource) {
    if (url instanceof Uint8Array) {
      return new TextDecoder().decode(url)
    }
    if (url instanceof ArrayBuffer) {
      return new TextDecoder().decode(new Uint8Array(url))
    }
    const res = await fetch(url)
    return await res.text()
  }
}
