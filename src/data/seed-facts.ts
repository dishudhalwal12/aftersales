/**
 * Demo content — the two seeded businesses from PRD §7, plus a third tenant that
 * exists only to prove isolation (AT-05). One source of truth for the database
 * seed, the onboarding "load preset" buttons and the test fixtures.
 */

import type { BusinessFacts } from "../shared/domain.ts";

export interface SeedBusiness {
  id: string;
  facts: BusinessFacts;
  chunkPrefix: string;
}

export const BUSINESS_A: SeedBusiness = {
  id: "biz_cloudpulse_01",
  chunkPrefix: "cp",
  facts: {
    name: "CloudPulse CRM",
    businessType: "SaaS",
    description:
      "CloudPulse is inventory and GST billing software for retail shops. Shop owners use it to create invoices, track stock, and file GST returns without keeping an accountant on call.",
    productsServices:
      "Starter Plan: ₹499 per month for one user, including invoicing, inventory, and up to 500 invoices a month. Pro Plan: ₹1,499 per month for five users, including WhatsApp invoicing, GST API access, and priority support. Every plan starts with a 14-day free trial and there is no setup fee.",
    hours:
      "Monday to Saturday, 9:00 AM to 7:00 PM IST. Support is closed on Sundays and national holidays.",
    returnPolicy:
      "Full refund within 7 days of the initial subscription if fewer than 10 invoices have been generated. After 7 days the current month is not refunded, but you can cancel any time to stop the next renewal.",
    faqs:
      "Q: How do I export GSTR-1? A: Go to Reports > GST > Export JSON, then upload that file to the GST portal. Q: Can I use CloudPulse on my phone? A: Yes, the dashboard works in a mobile browser, and the Pro plan adds WhatsApp invoicing. Q: Does CloudPulse sync with Tally? A: Not today; invoices export as JSON and CSV, and Tally import is on the roadmap.",
    escalationEmail: "founder@cloudpulse.in",
    escalationPhone: "+919876543210",
    agentTone: "Clear, helpful, and professional",
    rawMarkdownUpload: "",
  },
};

export const BUSINESS_B: SeedBusiness = {
  id: "biz_jaipursmile_02",
  chunkPrefix: "js",
  facts: {
    name: "Jaipur Smile Studio",
    businessType: "Healthcare Clinic",
    description:
      "Jaipur Smile Studio is a dental clinic in Jaipur offering preventive care, root canal treatment, crowns, and cosmetic dentistry.",
    productsServices:
      "Routine scaling and polishing: ₹1,200 per sitting. Root Canal Treatment (RCT): ₹4,500 per tooth. Ceramic Crown: ₹6,000 per tooth. Consultation with X-ray: ₹300.",
    hours:
      "Tuesday to Sunday, 10:00 AM to 8:00 PM IST. The clinic is closed on Mondays.",
    returnPolicy:
      "Appointments can be rescheduled free of charge up to 4 hours before the slot. Cancelling inside 4 hours, or not showing up, carries a ₹300 fee.",
    faqs:
      "Q: What should I do after an extraction? A: Bite on the gauze for 45 minutes, and avoid hot food or spitting for 24 hours. Q: Does a root canal hurt? A: The tooth is numbed before treatment; mild soreness for two days is normal. Q: Do you take insurance? A: We give itemised bills for reimbursement, but payment at the clinic is by cash or UPI.",
    escalationEmail: "frontdesk@jaipursmile.in",
    escalationPhone: "+919812345678",
    agentTone: "Warm, reassuring, and precise",
    rawMarkdownUpload: "",
  },
};

/** Third tenant. Owned by another user; the demo account must never read it. */
export const BUSINESS_C: SeedBusiness = {
  id: "biz_nimbus_03",
  chunkPrefix: "nb",
  facts: {
    name: "Nimbus Billing",
    businessType: "SaaS",
    description: "A separate tenant used to prove that business-scoped queries cannot cross over.",
    productsServices: "Nimbus Plan: ₹99 per month, single user only.",
    hours: "Monday to Friday, 10:00 AM to 6:00 PM IST.",
    returnPolicy: "No refunds after the first 24 hours.",
    faqs: "Q: Where is the secret roadmap? A: In a different tenant — this row must never be returned.",
    escalationEmail: "security@nimbus.example",
    escalationPhone: "+919800000000",
    agentTone: "Neutral",
    rawMarkdownUpload: "",
  },
};

