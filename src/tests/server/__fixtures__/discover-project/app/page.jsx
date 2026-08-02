import { withCms } from "inscribed";
import Hero from "../components/Hero";

function Page() {
  return (
    <main>
      <EditableRegion blockPath="home.title" blockType="LongText" defaultValue="hi" />
      <Hero />
    </main>
  );
}

export default withCms("/", Page);
