import { withCms } from "inscribed";
import Hero from "./Hero";
import Plain from "./Plain";

function Page() {
  return (
    <CmsGroup name="hero">
      <Hero />
      <Plain />
    </CmsGroup>
  );
}

export default withCms("/cross", Page);
