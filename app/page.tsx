import { Hero } from "@/components/sections/Hero";
import { Manifesto } from "@/components/sections/Manifesto";
import { Stats } from "@/components/sections/Stats";
import { Clients } from "@/components/sections/Clients";
import { Founder } from "@/components/sections/Founder";
import { Gallery } from "@/components/sections/Gallery";
import { Process } from "@/components/sections/Process";
import { Services } from "@/components/sections/Services";
import { Contact } from "@/components/sections/Contact";
import { ProofTable } from "@/components/proof-table/ProofTable";

/**
 * The home page, in order: Intro · About our agency · Experience / projects / clients · Clients & collaborations ·
 * About the founder · Our projects slate (the Proof Table) · Project gallery · How we work · Our services · Contact us.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <Manifesto />
      <Stats />
      <Clients />
      <Founder />
      <ProofTable />
      <Gallery />
      <Process />
      <Services />
      <Contact />
    </>
  );
}
