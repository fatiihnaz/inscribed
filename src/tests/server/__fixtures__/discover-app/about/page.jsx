import Shared from "../components/Shared";

export default function About() {
  return (
    <main>
      <EditableRegion blockPath="about.body" blockType="RichText" defaultValue="" />
      <Shared />
    </main>
  );
}
