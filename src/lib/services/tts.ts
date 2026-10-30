import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { Readable } from 'node:stream';
import type { Voice } from '../types';

export const MAX_AD_SECONDS = 110;
export const AUDIO_BITRATE = 48_000;

const VOICES: Record<Voice, { voice: string; rate: string }> = {
  SOLEMN: { voice: 'es-CO-GonzaloNeural', rate: '-12%' },
  CHEERFUL: { voice: 'es-CO-SalomeNeural', rate: '+4%' },
  NEUTRAL: { voice: 'es-MX-JorgeNeural', rate: '0%' },
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

export interface SynthesizedAudio {
  buffer: Buffer;
  durationSec: number;
  contentType: string;
}

export async function synthesize(text: string, voice: Voice): Promise<SynthesizedAudio> {
  const plain = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) throw new Error('No hay texto para convertir en voz.');

  const config = VOICES[voice];
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 15_000, synthesisTimeoutMs: 45_000 });
  try {
    await tts.setMetadata(config.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(plain), { rate: config.rate });
    const buffer = await drain(audioStream);
    if (buffer.length === 0) throw new Error('El servicio de voz devolvió un audio vacío.');
    const durationSec = Math.max(1, Math.ceil((buffer.length * 8) / AUDIO_BITRATE));
    return { buffer, durationSec, contentType: 'audio/mpeg' };
  } finally {
    tts.close();
  }
}
