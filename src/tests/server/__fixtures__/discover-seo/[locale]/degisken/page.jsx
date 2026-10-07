const SLUG = "/degisken";

// Not a literal: cms-sync cannot read it, and says so.
export const generateMetadata = CmsPage.metadata(SLUG);

export default function Variable() {
  return <main />;
}
