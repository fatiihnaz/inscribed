import Shared from "./Shared";

export default function Hero() {
  return (
    <section>
      <EditableRegion blockPath="hero.subtitle" blockType="Text" defaultValue="sub" />
      <EditableList
        blockPath="hero.cards"
        defaultValue={[]}
        itemSchema={{
          title: { blockType: "Text", defaultValue: "" },
          count: { blockType: "Number", defaultValue: 0 },
        }}
      />
      <CmsGroup name="cta">
        <EditableRegion blockPath="label" blockType="Text" defaultValue="Buy" />
      </CmsGroup>
      <Shared />
    </section>
  );
}
