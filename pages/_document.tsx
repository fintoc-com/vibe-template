import { Head, Html, Main, NextScript } from 'next/document';

import { geistMono, geistSans } from '~/lib/fonts';

export default function Document() {
  return (
    <Html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <Head />
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
