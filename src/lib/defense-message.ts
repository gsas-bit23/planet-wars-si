/** Canonical message a player signs to commit a territory to an SI defense. */
export function defenseMessage(p: { attackId: string; tokenId: string; wallet: string; issuedAt: string }) {
  return [
    "Planet Wars SI — Defense Order",
    "",
    `Attack: ${p.attackId}`,
    `Territory: ${p.tokenId}`,
    `Wallet: ${p.wallet}`,
    `Issued: ${p.issuedAt}`,
    "",
    "Signing is free and does not send a transaction.",
  ].join("\n");
}
