// The call wrapped in a generateMetadata of the page's own.
export async function generateMetadata(props, parent) {
  const meta = await CmsPage.metadata("/sarili", { title: "Sarılı" })(props, parent);
  return { ...meta, keywords: ["a"] };
}

export default function Wrapped() {
  return <main />;
}
