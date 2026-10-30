import mammoth from 'mammoth/mammoth.browser'
import { docxRawToText } from '@core/import/docx'

/** Word document → plain song text (one paragraph per line, chord columns and tabs kept). */
export async function extractDocx(file: Blob): Promise<string> {
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return docxRawToText(value)
}
