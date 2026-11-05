import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

const isProd = process.env.NODE_ENV === 'production';
const env = loadEnv(isProd ? 'production' : 'development', process.cwd(), '');
const siteUrl = process.env.PUBLIC_SITE_URL || env.PUBLIC_SITE_URL;

// En producción, confiar en X-Forwarded-For solo si el Host es el dominio real.
// Así el rate limit por IP funciona detrás de Nginx/Caddy y no cuenta a todos igual.
const allowedDomains = [];
if (isProd && siteUrl) {
  try {
    const url = new URL(siteUrl);
    const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (local) {
      console.warn('[config] PUBLIC_SITE_URL es localhost; use el dominio real para confiar en X-Forwarded-For.');
    } else {
      const protocol = url.protocol.replace(':', '');
      allowedDomains.push({ hostname: url.hostname, protocol });
      if (!url.hostname.startsWith('www.')) {
        allowedDomains.push({ hostname: `www.${url.hostname}`, protocol });
      }
    }
  } catch {
    console.warn('[config] PUBLIC_SITE_URL no es una URL válida; se ignora para allowedDomains.');
  }
}

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  devToolbar: { enabled: false },
  server: { port: 4321 },
  // Prism usa clases; Shiki inyecta style= y choca con la CSP.
  markdown: { syntaxHighlight: 'prism' },
  security: {
    checkOrigin: true,
    allowedDomains,
    actionBodySizeLimit: 12 * 1024 * 1024,
    csp: {
      algorithm: 'SHA-256',
      scriptDirective: {
        resources: ["'self'"],
      },
      styleDirective: {
        resources: [
          "'self'",
          'https://fonts.googleapis.com',
          // Los atributos style= del diseño no se pueden hashear.
          { resource: "'unsafe-inline'", kind: 'attribute' },
        ],
      },
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "frame-src 'none'",
        "base-uri 'self'",
        "object-src 'none'",
        "manifest-src 'self'",
        "media-src 'self' https:",
        "worker-src 'self'",
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
