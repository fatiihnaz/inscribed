import { withCms } from "inscribed";
import Hero from "@/components/Hero";
import Ghost from "@/components/DoesNotExist";

function Page() {
  return (
    <main>
      <Hero />
      <Ghost />
    </main>
  );
}

export default withCms("/aliased", Page);
