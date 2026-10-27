import { Hero } from "@/components/sections/Hero";
import { Manifesto } from "@/components/sections/Manifesto";
import { Services } from "@/components/sections/Services";
import { Gallery } from "@/components/sections/Gallery";
import { Process } from "@/components/sections/Process";
import { Making } from "@/components/sections/Making";
import { About } from "@/components/sections/About";
import { Clients } from "@/components/sections/Clients";
import { Contact } from "@/components/sections/Contact";
import { ProofTable } from "@/components/proof-table/ProofTable";

/**
 * The home page, in order: Intro · About the agency (statement + what we do) · Our projects ·
 * How we work · BTS / making stills · About us · Our clients · Collaborations (the Proof Table) · Contact us.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <Manifesto />
      <Services />
      <Gallery />
      <Process />
      <Making />
      <About />
      <Clients />
      <ProofTable />
      <Contact />
    </>
  );
}
