import { withCms } from "inscribed";
import Hero from "../components/Hero";

function Page() {
  return (
    <main>
      <EditableRegion blockPath="home.title" blockType="Text" defaultValue="hi" />
      <Hero />
    </main>
  );
}

export default withCms("/", Page);
