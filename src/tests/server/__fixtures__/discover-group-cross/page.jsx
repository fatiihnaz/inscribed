import Hero from "./Hero";
import Plain from "./Plain";

export default function Page() {
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
