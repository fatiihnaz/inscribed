import { withCms } from "inscribed";
import Inner from "./Inner";
import Section from "./Section";

function Page() {
  return (
    <Section>
      <Inner />
    </Section>
  );
}

export default withCms("/children", Page);
