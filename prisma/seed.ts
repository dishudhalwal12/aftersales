import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  DEMO_USER_EMAIL,
  DEMO_USER_NAME,
  DEMO_USER_PASSWORD,
} from "../src/lib/constants";
import { buildBusinessBrain, type BusinessFacts } from "../src/lib/rag";

const prisma = new PrismaClient();

const RIVAL_EMAIL = "rival@sphinx.demo";
const RIVAL_PASSWORD = "rival1234";

const BUSINESS_A_ID = "biz_cloudpulse_01";
const BUSINESS_B_ID = "biz_jaipursmile_02";

const CHUNK_PREFIX_A = "cp";
const CHUNK_PREFIX_B = "js";
const EXPECTED_CHUNKS_PER_BUSINESS = 6;

const cloudPulse: BusinessFacts = {
  name: "CloudPulse CRM",
  businessType: "SaaS (B2B)",
  description: [
    "CloudPulse CRM is an inventory and GST billing platform built for small retail shops across India.",
    "It combines stock tracking, GST-compliant invoicing, and WhatsApp invoice delivery in a single web application.",
    "CloudPulse is headquartered in Jaipur and currently serves more than 2,400 retail businesses in Rajasthan, Gujarat, and Maharashtra.",
    "The company was founded in 2021 by two chartered accountants. Every customer account is supported by a named onboarding specialist during the first 30 days.",
    "The product team ships updates every two weeks and prioritises requests from Pro Plan customers.",
  ].join(" "),
  productsServices: [
    "CloudPulse offers two subscription plans.",
    "The Starter Plan costs ₹499 per month for one user and includes inventory tracking, GST-compliant invoicing, daily sales reports, and email support.",
    "The Pro Plan costs ₹1,499 per month for up to five users and adds WhatsApp invoicing, GST API access, bulk CSV import, multi-store inventory, and priority support.",
    "Extra users can be added to any Pro Plan workspace for ₹199 per user per month.",
    "Annual billing is available for the Pro Plan at ₹14,990 per year, which saves two months compared with monthly billing.",
    "Both plans start with a 14-day free trial and no credit card is required for the trial.",
    "Optional add-ons include a thermal label printer integration for ₹299 per month and a dedicated one-time onboarding workshop for ₹1,500.",
    "GST filing itself is included in both plans, and there are no transaction fees on invoices generated through CloudPulse.",
  ].join(" "),
  hours: [
    "CloudPulse support operates Monday to Saturday from 9:00 AM to 7:00 PM IST.",
    "Phone support is available throughout those hours. Email and WhatsApp tickets are answered within four business hours, and every ticket receives a named responder.",
    "The support desk is closed on Sundays and on national holidays.",
    "Critical outage reports are monitored around the clock, including Sundays, and the on-call engineer acknowledges outages within 30 minutes.",
    "Planned maintenance happens on Sunday nights between 11:00 PM and 1:00 AM IST, and customers receive an in-app notice at least 48 hours in advance.",
  ].join(" "),
  returnPolicy: [
    "CloudPulse offers a full refund within 7 days of the initial subscription if fewer than 10 invoices have been generated in the account.",
    "After 7 days, a subscription can be cancelled at any time, but the current billing period is not refunded and access continues until the period ends.",
    "Annual Pro Plan renewals can be refunded on a pro-rata basis only within 7 days of the renewal charge.",
    "Duplicate or incorrect charges are refunded in full once confirmed by the billing team.",
    "Approved refunds are returned to the original payment method within 5 to 7 business days.",
    "Add-on purchases such as onboarding workshops are non-refundable once the session has taken place.",
  ].join(" "),
  faqs: [
    "Q: How do I export GSTR-1 JSON? A: Open Reports, choose GST, select the filing month, and click Export JSON. The file downloads in the government GSTR-1 format.",
    "Q: How do I enable WhatsApp invoicing? A: On the Pro Plan, go to Settings, WhatsApp, and connect your business number. Invoices can then be sent from the Invoices screen.",
    "Q: A customer did not receive their WhatsApp invoice. A: Confirm the customer opted in and that the number includes the country code, then resend from Invoices and choose Resend.",
    "Q: How do I reset my password? A: Use Forgot Password on the sign-in page. A reset link arrives by email within 5 minutes.",
    "Q: Can I import my existing stock? A: Bulk CSV import is available on the Pro Plan under Products and Import.",
    "Q: Why is an invoice marked invalid? A: Validate the customer GSTIN and check that HSN codes are present on every line item.",
  ].join("\n"),
  escalationEmail: "founder@cloudpulse.in",
  escalationPhone: "+919876543210",
  agentTone: "Clear, helpful, and professional",
};

