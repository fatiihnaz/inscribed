export default function Shared() {
  useCmsBlock("shared.meta", { blockType: "Text", defaultValue: "m" });
  return <EditableRegion blockPath="shared.cta" blockType="Text" defaultValue="x" />;
}
