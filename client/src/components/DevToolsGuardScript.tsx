import Script from 'next/script';

const ENABLED = process.env.NEXT_PUBLIC_BLOCK_DEVTOOLS !== 'false';

export default function DevToolsGuardScript() {
  if (!ENABLED) return null;

  return (
    <Script id="devtools-guard" src="/devtools-guard.js" strategy="beforeInteractive" />
  );
}
