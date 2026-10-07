export const generateMetadata = CmsPage.metadata("/hakkinda", {
  title: { tr: "Hakkında", en: "About" },
  image: { src: "/og.png", alt: "Bina" },
  noindex: true,
});

export default function About() {
  return <EditableRegion blockPath="body" blockType="LongText" defaultValue="Metin" />;
}