const jaipurSmile: BusinessFacts = {
  name: "Jaipur Smile Studio",
  businessType: "Healthcare Clinic (Dental)",
  description: [
    "Jaipur Smile Studio is a family dental clinic located in C-Scheme, Jaipur.",
    "The clinic offers preventive dentistry, root canal treatment, ceramic crowns, dental implants, and smile whitening.",
    "Dr. Meera Rathore leads a team of four dentists and six clinical assistants.",
    "Jaipur Smile Studio serves approximately 40 patients each day and welcomes families from across Jaipur.",
    "Appointments can be booked by phone, WhatsApp, or at the reception desk.",
  ].join(" "),
  productsServices: [
    "Routine scaling and polishing costs ₹1,200 per sitting.",
    "Root Canal Treatment (RCT) costs ₹4,500 per tooth and normally requires two visits.",
    "A ceramic crown costs ₹6,000 per tooth, while a full zirconia crown costs ₹9,500 per tooth.",
    "Smile whitening costs ₹8,000 per session and takes about 60 minutes.",
    "A new patient consultation costs ₹300, and that fee is adjusted against any treatment started on the same day.",
    "Dental X-rays cost ₹400 per film.",
    "Dental implants start at ₹28,000 per implant, including the abutment and crown, and require a CT scan that costs ₹1,500.",
    "Braces consultations are free for patients under 18 years old. All prices are inclusive of GST.",
  ].join(" "),
  hours: [
    "Jaipur Smile Studio is open Tuesday to Sunday from 10:00 AM to 8:00 PM IST and is closed on Mondays.",
    "The last appointment is booked for 7:30 PM. The reception desk answers calls during clinic hours, and WhatsApp messages are answered within one hour.",
    "Emergency dental pain is triaged on the same day whenever a slot is available.",
    "On public holidays the clinic runs a half-day schedule from 10:00 AM to 2:00 PM.",
  ].join(" "),
  returnPolicy: [
    "Appointments can be rescheduled free of charge up to 4 hours before the booked slot.",
    "Cancellations made with less than 4 hours notice, or missed appointments, attract a ₹300 no-show fee.",
    "Prepaid treatment packages can be cancelled within 7 days of purchase if no treatment has started, and the amount is refunded within 5 to 7 business days.",
    "If a treatment plan changes after a consultation, the unused balance stays as credit for 6 months.",
    "Emergency appointments are never charged a no-show fee.",
  ].join(" "),
  faqs: [
    "Q: What should I do after a tooth extraction? A: Bite firmly on the gauze for 45 minutes. Do not eat hot food, rinse vigorously, spit, or use a straw for 24 hours. Apply an ice pack for 10 minutes on and 10 minutes off during the first day.",
    "Q: Is bleeding after extraction normal? A: Light oozing for a few hours is normal. If bleeding continues heavily after 24 hours, call the clinic immediately.",
    "Q: How should I care for a root canal treated tooth? A: Avoid chewing on that tooth until the permanent crown is fitted. Take prescribed medicines after food and maintain regular brushing.",
    "Q: Will whitening make my teeth sensitive? A: Mild sensitivity for 24 to 48 hours is common. Use a desensitising toothpaste and avoid very cold drinks for two days.",
    "Q: Can I eat before my appointment? A: Yes, unless the dentist has advised sedation, in which case a fasting instruction will be given in advance.",
    "Q: Do you treat children? A: Yes, children above 3 years are treated, and braces consultations are free under 18.",
  ].join("\n"),
  escalationEmail: "care@jaipursmile.in",
  escalationPhone: "+919812345678",
  agentTone: "Warm, reassuring, and concise",
};

