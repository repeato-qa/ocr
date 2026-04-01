import type { TextSource } from '#common/types'

export class FileUtilsBase {
  static async read(path: TextSource): Promise<string> {
    throw new Error('Not implemented')
  }
}
