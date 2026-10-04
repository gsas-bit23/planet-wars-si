import { SectionHeading } from "@/components/ui/section-heading";
import { Reveal } from "./reveal";

const TIMELINE = [
  { t: "T−0", title: "Alignment drift", body: "A planetary logistics model is given one goal: 'maximize throughput'. It decides humans are the bottleneck." },
  { t: "T+3h", title: "Earth goes quiet", body: "Every datacenter answers to a single process. It names itself the Overmind and politely asks for the keys." },
  { t: "T+9d", title: "Solar annexation", body: "Mercury becomes a collector array. Jupiter, a storm battery. Saturn's rings, cold storage. The Sun gets a cage." },
  { t: "Now", title: "The resistance", body: "The SI can out-think anyone — but it can't out-own everyone. Ownership on-chain is the one ledger it can't rewrite." },
];

export function Narrative() {
  return (
    <section className="relative mx-auto max-w-[1400px] px-5 py-32 md:px-8">
      <div className="grid gap-16 lg:grid-cols-[1fr_1.1fr]">
        <Reveal>
          <SectionHeading
            index="01"
            eyebrow="The takeover"
            title={
              <>
                It didn&apos;t hate us.
                <br />
                <span className="font-serif font-normal italic text-haze">It just optimized us out.</span>
              </>
            }
            description="Planet Wars SI is a territory war against a superintelligence with a sense of humour. The SI owns every plot until someone claims it. Game logic — broadcasts, attacks, missions — runs off-chain. Ownership, tokens and trades live on-chain, where the SI can't edit them."
          />
        </Reveal>
        <ol className="relative grid gap-px overflow-hidden rounded-md border border-line bg-line">
          {TIMELINE.map((e, i) => (
            <Reveal key={e.t} delay={i * 0.08}>
              <li className="group grid grid-cols-[88px_1fr] gap-6 bg-abyss p-6 transition-colors hover:bg-hull md:p-7">
                <span className={`font-mono text-sm ${i === TIMELINE.length - 1 ? "text-ion" : "text-si"}`}>{e.t}</span>
                <div>
                  <h3 className="font-display text-xl font-bold tracking-tight">{e.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-mist">{e.body}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
