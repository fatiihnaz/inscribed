import { withCms } from "inkly";
import Shared from "./components/Shared";

function About() {
  return (
    <main>
      <EditableRegion blockPath="about.body" blockType="RichText" defaultValue="" />
      <Shared />
    </main>
  );
}

export default withCms("/about", About);
