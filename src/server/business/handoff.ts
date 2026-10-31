// The one message the agent may send without a grounded answer.
//
// The routing floor (confidence >= 50 plus a verified citation, PRD §4.3) still
// decides whether a *generated* answer may be sent. Below that floor the agent
// sends this fixed acknowledgement instead: every fact in it comes from the
// business record, never from a model, so it cannot hallucinate a price, a
// policy or a promise.

export interface HandoffBusiness {
  name: string;
  escalationEmail: string;
  escalationPhone: string;
}

export function handoffReply(business: HandoffBusiness): string {
  const email = business.escalationEmail.trim();
  const phone = business.escalationPhone.trim();
  const contact = [email, phone].filter((value) => value.length > 0).join(" or ");
  const reach = contact.length > 0 ? ` You can also reach us at ${contact}.` : "";
  return `Thanks for reaching out to ${business.name}. I've passed your message to our team.${reach} A person will reply here shortly.`;
}
