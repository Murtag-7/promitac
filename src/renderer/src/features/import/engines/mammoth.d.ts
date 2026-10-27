/** The prebuilt browser bundle of mammoth (no types shipped for it) – only what we use. */
declare module 'mammoth/mammoth.browser' {
  interface MammothMessage {
    type: 'warning' | 'error'
    message: string
  }
  interface MammothResult {
    value: string
    messages: MammothMessage[]
  }
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>
  }
  export default mammoth
}
