// One line of transport truth per channel.
//
// The channel cards used to print a hardcoded "simulated inbox (no live Baileys
// session in this deployment)" next to a CONNECTED badge. Copy is evidence here:
// it must follow the stored channel status, not the deployment's mood.

const SIMULATED: Readonly<Record<string, string>> = {
  whatsapp: "simulated inbox (no device linked)",
  instagram: "simulated inbox (Instagram needs an approved Meta app)",
  gmail: "simulated inbox (Gmail OAuth not configured)",
};

const LIVE: Readonly<Record<string, string>> = {
  whatsapp: "linked device · live Baileys session",
  instagram: "Instagram account authorized through Meta",
  gmail: "Gmail mailbox authorized",
};

export function transportFor(provider: string, status: string): string {
  const key = provider.trim().toLowerCase();
  const simulated = SIMULATED[key];
  if (!simulated) return "unknown transport";
  if (status === "CONNECTED") return LIVE[key] ?? simulated;
  if (status === "UNAVAILABLE") return "not configured";
  return simulated;
}