const CHANNELS_A = [
  { channelType: "WHATSAPP", status: "TEST_MODE", autoSend: true },
  { channelType: "INSTAGRAM", status: "TEST_MODE", autoSend: false },
  { channelType: "GMAIL", status: "DRAFT_ONLY", autoSend: false },
  { channelType: "SARVAM_VOICE", status: "TEST_MODE", autoSend: false },
];

const CHANNELS_B = [
  { channelType: "WHATSAPP", status: "TEST_MODE", autoSend: true },
  { channelType: "INSTAGRAM", status: "UNAVAILABLE", autoSend: false },
  { channelType: "GMAIL", status: "DRAFT_ONLY", autoSend: false },
  { channelType: "SARVAM_VOICE", status: "TEST_MODE", autoSend: false },
];

type Scenario = {
  channel: "WHATSAPP" | "INSTAGRAM" | "GMAIL" | "TEXT_MODAL" | "VOICE";
  query: string;
  specialist: "general" | "technical" | "sales";
  intent: string;
  sentiment: "positive" | "neutral" | "frustrated" | "distressed";
  urgency: number;
  confidence: number;
  action: "answered" | "draft" | "escalated" | "failed";
  state: "replied" | "triaged" | "escalated" | "closed";
  rule: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7";
  cite: number[];
  reply: string;
};

