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

export function passwordProblem(password: string): string | null {
  if (password.length < 12) return 'La contraseña debe tener al menos 12 caracteres.';
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return 'La contraseña debe incluir una mayúscula, una minúscula, un número y un símbolo.';
  }
  if (password.length > 72) return 'La contraseña no puede pasar de 72 caracteres.';
  return null;
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
