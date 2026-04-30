import type { InferenceSession as InferenceSessionCommon, Tensor } from 'onnxruntime-common'
import { FileUtils, InferenceSession, defaultModels } from '#common/backend'
import type { BinarySource, Box, Dictionary, Line, LineImage, ModelBaseConstructorArg, ModelCreateOptions } from '#common/types'
import { assert } from '../assert'
import { ModelBase } from './ModelBase'

export class Recognition extends ModelBase {
  #dictionary: Dictionary

  static async create({ models, onnxOptions = {}, ...restOptions }: ModelCreateOptions) {
    const recognitionPath = models?.recognitionPath || defaultModels?.recognitionPath
    assert(recognitionPath, 'recognitionPath is required')
    const dictionaryPath = models?.dictionaryPath || defaultModels?.dictionaryPath
    assert(dictionaryPath, 'dictionaryPath is required')
    const model = await InferenceSession.create(normalizeBinarySource(recognitionPath), onnxOptions)
    const dictionaryText = await FileUtils.read(dictionaryPath)
    const dictionary = [...dictionaryText.split('\n'), ' ']
    return new Recognition({ model, options: restOptions }, dictionary)
  }

  constructor(options: ModelBaseConstructorArg, dictionary: Dictionary) {
    super(options)
    this.#dictionary = dictionary
  }

  async run(lineImages: LineImage[], { onnxOptions = {} }: { onnxOptions?: InferenceSessionCommon.RunOptions } = {}) {
    const modelDatas = await Promise.all(
      // Detect text from each line image
      lineImages.map(async (lineImage, index) => {
        // Resize Image to 48px height
        //  - height must <= 48
        //  - height: 48 is more accurate then 40, but same as 30
        const image = await (lineImage.image as any).resize({
          height: 48,
        })
        this.debugImage(lineImage.image, `out9-line-${index}.jpg`)
        this.debugImage(image, `out9-line-${index}-resized.jpg`)

        // transform image data to model data
        const modelData = this.imageToInput(image, {
          // mean: [0.5, 0.5, 0.5],
          // std: [0.5, 0.5, 0.5],
        })
        return modelData
      }),
    )

    const allLines: Line[] = []
    // console.time('Recognition')
    for (const modelData of modelDatas) {
      // Run model for each line image
      const output = await this.runModel({ modelData, onnxOptions })
      // use Dictoinary to decode output to text
      const lines = await this.decodeText(output)
      allLines.unshift(...lines)
    }
    // console.timeEnd('Recognition')
    const result = buildRecognitionLines({ lines: allLines, lineImages })
    return result
  }

  decodeText(output: Tensor) {
    const data = output
    const predLen = data.dims[2]
    const line: Line[] = []
    let ml = data.dims[0] - 1
    for (let l = 0; l < data.data.length; l += predLen * data.dims[1]) {
      const predsIdx: number[] = []
      const predsProb: number[] = []

      for (let i = l; i < l + predLen * data.dims[1]; i += predLen) {
        const tmpArr = data.data.slice(i, i + predLen) as Float32Array
        const tmpMax = tmpArr.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY)
        const tmpIdx = tmpArr.indexOf(tmpMax)
        predsProb.push(tmpMax)
        predsIdx.push(tmpIdx)
      }
      line[ml] = decode(this.#dictionary, predsIdx, predsProb, true)
      ml--
    }
    return line
  }
}

function decode(dictionary: string[], textIndex: number[], textProb: number[], isRemoveDuplicate: boolean) {
  const ignoredTokens = [0]
  const charList = []
  const confList = []
  for (let idx = 0; idx < textIndex.length; idx++) {
    if (textIndex[idx] in ignoredTokens) {
      continue
    }
    if (isRemoveDuplicate) {
      if (idx > 0 && textIndex[idx - 1] === textIndex[idx]) {
        continue
      }
    }
    charList.push(dictionary[textIndex[idx] - 1])
    if (textProb) {
      confList.push(textProb[idx])
    } else {
      confList.push(1)
    }
  }
  let text = ''
  let mean = 0
  if (charList.length) {
    text = charList.join('')
    let sum = 0
    confList.forEach((item) => {
      sum += item
    })
    mean = sum / confList.length
  }
  return { text, mean }
}

/**
 * Preserves the raw recognition boxes and also derives merged text lines for
 * callers that still expect sentence-like output.
 */
function buildRecognitionLines({
  lines,
  lineImages,
}: {
  lines: Line[]
  lineImages: LineImage[]
}) {
  const rawTexts = lines
    .map((line, index) => {
      const lineImage = lineImages[lines.length - index - 1]
      return {
        ...line,
        box: cloneBox(lineImage.box as Box),
      }
    })
    .filter((line) => line.mean >= 0.5)

  return {
    rawTexts,
    texts: mergeNearbyLines(rawTexts),
  }
}

/**
 * Merges raw recognition segments back into row-level text lines to preserve
 * the previous `texts` behavior for existing callers.
 */
function mergeNearbyLines(lines: Line[]) {
  const outputLines: Line[] = []
  const groupedLines = groupLinesByMidline(lines)

  for (const lineGroup of groupedLines) {
    outputLines.push({
      mean: lineGroup.reduce((sum, line) => sum + line.mean, 0) / lineGroup.length,
      text: lineGroup.map((line) => line.text).join(' '),
      box: mergeBoxes(lineGroup.map((line) => line.box).filter((box): box is Box => Boolean(box))),
    })
  }
  return outputLines
}

function calculateAverageHeight(boxes: Box[]): number {
  if (boxes.length === 0) {
    return 0
  }

  let totalHeight = 0
  for (const box of boxes) {
    const [[, y1], , [, y2]] = box
    const height = y2 - y1
    totalHeight += height
  }
  return totalHeight / boxes.length
}

/**
 * Groups raw recognition segments into visual rows by comparing their midlines.
 */
function groupLinesByMidline(lines: Line[]): Line[][] {
  const linesWithBoxes = lines.filter((line): line is Line & { box: Box } => Boolean(line.box))
  const averageHeight = calculateAverageHeight(linesWithBoxes.map((line) => line.box))
  const result: Line[][] = []

  for (const line of linesWithBoxes) {
    const [[, y1], , [, y2]] = line.box
    const midline = (y1 + y2) / 2
    const group = result.find((groupLines) => {
      const firstBox = groupLines[0].box!
      const [[, groupY1], , [, groupY2]] = firstBox
      const groupMidline = (groupY1 + groupY2) / 2
      return Math.abs(groupMidline - midline) < averageHeight / 2
    })

    if (group) {
      group.push(line)
    } else {
      result.push([line])
    }
  }

  for (const group of result) {
    group.sort((left, right) => left.box![0][0] - right.box![0][0])
  }

  result.sort((top, bottom) => top[0].box![0][1] - bottom[0].box![0][1])

  return result
}

function mergeBoxes(boxes: Box[]): Box | undefined {
  if (boxes.length === 0) {
    return undefined
  }

  const xValues = boxes.flatMap((box) => box.map(([x]) => x))
  const yValues = boxes.flatMap((box) => box.map(([, y]) => y))
  const left = Math.min(...xValues)
  const right = Math.max(...xValues)
  const top = Math.min(...yValues)
  const bottom = Math.max(...yValues)

  return [[left, top], [right, top], [right, bottom], [left, bottom]]
}

function cloneBox(box: Box): Box {
  return box.map(([x, y]) => [x, y]) as Box
}

function normalizeBinarySource(source: BinarySource) {
  if (source instanceof URL) {
    return source.toString()
  }
  return source
}