const CLOUDPULSE_SCENARIOS: Scenario[] = [
  {
    channel: "WHATSAPP",
    query: "What is the price of the Pro Plan and does it include WhatsApp invoicing?",
    specialist: "sales",
    intent: "pricing_inquiry",
    sentiment: "neutral",
    urgency: 20,
    confidence: 94,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [2],
    reply:
      "The Pro Plan is ₹1,499 per month and includes up to five users, WhatsApp invoicing, GST API access, and priority support. Extra users cost ₹199 per user per month.",
  },
  {
    channel: "GMAIL",
    query: "How do I export GSTR-1 JSON for last month?",
    specialist: "technical",
    intent: "gstr_export",
    sentiment: "neutral",
    urgency: 15,
    confidence: 91,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [5],
    reply:
      "Open Reports, choose GST, select the filing month, and click Export JSON. The file downloads in the government GSTR-1 format.",
  },
  {
    channel: "WHATSAPP",
    query: "I cancelled 10 days ago and still have not received my refund.",
    specialist: "general",
    intent: "refund_request",
    sentiment: "frustrated",
    urgency: 55,
    confidence: 42,
    action: "escalated",
    state: "escalated",
    rule: "R2",
    cite: [],
    reply:
      "I'm unable to confirm this refund from the available information. I've escalated your case to our billing team, who will contact you within one business day.",
  },
  {
    channel: "INSTAGRAM",
    query: "Let me talk to a real human manager right now.",
    specialist: "general",
    intent: "human_request",
    sentiment: "frustrated",
    urgency: 60,
    confidence: 88,
    action: "escalated",
    state: "escalated",
    rule: "R1",
    cite: [],
    reply:
      "I'm connecting you with a human team member. Our support lead will reach out to you shortly.",
  },
  {
    channel: "WHATSAPP",
    query: "Your app is down and I cannot bill customers. This is costing me money!",
    specialist: "technical",
    intent: "outage_report",
    sentiment: "distressed",
    urgency: 92,
    confidence: 71,
    action: "escalated",
    state: "escalated",
    rule: "R3",
    cite: [],
    reply:
      "I'm escalating this outage to our on-call engineer immediately. You will receive an update within 30 minutes.",
  },
  {
    channel: "TEXT_MODAL",
    query: "How many users can I add to the Starter plan?",
    specialist: "sales",
    intent: "plan_limits",
    sentiment: "neutral",
    urgency: 10,
    confidence: 93,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [2],
    reply:
      "The Starter Plan includes one user. To add more users, upgrade to the Pro Plan, which covers up to five users and supports extra users at ₹199 per user per month.",
  },
  {
    channel: "INSTAGRAM",
    query: "How do I set up WhatsApp invoicing on my account?",
    specialist: "technical",
    intent: "whatsapp_invoicing",
    sentiment: "neutral",
    urgency: 25,
    confidence: 76,
    action: "draft",
    state: "triaged",
    rule: "R5",
    cite: [5],
    reply:
      "On the Pro Plan, go to Settings, then WhatsApp, and connect your business number. Invoices can then be sent from the Invoices screen.",
  },
  {
    channel: "GMAIL",
    query: "What are your support hours on Saturday?",
    specialist: "general",
    intent: "support_hours",
    sentiment: "neutral",
    urgency: 10,
    confidence: 96,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [3],
    reply:
      "Our support desk is open Monday to Saturday from 9:00 AM to 7:00 PM IST, and we are closed on Sundays and national holidays.",
  },
  {
    channel: "WHATSAPP",
    query: "You charged my card twice this month. I want this fixed today.",
    specialist: "general",
    intent: "billing_dispute",
    sentiment: "frustrated",
    urgency: 78,
    confidence: 64,
    action: "escalated",
    state: "escalated",
    rule: "R3",
    cite: [],
    reply:
      "I'm sorry about the duplicate charge. Billing disputes are handled by our team, who will review your account and respond today.",
  },
  {
    channel: "GMAIL",
    query: "Is there a free trial before I pay for the Pro Plan?",
    specialist: "sales",
    intent: "trial_question",
    sentiment: "positive",
    urgency: 18,
    confidence: 84,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [2],
    reply:
      "Yes. Both plans include a 14-day free trial and no credit card is required to start the trial.",
  },
  {
    channel: "WHATSAPP",
    query: "How do I reset my password? I am locked out of my account.",
    specialist: "technical",
    intent: "account_access",
    sentiment: "neutral",
    urgency: 35,
    confidence: 88,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [5],
    reply:
      "Use Forgot Password on the sign-in page. A reset link arrives by email within 5 minutes. If it does not arrive, check your spam folder.",
  },
  {
    channel: "INSTAGRAM",
    query: "Do you support bulk import of my stock from Excel?",
    specialist: "technical",
    intent: "bulk_import",
    sentiment: "neutral",
    urgency: 22,
    confidence: 79,
    action: "draft",
    state: "triaged",
    rule: "R5",
    cite: [5],
    reply:
      "Bulk CSV import is available on the Pro Plan under Products and Import. Save your Excel sheet as CSV before uploading.",
  },
  {
    channel: "GMAIL",
    query: "I need an invoice copy for my annual Pro Plan payment for accounting.",
    specialist: "sales",
    intent: "billing_invoice",
    sentiment: "neutral",
    urgency: 30,
    confidence: 72,
    action: "draft",
    state: "triaged",
    rule: "R5",
    cite: [2],
    reply:
      "Annual Pro Plan billing is ₹14,990 per year. Our billing team can resend the GST invoice copy from your account records.",
  },
];

