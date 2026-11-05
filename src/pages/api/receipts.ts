import type { APIRoute } from 'astro';
import { getSettings } from '../../lib/settings';
import { getOrderForUser } from '../../lib/services/orders';
import { attachReceipt } from '../../lib/services/payments';
import { rateLimit } from '../../lib/rate-limit';

export const prerender = false;

function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json');
}

function failure(request: Request, orderCode: string, message: string, status: number): Response {
  if (wantsJson(request)) {
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/seguimiento?codigo=${encodeURIComponent(orderCode)}&error=${encodeURIComponent(message)}`,
    },
  });
}

export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  let orderCode = '';
  try {
    const userId = locals.userId;
    if (!userId) {
      if (wantsJson(request)) {
        return new Response(JSON.stringify({ ok: false, error: 'Inicie sesión para subir su comprobante.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 303, headers: { Location: '/login' } });
    }

    if (!(await rateLimit(`receipt:${clientAddress ?? 'local'}`, 15, 60 * 60 * 1000))) {
      return failure(request, orderCode, 'Recibimos muchos intentos seguidos. Espere unos minutos.', 429);
    }

    const form = await request.formData();
    orderCode = String(form.get('orderCode') ?? '').trim().toUpperCase();
    const reference = String(form.get('reference') ?? '').trim();
    const files = form.getAll('receipt').filter((value): value is File => value instanceof File && value.size > 0);
    const file = files[0];

    if (!orderCode) return failure(request, orderCode, 'Falta el código del pedido.', 400);
    if (!file) return failure(request, orderCode, 'Elija una foto o un PDF de su comprobante.', 400);

    const order = await getOrderForUser(orderCode, userId);
    if (!order) return failure(request, orderCode, 'No encontramos ese pedido en su cuenta.', 404);

    const settings = await getSettings();
    await attachReceipt(order, file, settings, reference || null);

    if (wantsJson(request)) {
      return new Response(JSON.stringify({ ok: true, orderCode: order.order_code }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, {
      status: 303,
      headers: { Location: `/gracias?codigo=${encodeURIComponent(order.order_code)}` },
    });
  } catch (error) {
    console.error('[receipts]', error);
    const raw = error instanceof Error ? error.message : '';
    const unsafe = /duplicate key|violates|constraint|SQL|postgrest|storage|bucket|relation|column|SLOT_/i;
    const message =
      raw && !unsafe.test(raw)
        ? raw
        : 'No pudimos recibir el comprobante. Intente de nuevo o comuníquese con la encargada.';
    return failure(request, orderCode, message, 400);
  }
};
