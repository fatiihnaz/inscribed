// Leading [locale] drops only when the caller passes `locales`; the inner
// [id] is part of the manifest template either way.
export default function NewsDetail() {
  return <EditableRegion blockPath="news.heading" blockType="LongText" defaultValue="n" />;
}