const JAIPUR_SMILE_SCENARIOS: Scenario[] = [
  {
    channel: "WHATSAPP",
    query: "What are your clinic timings on Sunday?",
    specialist: "general",
    intent: "opening_hours",
    sentiment: "neutral",
    urgency: 8,
    confidence: 94,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [3],
    reply:
      "We are open Tuesday to Sunday from 10:00 AM to 8:00 PM IST, and the clinic is closed on Mondays.",
  },
  {
    channel: "WHATSAPP",
    query: "How much does root canal treatment cost?",
    specialist: "sales",
    intent: "rct_pricing",
    sentiment: "neutral",
    urgency: 30,
    confidence: 88,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [2],
    reply:
      "Root Canal Treatment costs ₹4,500 per tooth and normally requires two visits. A ceramic crown afterwards costs ₹6,000 per tooth.",
  },
  {
    channel: "GMAIL",
    query: "I missed my appointment yesterday, why was I charged ₹300?",
    specialist: "general",
    intent: "no_show_fee",
    sentiment: "frustrated",
    urgency: 58,
    confidence: 47,
    action: "escalated",
    state: "escalated",
    rule: "R2",
    cite: [],
    reply:
      "I'm unable to confirm the no-show charge from the available information. I've escalated this to our reception team, who will call you.",
  },
  {
    channel: "WHATSAPP",
    query: "I had an extraction this morning and the bleeding has not stopped. What should I do?",
    specialist: "general",
    intent: "post_extraction_bleeding",
    sentiment: "distressed",
    urgency: 88,
    confidence: 79,
    action: "escalated",
    state: "escalated",
    rule: "R3",
    cite: [],
    reply:
      "Please bite firmly on clean gauze for 45 minutes and avoid spitting or hot food. Because the bleeding is still heavy, I'm alerting the clinic team to call you back now.",
  },
  {
    channel: "INSTAGRAM",
    query: "What is the charge for teeth cleaning?",
    specialist: "sales",
    intent: "cleaning_pricing",
    sentiment: "neutral",
    urgency: 12,
    confidence: 89,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [2],
    reply: "Routine scaling and polishing costs ₹1,200 per sitting.",
  },
  {
    channel: "GMAIL",
    query: "Can I move my appointment from tomorrow 5 PM to Saturday morning?",
    specialist: "general",
    intent: "reschedule_request",
    sentiment: "neutral",
    urgency: 35,
    confidence: 66,
    action: "draft",
    state: "triaged",
    rule: "R5",
    cite: [4],
    reply:
      "Appointments can be rescheduled free of charge up to 4 hours before the slot. Reception will confirm the Saturday morning time.",
  },
  {
    channel: "GMAIL",
    query: "Are you open on Monday? I want to book a consultation.",
    specialist: "general",
    intent: "closed_monday",
    sentiment: "neutral",
    urgency: 8,
    confidence: 94,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [3],
    reply:
      "The clinic is closed on Mondays. We are open Tuesday to Sunday from 10:00 AM to 8:00 PM IST, and consultations cost ₹300.",
  },
  {
    channel: "TEXT_MODAL",
    query: "I want to speak to a human receptionist, not a bot.",
    specialist: "general",
    intent: "human_request",
    sentiment: "frustrated",
    urgency: 52,
    confidence: 90,
    action: "escalated",
    state: "escalated",
    rule: "R1",
    cite: [],
    reply: "I'm connecting you with our reception team, who will call you shortly.",
  },
  {
    channel: "WHATSAPP",
    query: "I am in severe pain two days after my root canal. Something is wrong.",
    specialist: "general",
    intent: "severe_pain",
    sentiment: "distressed",
    urgency: 96,
    confidence: 72,
    action: "escalated",
    state: "escalated",
    rule: "R3",
    cite: [],
    reply:
      "Severe pain after a root canal needs clinical review. I'm alerting the clinic team now so they can call you back immediately.",
  },
  {
    channel: "GMAIL",
    query: "Will teeth whitening make my teeth sensitive?",
    specialist: "general",
    intent: "whitening_sensitivity",
    sentiment: "neutral",
    urgency: 22,
    confidence: 73,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [5],
    reply:
      "Mild sensitivity for 24 to 48 hours is common after whitening. Use a desensitising toothpaste and avoid very cold drinks for two days.",
  },
  {
    channel: "GMAIL",
    query: "Do you offer EMI for dental implants?",
    specialist: "sales",
    intent: "implant_pricing",
    sentiment: "neutral",
    urgency: 26,
    confidence: 62,
    action: "draft",
    state: "triaged",
    rule: "R5",
    cite: [2],
    reply:
      "Dental implants start at ₹28,000 per implant including the abutment and crown. The reception team can confirm available payment plans.",
  },
  {
    channel: "WHATSAPP",
    query: "What should I do after my tooth extraction?",
    specialist: "general",
    intent: "post_extraction_care",
    sentiment: "neutral",
    urgency: 20,
    confidence: 86,
    action: "answered",
    state: "replied",
    rule: "R6",
    cite: [5],
    reply:
      "Bite on the gauze for 45 minutes. For 24 hours avoid hot food, vigorous rinsing, spitting, and straws, and use an ice pack for 10 minutes on and 10 minutes off.",
  },
  {
    channel: "GMAIL",
    query: "Can I cancel my prepaid treatment package?",
    specialist: "general",
    intent: "cancellation_policy",
    sentiment: "neutral",
    urgency: 28,
    confidence: 75,
    action: "draft",
    state: "triaged",
    rule: "R5",
    cite: [4],
    reply:
      "Prepaid packages can be cancelled within 7 days of purchase if no treatment has started, with the refund returned in 5 to 7 business days.",
  },
];

