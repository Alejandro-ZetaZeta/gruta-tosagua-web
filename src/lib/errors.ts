/** Traduce los errores de validación de Astro a un mensaje entendible. */
export function friendlyError(error: { message?: string } | undefined): string {
  const message = error?.message ?? '';
  if (!message) return '';
  if (message.includes('Failed to validate')) {
    return 'Revise los datos: hay un campo con un formato que no reconocemos.';
  }
  return message;
}
