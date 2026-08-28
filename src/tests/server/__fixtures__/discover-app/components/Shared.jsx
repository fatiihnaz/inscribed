export default function Shared() {
  useCmsBlock("shared.meta", { blockType: "LongText", defaultValue: "m" });
  return (
    <>
      <EditableRegion blockPath="shared.cta" blockType="LongText" defaultValue="x" />
      <EditableRegion blockPath="shared.tags" blockType="StringArray" defaultValue={[]}>
        {(tags) => <span>{tags.length}</span>}
      </EditableRegion>
      <EditableChoice blockPath="shared.durum" defaultValue="taslak"
                      source={{ kind: "static", values: ["taslak", "yayında"] }} />
    </>
  );
}