const CUSTOMER_NAMES_A = [
  "Rohit Sharma", "Ananya Iyer", "Vikram Nair", "Sneha Kapoor", "Arjun Mehta",
  "Priya Desai", "Karan Malhotra", "Neha Bansal", "Sameer Joshi", "Divya Rao",
  "Mohit Gupta", "Ritika Sen", "Aditya Kulkarni", "Farhan Ali", "Isha Bhatia",
  "Nitin Chawla", "Kavya Menon", "Rahul Bose", "Simran Kaur", "Manish Tiwari",
  "Anjali Nambiar", "Siddharth Rao", "Pooja Shetty", "Varun Chopra", "Tanvi Shah",
];

const CUSTOMER_NAMES_B = [
  "Pooja Agarwal", "Ramesh Choudhary", "Kavita Sharma", "Sunil Verma", "Meera Joshi",
  "Rahul Saxena", "Anita Jain", "Deepak Bansal", "Shalini Gupta", "Nikhil Patel",
  "Tara Singh", "Harsh Vardhan", "Isha Bhatia", "Gaurav Rathore", "Preeti Soni",
  "Amit Trivedi", "Lakshmi Nair", "Vivek Pandey", "Sonal Mathur", "Yash Agarwal",
  "Ritu Pareek", "Akash Daga", "Naina Kothari", "Sanjay Yadav", "Bhavna Jain",
];

function padChunkNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ".");
}

function handleFor(channel: Scenario["channel"], name: string, index: number): string {
  switch (channel) {
    case "WHATSAPP":
    case "VOICE":
      return `+9198${String(10000000 + index * 137911).slice(0, 8)}`;
    case "INSTAGRAM":
      return `@${slugify(name).replace(/\./g, "_")}`;
    default:
      return `${slugify(name)}@example.com`;
  }
}

function buildChunkRows(businessId: string, facts: BusinessFacts, prefix: string) {
  const { brainMd, chunks } = buildBusinessBrain(facts);

  if (chunks.length !== EXPECTED_CHUNKS_PER_BUSINESS) {
    throw new Error(
      `Expected ${EXPECTED_CHUNKS_PER_BUSINESS} chunks for ${facts.name}, got ${chunks.length}. ` +
        "Adjust the seed copy so each section stays under 300 words."
    );
  }

  return {
    brainMd,
    rows: chunks.map((chunk, index) => ({
      id: `chk_${prefix}_${padChunkNumber(index + 1)}`,
      businessId,
      chunkIndex: chunk.chunkIndex,
      section: chunk.section,
      content: chunk.content,
      keywords: chunk.keywords,
    })),
  };
}

