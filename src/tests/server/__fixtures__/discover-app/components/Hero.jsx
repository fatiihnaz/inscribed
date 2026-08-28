import Shared from "./Shared";

export default function Hero() {
  return (
    <section>
      <EditableRegion blockPath="hero.subtitle" blockType="LongText" defaultValue="sub" />
      <EditableList
        blockPath="hero.cards"
        defaultValue={[]}
        itemSchema={{
          title: { blockType: "LongText", defaultValue: "" },
          count: { blockType: "Number", defaultValue: 0 },
          // The vocabulary is the drawer's, so it must not reach the manifest.
          state: {
            blockType: "Select",
            defaultValue: "draft",
            source: { kind: "static", values: ["draft", "live"] },
          },
        }}
      />
      <CmsGroup name="cta">
        <EditableRegion blockPath="label" blockType="LongText" defaultValue="Buy" />
      </CmsGroup>
      <Shared />
    </section>
  );
}
