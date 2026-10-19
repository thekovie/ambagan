interface CspOptions {
  /** Fresh per request. Next adds it to its own scripts when it sees it in the request's CSP header. */
  nonce: string;
  isDev: boolean;
  /** Only upgrade to https when the app is actually served over it (plain http works for local trials). */
  isHttps: boolean;
}

/**
 * Content-Security-Policy for every page. Nothing loads from another origin: the OCR engine, fonts and
 * language data are all self-hosted. Scripts need this request's nonce (`strict-dynamic` lets those scripts load
 * their own chunks). Styles allow inline because React sets style attributes; style injection is a much smaller
 * risk than script injection.
 */
export function buildCsp({ nonce, isDev, isHttps }: CspOptions): string {
  const directives = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets the OCR engine compile WebAssembly; it does not allow eval() of strings.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (isHttps) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