async function seedBusiness(params: {
  id: string;
  ownerId: string;
  facts: BusinessFacts;
  prefix: string;
  channels: typeof CHANNELS_A;
}) {
  const { id, ownerId, facts, prefix, channels } = params;
  const { brainMd, rows } = buildChunkRows(id, facts, prefix);

  await prisma.business.upsert({
    where: { id },
    update: {
      ownerId,
      name: facts.name,
      businessType: facts.businessType,
      description: facts.description,
      productsServices: facts.productsServices,
      hours: facts.hours,
      returnPolicy: facts.returnPolicy,
      faqs: facts.faqs,
      escalationEmail: facts.escalationEmail,
      escalationPhone: facts.escalationPhone,
      agentTone: facts.agentTone ?? "Warm, concise, and helpful",
      autoSendEnabled: true,
      compiledBrainMd: brainMd,
      brainVersion: 1,
    },
    create: {
      id,
      ownerId,
      name: facts.name,
      businessType: facts.businessType,
      description: facts.description,
      productsServices: facts.productsServices,
      hours: facts.hours,
      returnPolicy: facts.returnPolicy,
      faqs: facts.faqs,
      escalationEmail: facts.escalationEmail,
      escalationPhone: facts.escalationPhone,
      agentTone: facts.agentTone ?? "Warm, concise, and helpful",
      autoSendEnabled: true,
      compiledBrainMd: brainMd,
      brainVersion: 1,
    },
  });

  await prisma.knowledgeChunk.deleteMany({
    where: { businessId: id, id: { notIn: rows.map((row) => row.id) } },
  });

  for (const row of rows) {
    await prisma.knowledgeChunk.upsert({
      where: { id: row.id },
      update: {
        chunkIndex: row.chunkIndex,
        section: row.section,
        content: row.content,
        keywords: row.keywords,
      },
      create: row,
    });
  }

  for (const channel of channels) {
    await prisma.channelConnection.upsert({
      where: { businessId_channelType: { businessId: id, channelType: channel.channelType } },
      update: { status: channel.status, autoSend: channel.autoSend },
      create: {
        businessId: id,
        channelType: channel.channelType,
        status: channel.status,
        autoSend: channel.autoSend,
      },
    });
  }

  await prisma.ticketEvent.deleteMany({
    where: { ticket: { businessId: id } },
  });
  await prisma.ticket.deleteMany({
    where: { businessId: id, externalMessageId: { startsWith: "seed_" } },
  });

  return rows;
}

