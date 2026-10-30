import { tesseractBlocksToWords, type TesseractBlockLike } from './tesseractResult'

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 })

const blocks: TesseractBlockLike[] = [
  {
    paragraphs: [
      {
        lines: [
          {
            words: [
              {
                text: 'G',
                confidence: 91.5,
                bbox: box(70, 10, 80, 25),
                symbols: [{ text: 'G', bbox: box(70, 10, 80, 25) }]
              }
            ]
          },
          {
            words: [
              {
                text: 'první',
                confidence: 88,
                bbox: box(50, 40, 100, 60),
                symbols: [
                  { text: 'p', bbox: box(50, 44, 60, 60) },
                  { text: 'r', bbox: box(60, 44, 67, 56) },
                  { text: 'v', bbox: box(67, 44, 77, 56) },
                  { text: 'n', bbox: box(77, 44, 88, 56) },
                  { text: 'í', bbox: box(88, 40, 100, 56) }
                ]
              },
              { text: '  ', confidence: 10, bbox: box(100, 40, 105, 60), symbols: [] },
              { text: 'sloky', confidence: 40, bbox: box(110, 40, 160, 60), symbols: null }
            ]
          }
        ]
      }
    ]
  },
  { paragraphs: [{ lines: [{ words: [{ text: ' Amen ', confidence: 97, bbox: box(0, 100, 40, 120) }] }] }] }
]

describe('tesseractBlocksToWords', () => {
  it('flattens blocks → paragraphs → lines → words with boxes and symbols', () => {
    const words = tesseractBlocksToWords(blocks)
    expect(words.map((w) => w.text)).toEqual(['G', 'první', 'sloky', 'Amen'])
    expect(words[0]).toEqual({
      text: 'G',
      confidence: 91.5,
      bbox: box(70, 10, 80, 25),
      symbols: [{ text: 'G', x0: 70, x1: 80 }]
    })
    expect(words[1]!.symbols!.map((s) => [s.text, s.x0, s.x1])).toEqual([
      ['p', 50, 60],
      ['r', 60, 67],
      ['v', 67, 77],
      ['n', 77, 88],
      ['í', 88, 100]
    ])
    expect(words[2]!.symbols).toBeUndefined()
    expect(words[3]!.bbox).toEqual(box(0, 100, 40, 120))
  })

  it('maps coordinates back by dividing by the scale', () => {
    const [g] = tesseractBlocksToWords(blocks, { scale: 2 })
    expect(g!.bbox).toEqual(box(35, 5, 40, 12.5))
    expect(g!.symbols).toEqual([{ text: 'G', x0: 35, x1: 40 }])
  })

  it('accepts null/undefined (no blocks requested or blank page)', () => {
    expect(tesseractBlocksToWords(null)).toEqual([])
    expect(tesseractBlocksToWords(undefined)).toEqual([])
  })
})
