// Another object's metadata call is not the page's.
const og = { metadata: (path) => path };
export const share = og.metadata("/share.png");

export const generateMetadata = CmsPage.metadata("/yabanci");

export default function Foreign() {
  return <main />;
}