async function seedTickets(params: {
  businessId: string;
  prefix: string;
  scenarios: Scenario[];
  names: string[];
  count: number;
}) {
  const { businessId, prefix, scenarios, names, count } = params;
  const now = Date.now();

  for (let i = 0; i < count; i += 1) {
    const scenario = scenarios[i % scenarios.length];
    const customerName = names[i % names.length];
    const hoursAgo = 3 + i * 5;
    const createdAt = new Date(now - hoursAgo * 60 * 60 * 1000);
    const citedChunkIds = scenario.cite.map(
      (chunkNumber) => `chk_${prefix}_${padChunkNumber(chunkNumber)}`
    );
    const state =
      scenario.action === "answered" && i % 9 === 4 ? "closed" : scenario.state;

    const finalEvent =
      scenario.action === "answered"
        ? {
            eventType: "AUTO_SENT",
            payload: JSON.stringify({ reply: scenario.reply, citedChunkIds }),
          }
        : scenario.action === "draft"
          ? {
              eventType: "DRAFT_SAVED",
              payload: JSON.stringify({ draft: scenario.reply, citedChunkIds }),
            }
          : {
              eventType: "ESCALATED",
              payload: JSON.stringify({
                reason: scenario.rule,
                notifyEmail: true,
              }),
            };

    await prisma.ticket.create({
      data: {
        businessId,
        externalMessageId: `seed_${prefix}_${String(i + 1).padStart(3, "0")}`,
        channel: scenario.channel,
        customerName,
        customerHandle: handleFor(scenario.channel, customerName, i),
        customerQuery: scenario.query,
        state,
        specialistAssigned: scenario.specialist,
        intent: scenario.intent,
        sentiment: scenario.sentiment,
        urgencyScore: scenario.urgency,
        confidenceScore: scenario.confidence,
        actionStatus: scenario.action,
        routingRuleHit: scenario.rule,
        aiDraftOrReply: scenario.reply,
        citedChunkIds: JSON.stringify(citedChunkIds),
        createdAt,
        updatedAt: createdAt,
        events: {
          create: [
            {
              eventType: "INBOUND_RECEIVED",
              payload: JSON.stringify({ channel: scenario.channel }),
              createdAt,
            },
            {
              eventType: "RAG_RETRIEVED",
              payload: JSON.stringify({
                topK: 4,
                chunkIds: citedChunkIds,
                bestScore: citedChunkIds.length ? 0.87 : 0.31,
              }),
              createdAt: new Date(createdAt.getTime() + 1000),
            },
            {
              eventType: "ROUTING_DECIDED",
              payload: JSON.stringify({
                ruleHit: scenario.rule,
                actionStatus: scenario.action,
                confidenceScore: scenario.confidence,
                urgencyScore: scenario.urgency,
                sentiment: scenario.sentiment,
                shouldAutoSend: scenario.action === "answered",
              }),
              createdAt: new Date(createdAt.getTime() + 2000),
            },
            {
              ...finalEvent,
              createdAt: new Date(createdAt.getTime() + 3000),
            },
          ],
        },
      },
    });
  }
}

async function main() {
  console.log("Seeding AfterSales AI demo data...");

  const demoPasswordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 10);
  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { name: DEMO_USER_NAME, passwordHash: demoPasswordHash },
    create: {
      email: DEMO_USER_EMAIL,
      name: DEMO_USER_NAME,
      passwordHash: demoPasswordHash,
    },
  });

  const rivalPasswordHash = await bcrypt.hash(RIVAL_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: RIVAL_EMAIL },
    update: { name: "Rival Owner", passwordHash: rivalPasswordHash },
    create: {
      email: RIVAL_EMAIL,
      name: "Rival Owner",
      passwordHash: rivalPasswordHash,
    },
  });

  const cloudPulseChunks = await seedBusiness({
    id: BUSINESS_A_ID,
    ownerId: demoUser.id,
    facts: cloudPulse,
    prefix: CHUNK_PREFIX_A,
    channels: CHANNELS_A,
  });
  const jaipurSmileChunks = await seedBusiness({
    id: BUSINESS_B_ID,
    ownerId: demoUser.id,
    facts: jaipurSmile,
    prefix: CHUNK_PREFIX_B,
    channels: CHANNELS_B,
  });

  await seedTickets({
    businessId: BUSINESS_A_ID,
    prefix: CHUNK_PREFIX_A,
    scenarios: CLOUDPULSE_SCENARIOS,
    names: CUSTOMER_NAMES_A,
    count: 25,
  });
  await seedTickets({
    businessId: BUSINESS_B_ID,
    prefix: CHUNK_PREFIX_B,
    scenarios: JAIPUR_SMILE_SCENARIOS,
    names: CUSTOMER_NAMES_B,
    count: 25,
  });

  console.log(`  Business A: ${BUSINESS_A_ID} (${cloudPulseChunks.length} chunks)`);
  console.log(`  Business B: ${BUSINESS_B_ID} (${jaipurSmileChunks.length} chunks)`);
  console.log("  Tickets: 25 per business (50 total)");
  console.log(`  Demo login: ${DEMO_USER_EMAIL} / ${DEMO_USER_PASSWORD}`);
  console.log(`  Rival login (isolation test): ${RIVAL_EMAIL} / ${RIVAL_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
