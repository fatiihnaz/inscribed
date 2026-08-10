import Hero from "../components/Hero";

export default function Page() {
  return (
    <main>
      <EditableRegion blockPath="home.title" blockType="LongText" defaultValue="hi" />
      <Hero />
    </main>
  );
}
