export default function OrganizationSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Repetitor18",
    "url": "https://app.repetitor18.ru",
    "logo": "https://app.repetitor18.ru/logo.png"
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  )
}
