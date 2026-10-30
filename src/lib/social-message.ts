// The provider-independent message shape handed to the existing triage
// pipeline. Email, Messenger, and Instagram adapters all produce this type, so
// the AI agent never needs channel-specific branches.

import type { Business } from "@prisma/client";

import type { TriageChannel } from "./triage";

export type NormalizedSocialChannel = Extract<TriageChannel, "GMAIL" | "FACEBOOK" | "INSTAGRAM">;

export type NormalizedSocialMessage = {
  businessId: string;
  channel: NormalizedSocialChannel;
  connectionId: string;
  messageId: string;
  sender: string;
  recipient: string;
  subject?: string;
  text: string;
  timestamp?: string;
  /** Provider thread/recipient metadata needed to reply in the same thread. */
  replyContext?: {
    threadId?: string;
    inReplyTo?: string;
    references?: string;
    providerRecipientId?: string;
  };
};

export function normalizedToTriageInput(
  business: Business,
  message: NormalizedSocialMessage,
  customerName?: string
) {
  return {
    business,
    query: message.text,
    channel: message.channel,
    customerName: customerName ?? message.sender,
    customerHandle: message.sender,
    externalMessageId: message.messageId,
  };
}
