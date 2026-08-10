import Hero from "./components/Hero";
import Shared from "./components/Shared";
import Wrapper from "./passthrough/Wrapper";

export default function Home() {
  return (
    <main>
      <EditableRegion blockPath="hero.title" blockType="LongText" defaultValue="Welcome" />
      <Hero />
      <Shared />
      <Wrapper />
    </main>
  );
}
