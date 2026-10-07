// A collection detail route: its first argument is a key, not a slug.
export const generateMetadata = CollectionItem.metadata("news", { title: "title" });

export default function News() {
  return <main />;
}
