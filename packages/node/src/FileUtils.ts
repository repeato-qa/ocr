import fs from 'node:fs/promises'
import { FileUtilsBase } from '@gutenye/ocr-common'
import type { TextSource } from '@gutenye/ocr-common'

export class FileUtils extends FileUtilsBase {
  static async read(path: TextSource) {
    if (typeof path === 'string') {
      return await fs.readFile(path, 'utf8')
    }
    if (path instanceof URL) {
      return await fs.readFile(path, 'utf8')
    }
    return new TextDecoder().decode(path instanceof Uint8Array ? path : new Uint8Array(path))
  }
}