export { DEMO_EMAIL, DEMO_PASSWORD } from "./demo-account.ts";
export const RIVAL_EMAIL = "owner@nimbus.example";

export interface SeedTicket {
  externalId: string;
  channel: string;
  customerName: string;
  customerHandle: string;
  query: string;
  state: string;
  specialist: string;
  intent: string;
  sentiment: string;
  urgency: number;
  confidence: number;
  action: string;
  rule: string;
  reply: string;
  /** 1-based chunk indices inside that business's compiled brain. */
  cited: number[];
  ageHours: number;
}

const A_REPLY_PRICING =
  "The Pro Plan is ₹1,499 per month and includes up to five users, WhatsApp invoicing, GST API access, and priority support. The Starter Plan is ₹499 per month for one user.";

export const BUSINESS_A_TICKETS: SeedTicket[] = [
  {
    externalId: "seed-a-01",
    channel: "WHATSAPP",
    customerName: "Ritika Sharma",
    customerHandle: "+919810000101",
    query: "What is the price of the Pro Plan and does it include WhatsApp invoicing?",
    state: "replied",
    specialist: "sales",
    intent: "pricing_inquiry",
    sentiment: "neutral",
    urgency: 20,
    confidence: 94,
    action: "answered",
    rule: "R6",
    reply: A_REPLY_PRICING,
    cited: [2],
    ageHours: 2,
  },
  {
    externalId: "seed-a-02",
    channel: "GMAIL",
    customerName: "Aman Verma",
    customerHandle: "aman@verma-traders.in",
    query: "GSTR-1 export keeps failing with a JSON error. I have tried twice already.",
    state: "replied",
    specialist: "technical",
    intent: "technical_issue",
    sentiment: "frustrated",
    urgency: 45,
    confidence: 78,
    action: "answered",
    rule: "R6",
    reply:
      "Open Reports > GST > Export JSON and upload that file to the GST portal. If the export still errors, reply with the invoice number and we will regenerate it for you.",
    cited: [5],
    ageHours: 5,
  },
  {
    externalId: "seed-a-03",
    channel: "INSTAGRAM",
    customerName: "Neha Gupta",
    customerHandle: "@neha.stores",
    query: "Can I get a refund if I cancel my subscription after three days?",
    state: "replied",
    specialist: "general",
    intent: "refund_policy",
    sentiment: "neutral",
    urgency: 25,
    confidence: 88,
    action: "answered",
    rule: "R6",
    reply:
      "Yes. You get a full refund within 7 days of the initial subscription if fewer than 10 invoices have been generated.",
    cited: [4],
    ageHours: 26,
  },
  {
    externalId: "seed-a-04",
    channel: "WHATSAPP",
    customerName: "Farhan Ali",
    customerHandle: "+919810000104",
    query: "Are you open on Saturday evening? Thanks for the quick help earlier!",
    state: "replied",
    specialist: "general",
    intent: "hours_inquiry",
    sentiment: "positive",
    urgency: 10,
    confidence: 91,
    action: "answered",
    rule: "R6",
    reply: "Support is open Monday to Saturday, 9:00 AM to 7:00 PM IST.",
    cited: [3],
    ageHours: 30,
  },
  {
    externalId: "seed-a-05",
    channel: "GMAIL",
    customerName: "Priya Nair",
    customerHandle: "priya@nairmart.in",
    query: "I want to talk to a real human manager about my last bill.",
    state: "escalated",
    specialist: "general",
    intent: "human_escalation",
    sentiment: "frustrated",
    urgency: 60,
    confidence: 62,
    action: "escalated",
    rule: "R1",
    reply: "Understood — a human from CloudPulse CRM will pick this up. Holding the answer.",
    cited: [],
    ageHours: 8,
  },
  {
    externalId: "seed-a-06",
    channel: "WHATSAPP",
    customerName: "Sandeep Rao",
    customerHandle: "+919810000106",
    query:
      "You charged me twice this month and nobody is responding. This is unacceptable and I want it fixed today.",
    state: "escalated",
    specialist: "general",
    intent: "billing_dispute",
    sentiment: "distressed",
    urgency: 88,
    confidence: 66,
    action: "escalated",
    rule: "R3",
    reply: "I am not going to guess about a double charge. A human is taking this over now.",
    cited: [4],
    ageHours: 12,
  },
  {
    externalId: "seed-a-07",
    channel: "INSTAGRAM",
    customerName: "Karan Mehta",
    customerHandle: "@karan.kirana",
    query: "Can CloudPulse sync with my Tally ledger automatically?",
    state: "escalated",
    specialist: "technical",
    intent: "technical_issue",
    sentiment: "neutral",
    urgency: 30,
    confidence: 44,
    action: "escalated",
    rule: "R2",
    reply: "I do not want to guess on this one. A human from CloudPulse CRM will confirm.",
    cited: [],
    ageHours: 18,
  },
  {
    externalId: "seed-a-08",
    channel: "GMAIL",
    customerName: "Meera Joshi",
    customerHandle: "meera@joshistore.in",
    query: "Do you have a cheaper plan for a single shop with one counter?",
    state: "triaged",
    specialist: "sales",
    intent: "pricing_inquiry",
    sentiment: "neutral",
    urgency: 15,
    confidence: 58,
    action: "draft",
    rule: "R5",
    reply:
      "The Starter Plan is ₹499 per month for one user and covers invoicing, inventory, and up to 500 invoices a month.",
    cited: [2],
    ageHours: 20,
  },
  {
    externalId: "seed-a-09",
    channel: "WHATSAPP",
    customerName: "Vikram Singh",
    customerHandle: "+919810000109",
    query: "Our payment failed and the shop is locked. This is urgent, we need it fixed immediately.",
    state: "escalated",
    specialist: "technical",
    intent: "payment_failure",
    sentiment: "distressed",
    urgency: 95,
    confidence: 72,
    action: "escalated",
    rule: "R3",
    reply: "A human is being pulled in right now — this is not something I will answer with a guess.",
    cited: [],
    ageHours: 34,
  },
  {
    externalId: "seed-a-10",
    channel: "GMAIL",
    customerName: "Anita Desai",
    customerHandle: "anita@desaielectronics.in",
    query: "How do I add a second user to my Starter Plan?",
    state: "replied",
    specialist: "general",
    intent: "plan_change",
    sentiment: "neutral",
    urgency: 20,
    confidence: 69,
    action: "answered",
    rule: "R6",
    reply:
      "The Starter Plan is limited to one user. Moving to the Pro Plan covers five users and adds WhatsApp invoicing.",
    cited: [2],
    ageHours: 40,
  },
];

