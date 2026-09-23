export default function Home() {
  return (
    <main>
      {/* every key a language: one seed per language */}
      <EditableRegion blockPath="hero.title" blockType="ShortText" defaultValue={{ tr: "Merhaba", en: "Hello" }} />

      {/* the map skips a language -> warns, and that language takes the tr value */}
      <EditableRegion blockPath="hero.body" blockType="LongText" defaultValue={{ tr: "Uzun metin" }} />

      {/* the map skips the default language too -> warns, nothing to fall back on */}
      <EditableRegion blockPath="hero.note" blockType="ShortText" defaultValue={{ en: "Note" }} />

      {/* a typo'd key -> warns, syncs as one object seed for every language */}
      <EditableRegion blockPath="hero.kicker" blockType="ShortText" defaultValue={{ tr: "Ust baslik", eng: "Kicker" }} />

      {/* an Image's own keys are not languages, so the shape stays the value */}
      <EditableRegion blockPath="hero.image" blockType="Image" defaultValue={{ src: "/hero.png", alt: "" }} />

      {/* ...and the same type nests under the language when it is a map */}
      <EditableRegion
        blockPath="hero.poster"
        blockType="Image"
        defaultValue={{ tr: { src: "/tr.png", alt: "Afis" }, en: { src: "/en.png", alt: "Poster" } }}
      />

      <EditableChoice
        blockPath="hero.state"
        defaultValue={{ tr: "taslak", en: "draft" }}
        source={{ kind: "static", values: ["taslak", "draft"] }}
      />

      <EditableList
        blockPath="hero.cards"
        itemSchema={{ title: { blockType: "ShortText", defaultValue: "" } }}
        defaultValue={{ tr: [{ title: "Kart" }], en: [{ title: "Card" }] }}
      />
    </main>
  );
}
