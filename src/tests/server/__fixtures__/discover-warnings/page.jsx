const slugVar = "/computed";

export default function Bad() {
  return (
    <main>
      {/* Valid, so the snapshot has a real manifest to anchor the warnings against. */}
      <EditableRegion blockPath="ok.region" blockType="LongText" defaultValue="ok" />

      {/* missing blockPath */}
      <EditableRegion blockType="LongText" defaultValue="x" />
      {/* missing blockType */}
      <EditableRegion blockPath="a.b" defaultValue="x" />
      {/* missing defaultValue -> warns but still syncs, seeded with "" */}
      <EditableRegion blockPath="a.c" blockType="LongText" />
      {/* non-literal blockPath */}
      <EditableRegion blockPath={slugVar} blockType="LongText" defaultValue="x" />

      {/* list without itemSchema */}
      <EditableList blockPath="a.d" />

      {/* unsupported scope -> warning, treated page-scoped */}
      <EditableRegion blockPath="a.e" blockType="LongText" defaultValue="x" scope="weird" />

      {/* CmsGroup without a static name -> transparent wrapper warning */}
      <CmsGroup>
        <EditableRegion blockPath="a.g" blockType="LongText" defaultValue="x" />
      </CmsGroup>

      {/* useCmsBlock metadata not a static object */}
      {useCmsBlock("a.h", metaVar)}
      {/* useCmsBlock metadata missing defaultValue */}
      {useCmsBlock("a.i", { blockType: "LongText" })}
    </main>
  );
}