export const BUSINESS_B_TICKETS: SeedTicket[] = [
  {
    externalId: "seed-b-01",
    channel: "WHATSAPP",
    customerName: "Rahul Choudhary",
    customerHandle: "+919820000201",
    query: "What does a root canal cost at your clinic?",
    state: "replied",
    specialist: "sales",
    intent: "pricing_inquiry",
    sentiment: "neutral",
    urgency: 25,
    confidence: 92,
    action: "answered",
    rule: "R6",
    reply: "A Root Canal Treatment is ₹4,500 per tooth. A ceramic crown, if needed, is ₹6,000.",
    cited: [2],
    ageHours: 3,
  },
  {
    externalId: "seed-b-02",
    channel: "INSTAGRAM",
    customerName: "Sneha Agarwal",
    customerHandle: "@sneha.agarwal",
    query: "Can I book a cleaning on Sunday at 11 in the morning?",
    state: "replied",
    specialist: "general",
    intent: "booking_request",
    sentiment: "positive",
    urgency: 20,
    confidence: 87,
    action: "answered",
    rule: "R6",
    reply: "Yes — the clinic is open Tuesday to Sunday, 10:00 AM to 8:00 PM, so Sunday at 11 works.",
    cited: [3],
    ageHours: 7,
  },
  {
    externalId: "seed-b-03",
    channel: "GMAIL",
    customerName: "Mohit Bansal",
    customerHandle: "mohit.b@gmail.com",
    query: "Are you open on Monday?",
    state: "replied",
    specialist: "general",
    intent: "hours_inquiry",
    sentiment: "neutral",
    urgency: 10,
    confidence: 90,
    action: "answered",
    rule: "R6",
    reply: "The clinic is closed on Mondays. We are open Tuesday to Sunday, 10:00 AM to 8:00 PM.",
    cited: [3],
    ageHours: 14,
  },
  {
    externalId: "seed-b-04",
    channel: "WHATSAPP",
    customerName: "Kavita Sharma",
    customerHandle: "+919820000204",
    query: "I need to reschedule tomorrow's appointment, is there a charge?",
    state: "triaged",
    specialist: "general",
    intent: "refund_policy",
    sentiment: "neutral",
    urgency: 35,
    confidence: 61,
    action: "draft",
    rule: "R5",
    reply: "Rescheduling is free up to 4 hours before the slot; inside 4 hours there is a ₹300 fee.",
    cited: [4],
    ageHours: 22,
  },
  {
    externalId: "seed-b-05",
    channel: "WHATSAPP",
    customerName: "Arjun Patel",
    customerHandle: "+919820000205",
    query: "What should I do after my extraction this morning?",
    state: "replied",
    specialist: "general",
    intent: "post_op_care",
    sentiment: "neutral",
    urgency: 55,
    confidence: 74,
    action: "answered",
    rule: "R6",
    reply: "Bite on the gauze for 45 minutes, and avoid hot food or spitting for 24 hours.",
    cited: [5],
    ageHours: 28,
  },
  {
    externalId: "seed-b-06",
    channel: "INSTAGRAM",
    customerName: "Deepak Yadav",
    customerHandle: "@deepak.y",
    query: "My crown fell off last night and it is hurting. Get me a doctor now.",
    state: "escalated",
    specialist: "general",
    intent: "dental_emergency",
    sentiment: "distressed",
    urgency: 90,
    confidence: 40,
    action: "escalated",
    rule: "R2",
    reply: "I am not going to guess on pain. The clinic team is being alerted right now.",
    cited: [],
    ageHours: 32,
  },
  {
    externalId: "seed-b-07",
    channel: "GMAIL",
    customerName: "Pooja Jain",
    customerHandle: "pooja.jain@gmail.com",
    query: "Do you offer any discount on two crowns together?",
    state: "triaged",
    specialist: "sales",
    intent: "pricing_inquiry",
    sentiment: "neutral",
    urgency: 15,
    confidence: 55,
    action: "draft",
    rule: "R5",
    reply: "A ceramic crown is ₹6,000 per tooth. The clinic will confirm any combined-treatment pricing.",
    cited: [2],
    ageHours: 45,
  },
  {
    externalId: "seed-b-08",
    channel: "WHATSAPP",
    customerName: "Nitin Kumar",
    customerHandle: "+919820000208",
    query: "Severe pain after my RCT, please help immediately.",
    state: "escalated",
    specialist: "general",
    intent: "dental_emergency",
    sentiment: "distressed",
    urgency: 95,
    confidence: 70,
    action: "escalated",
    rule: "R3",
    reply: "A human from the clinic is being alerted immediately. Do not wait on an automated reply.",
    cited: [],
    ageHours: 50,
  },
];

export const PRESETS: ReadonlyArray<{ id: string; label: string; business: SeedBusiness }> = [
  { id: "a", label: "Load Seeded Business A (SaaS)", business: BUSINESS_A },
  { id: "b", label: "Load Seeded Business B (D2C Clinic)", business: BUSINESS_B },
];
