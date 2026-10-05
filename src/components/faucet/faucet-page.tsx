import { PageHeader } from "@/components/ui/page-header";
import { Faucet } from "@/components/faucet/faucet";

/** Testnet-only faucet page body. Imported lazily so mainnet builds never ship this copy. */
export default function FaucetPageBody() {
  return (
    <>
      <PageHeader eyebrow="Testnet faucet · rate-limited per wallet" title={<>Free <span className="font-serif font-normal italic text-ion">ammunition.</span></>} description="Claim test PWSI once every 24 hours per wallet. Test tokens have no monetary value. You'll also need a little testnet ETH for gas." />
      <Faucet />
    </>
  );
}
