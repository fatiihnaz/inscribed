export default function Shared() {
  useCmsBlock("shared.meta", { blockType: "LongText", defaultValue: "m" });
  return <EditableRegion blockPath="shared.cta" blockType="LongText" defaultValue="x" />;
}
