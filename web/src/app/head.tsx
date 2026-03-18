export default function Head() {
  return (
    <>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />

      {/* PageSpeed: ранний preconnect/dns-prefetch */}
      <link rel="preconnect" href="https://api.app.repetitor18.ru" crossOrigin="" />
      <link rel="dns-prefetch" href="//api.app.repetitor18.ru" />
      <link rel="preconnect" href="https://mc.yandex.ru" crossOrigin="" />
      <link rel="dns-prefetch" href="//mc.yandex.ru" />

      {/* hreflang (сайт RU) */}
      <link rel="alternate" hrefLang="ru" href="https://app.repetitor18.ru/" />
      <link rel="alternate" hrefLang="x-default" href="https://app.repetitor18.ru/" />
    </>
  );
}
