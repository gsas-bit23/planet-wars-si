import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[80dvh] max-w-3xl flex-col items-center justify-center gap-6 px-5 text-center">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-si">Error 404 · Sector redacted</span>
      <h1 className="font-display text-6xl font-bold tracking-[-0.04em] md:text-8xl">Lost in the void.</h1>
      <p className="max-w-md text-haze">
        The SI deleted this page. Or it never existed. Either way, the SI would like you to stop looking.
      </p>
      <Button asChild size="lg">
        <Link href="/">Return to orbit</Link>
      </Button>
    </section>
  );
}
