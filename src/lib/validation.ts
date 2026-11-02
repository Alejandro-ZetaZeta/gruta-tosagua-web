const EC_PHONE = /^(?:09\d{8}|0[2-7]\d{7})$/;
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,24}$/;

/** Acepta móviles 09… y fijos 02…–07…, con o sin +593. Guarda solo dígitos locales. */
export function normalizeEcuadorPhone(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('593')) digits = `0${digits.slice(3)}`;
  return EC_PHONE.test(digits) ? digits : null;
}

export function isValidEcuadorPhone(value: string): boolean {
  return normalizeEcuadorPhone(value) !== null;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (email.length > 254) return false;

  const at = email.indexOf('@');
  if (at < 1) return false;
  const local = email.slice(0, at);
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return false;
  }

  const domain = email.slice(at + 1);
  if (domain.split('.').some((label) => !label || label.startsWith('-') || label.endsWith('-'))) {
    return false;
  }

  return EMAIL.test(email);
}
