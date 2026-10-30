import { CATEGORY_META, type Category, type ExtractedReceipt, type Voice } from '../types';
import { serverEnv } from '../env';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 25_000;

export function aiEnabled(): boolean {
  return Boolean(serverEnv('OPENROUTER_API_KEY', import.meta.env.OPENROUTER_API_KEY));
}

async function chat(body: Record<string, unknown>): Promise<string | null> {
  const key = serverEnv('OPENROUTER_API_KEY', import.meta.env.OPENROUTER_API_KEY);
  if (!key) return null;
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': serverEnv('PUBLIC_SITE_URL', import.meta.env.PUBLIC_SITE_URL) || 'https://lagruta.local',
        'X-Title': 'La Gruta',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn('[ai] OpenRouter respondió', response.status);
      return null;
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.warn('[ai] No disponible:', error instanceof Error ? error.message : error);
    return null;
  }
}

function parseJson(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

const SYSTEM_PROMPT = `Eres el redactor de anuncios de "La Gruta", un espacio comunitario en Ecuador que emite anuncios por megafonía.
Escribe en español latinoamericano neutro, cálido, respetuoso y sencillo. Contexto de duelo y fe: nada de humor ni urgencia agresiva.
Reglas:
- Usa solo los datos que dio el cliente. No inventes nombres, lugares, horas ni parentescos.
- El texto se leerá en voz alta: frases cortas, sin siglas raras, sin viñetas ni emojis.
- Máximo 250 palabras (unos 110 segundos de lectura pausada).
- Empieza de forma natural según la categoría y termina con una frase breve de cierre.
- Si falta un dato importante, no lo inventes: redacta con lo que hay.`;

export interface DraftScript {
  script: string;
  voice: Voice;
  ai: boolean;
}

export function fallbackScript(rawIdea: string, category: Category): DraftScript {
  const cleaned = rawIdea.replace(/\s+/g, ' ').trim();
  const closing = CATEGORY_META[category].closing;
  let script = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (!/[.!?]$/.test(script)) script += '.';
  const words = script.split(/\s+/);
  if (words.length > 220) script = `${words.slice(0, 220).join(' ')}.`;
  if (closing && !script.toLowerCase().includes(closing.toLowerCase().slice(0, 20))) {
    script = `${script} ${closing}`;
  }
  return { script, voice: CATEGORY_META[category].voice, ai: false };
}

export async function draftScript(
  rawIdea: string,
  category: Category,
  clientName: string,
  targetDate: string,
): Promise<DraftScript> {
  if (!aiEnabled()) return fallbackScript(rawIdea, category);

  const content = await chat({
    model: serverEnv('OPENROUTER_TEXT_MODEL', import.meta.env.OPENROUTER_TEXT_MODEL) || 'google/gemini-2.5-flash',
    temperature: 0.4,
    max_tokens: 700,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Categoría: ${CATEGORY_META[category].label}
Cliente: ${clientName || 'sin nombre'}
Día de emisión: ${targetDate}
Idea del cliente: ${rawIdea}

Devuelve JSON con esta forma exacta:
{"script": "texto listo para leer", "voice": "SOLEMN" | "CHEERFUL" | "NEUTRAL"}
La voz debe ir con la categoría: sepelios, misas y rezos = SOLEMN; saludos = CHEERFUL; promociones y otros = NEUTRAL.`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'ad_script',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['script', 'voice'],
          properties: {
            script: { type: 'string' },
            voice: { type: 'string', enum: ['SOLEMN', 'CHEERFUL', 'NEUTRAL'] },
          },
        },
      },
    },
  });

  const parsed = parseJson(content);
  const script = typeof parsed?.script === 'string' ? parsed.script.trim() : '';
  if (!script) return fallbackScript(rawIdea, category);

  const voice = (['SOLEMN', 'CHEERFUL', 'NEUTRAL'] as const).includes(parsed?.voice as Voice)
    ? (parsed?.voice as Voice)
    : CATEGORY_META[category].voice;

  return { script: script.slice(0, 1800), voice, ai: true };
}

const VISION_PROMPT = `Eres un extractor de datos de comprobantes de transferencia bancaria de Ecuador.
Devuelve SOLO un objeto JSON. No opines sobre la validez del pago ni apruebes nada.
Si un dato no se lee con claridad, usa null. No inventes números.
Campos:
- monto: número (sin símbolo de moneda, punto decimal) o null
- fecha: "AAAA-MM-DD" o null
- hora: "HH:MM" o null
- banco: nombre del banco de origen o null
- numero_comprobante: referencia o número de comprobante o null
- cuenta_destino: cuenta o alias de destino o null
- concepto: texto del concepto o descripción o null`;

export async function extractReceipt(blob: Blob): Promise<ExtractedReceipt | null> {
  if (!aiEnabled()) return null;
  if (!blob.type.startsWith('image/')) return null;

  const buffer = Buffer.from(await blob.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) return null;
  const dataUrl = `data:${blob.type};base64,${buffer.toString('base64')}`;

  const content = await chat({
    model: serverEnv('OPENROUTER_VISION_MODEL', import.meta.env.OPENROUTER_VISION_MODEL) || 'google/gemini-2.5-flash',
    temperature: 0,
    max_tokens: 500,
    messages: [
      { role: 'system', content: VISION_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extrae los datos de este comprobante.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'receipt_data',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['monto', 'fecha', 'hora', 'banco', 'numero_comprobante', 'cuenta_destino', 'concepto'],
          properties: {
            monto: { type: ['number', 'null'] },
            fecha: { type: ['string', 'null'] },
            hora: { type: ['string', 'null'] },
            banco: { type: ['string', 'null'] },
            numero_comprobante: { type: ['string', 'null'] },
            cuenta_destino: { type: ['string', 'null'] },
            concepto: { type: ['string', 'null'] },
          },
        },
      },
    },
  });

  const parsed = parseJson(content);
  if (!parsed) return null;

  return {
    monto: typeof parsed.monto === 'number' ? parsed.monto : null,
    fecha: typeof parsed.fecha === 'string' ? parsed.fecha : null,
    hora: typeof parsed.hora === 'string' ? parsed.hora : null,
    banco: typeof parsed.banco === 'string' ? parsed.banco : null,
    numero_comprobante:
      typeof parsed.numero_comprobante === 'string' && parsed.numero_comprobante.trim()
        ? parsed.numero_comprobante.trim()
        : null,
    cuenta_destino: typeof parsed.cuenta_destino === 'string' ? parsed.cuenta_destino : null,
    concepto: typeof parsed.concepto === 'string' ? parsed.concepto : null,
  };
}
