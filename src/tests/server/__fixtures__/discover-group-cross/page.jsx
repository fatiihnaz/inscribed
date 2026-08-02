import { withCms } from "inscribed";
import Hero from "./Hero";
import Plain from "./Plain";

function Page() {
  return (
    <main>
      <CmsGroup name="hero">
        <Hero />
        <Plain />
      </CmsGroup>
      <CmsGroup name="footer">
        <Hero />
      </CmsGroup>
      <Hero />
    </main>
  );
}

export default withCms("/cross", Page);
