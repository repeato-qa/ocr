import { InferenceSession } from 'onnxruntime-common'
import { ImageRawBase as ImageRaw } from '#common/backend/ImageRawBase'
import type { splitIntoLineImages } from '#common/backend/splitIntoLineImages'

export { FileUtilsBase as FileUtils } from '#common/backend/FileUtilsBase'
export { ImageRaw, InferenceSession }

export type SplitIntoLineImages = typeof splitIntoLineImages

export type ReshapeOptions = {
  mean?: number[]
  std?: number[]
}

export type ImageRawData = {
  data: Uint8Array | Uint8ClampedArray // Uint8Array: Node Buffer, Uint8ClampedArray: Web ImageData
  width: number
  height: number
}

export type ModelData = {
  data: number[] | Uint8Array
  width: number
  height: number
}

export type Size = {
  width: number
  height: number
}

export type SizeOption = {
  width?: number
  height?: number
  fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside'
}

export type LineImage = {
  image: ImageRaw
  // TODO: [top, right, bottom, left], top: [x,y]
  box: number[][]
}

export type Point = [x: number, y: number]

export type Box = [Point, Point, Point, Point]

export type Region = {
  left: number
  top: number
  width: number
  height: number
}

export type Line = {
  text: string
  mean: number
  box?: Box
}

export type OcrResult = {
  texts: Line[]
  rawTexts: Line[]
  resizedImageWidth: number
  resizedImageHeight: number
}

export type Dictionary = string[]

export type BinarySource = string | URL | ArrayBuffer | Uint8Array

export type TextSource = string | URL | ArrayBuffer | Uint8Array

export interface ModelBaseConstructorArg {
  model: InferenceSession
  options: ModelBaseOptions
}

export interface ModelBaseOptions {
  isDebug?: boolean
  debugOutputDir?: string
}

export interface ModelCreateOptions extends ModelBaseOptions {
  models?: {
    detectionPath: BinarySource
    recognitionPath: BinarySource
    dictionaryPath: TextSource
  }
  onnxOptions?: InferenceSession.SessionOptions
}
