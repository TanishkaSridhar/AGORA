import { createHash } from 'node:crypto'
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { HttpError, json, route } from '@/lib/http'

const body = z.object({ text: z.string().trim().min(1).max(600), language: z.string().max(10).default('en-IN') })
const state = globalThis as typeof globalThis & { agoraSpeech?: Map<string, Buffer> }
const cache = (state.agoraSpeech ??= new Map())

/** Wraps raw 16-bit mono PCM in a WAV header so browsers can play it. */
function wav(pcm: Buffer, rate: number) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/**
 * Read-aloud for citizens who cannot read: Gemini text-to-speech in the citizen's language.
 * The browser uses its built-in voice first and calls this only when no voice exists for the language.
 */
export const POST = route(async (request: Request) => {
  const { text, language } = body.parse(await json(request))
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new HttpError(503, 'Speech is not configured')
  const key = createHash('sha1')
    .update(language + '|' + text)
    .digest('hex')
  let audio = cache.get(key)
  if (!audio) {
    const ai = new GoogleGenAI({ apiKey })
    let lastError: unknown
    for (const model of (process.env.GEMINI_TTS_MODELS ?? 'gemini-3.8-flash-tts,gemini-2.5-flash-preview-tts').split(
      ',',
    )) {
      try {
        const response = await ai.models.generateContent({
          model: model.trim(),
          contents: [
            {
              role: 'user',
              parts: [
                { text: `Read this aloud slowly and clearly in the language it is written in (${language}): ${text}` },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            abortSignal: AbortSignal.timeout(20_000),
          },
        })
        const part = response.candidates?.[0]?.content?.parts?.find(item => item.inlineData?.data)?.inlineData
        if (!part?.data) throw new Error('No audio returned')
        const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? '')?.[1] ?? 24000)
        audio = wav(Buffer.from(part.data, 'base64'), rate)
        break
      } catch (error) {
        lastError = error
      }
    }
    if (!audio) {
      console.warn(
        'Speech synthesis unavailable',
        lastError instanceof Error ? lastError.message.slice(0, 120) : lastError,
      )
      throw new HttpError(503, 'Read-aloud is temporarily unavailable')
    }
    if (cache.size > 300) cache.delete(cache.keys().next().value!)
    cache.set(key, audio)
  }
  return new Response(new Uint8Array(audio), {
    headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=86400' },
  })
})
