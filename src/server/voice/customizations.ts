/**
 * Business voice-agent customizations.
 *
 * One row per customization type keeps the schema open-ended, but the JSON is
 * not trusted: every read and write passes through the parsers here. The two
 * behaviours that matter most:
 *
 *   - Availability is resolved for a *date*: a date-specific override beats the
 *     recurring week, and a temporary closure beats both.
 *   - An appointment request is never a confirmation. `confirmed` is the literal
 *     `false` on every disposition; there is no calendar in this deployment, so
 *     the only honest output is "recorded, pending owner action".
 */

import type { BusinessVoiceAgentCustomization } from "@prisma/client";
import type { RuleId } from "../../shared/domain.ts";
import type {
  VoiceAppointmentBookingConfig as AppointmentBookingConfig,
  VoiceAvailabilityConfig as AvailabilityConfig,
  VoiceAvailabilityWindow as AvailabilityWindow,
  VoiceBusinessInstructionsConfig as BusinessInstructionsConfig,
  VoiceCallbackRequestsConfig as CallbackRequestsConfig,
  VoiceCancellationPolicyConfig as CancellationPolicyConfig,
  VoiceCustomizationConfigMap as CustomizationConfigMap,
  VoiceDateOverride as DateOverride,
  VoiceReschedulingPolicyConfig as ReschedulingPolicyConfig,
  VoiceTemporaryClosure as TemporaryClosure,
  VoiceUrgentCallConfig as UrgentCallConfig,
  VoiceWeeklyDay as WeeklyDay,
} from "../../shared/api.ts";
import { prisma } from "../db.ts";
import { HttpError } from "../auth/http-error.ts";

export type {
  AppointmentBookingConfig,
  AvailabilityConfig,
  AvailabilityWindow,
  BusinessInstructionsConfig,
  CallbackRequestsConfig,
  CancellationPolicyConfig,
  CustomizationConfigMap,
  DateOverride,
  ReschedulingPolicyConfig,
  TemporaryClosure,
  UrgentCallConfig,
  WeeklyDay,
};

export const CUSTOMIZATION_TYPES = [
  "availability",
  "appointment_booking",
  "cancellation_policy",
  "rescheduling_policy",
  "callback_requests",
  "urgent_call_handling",
  "business_specific_instructions",
] as const;

export type CustomizationType = (typeof CUSTOMIZATION_TYPES)[number];

export const WEEKDAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/;

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export const CUSTOMIZATION_DEFAULTS: CustomizationConfigMap = {
  availability: {
    timezone: DEFAULT_TIMEZONE,
    slotMinutes: 30,
    bufferMinutes: 0,
    maxPerSlot: 1,
    minAdvanceHours: 0,
    maxFutureDays: 30,
    weekly: WEEKDAY_ORDER.map((day) => ({ day, closed: true, windows: [] })),
    dateOverrides: [],
    temporaryClosures: [],
  },
  appointment_booking: {
    bookingRules: "",
    noSlotBehavior: "Take a callback request instead of promising a slot.",
    requiredDetails: ["name", "phone", "preferred_date", "preferred_time"],
  },
  cancellation_policy: { policyText: "", cutoffHours: 0, feeNote: "" },
  rescheduling_policy: { policyText: "", cutoffHours: 0, feeNote: "" },
  callback_requests: {
    instructions: "",
    collectPhone: true,
    responseWindow: "the same working day",
  },
  urgent_call_handling: {
    instructions: "",
    emergencyInstructions:
      "If the caller describes a medical emergency, tell them to contact local emergency services immediately.",
    transferNumber: null,
    transferEnabled: false,
  },
  business_specific_instructions: { instructions: "" },
};

/** Mandatory guardrail, independent of anything an owner configures. */
export const SAFETY_INSTRUCTIONS =
  "Never diagnose a condition, prescribe medication, or replace a healthcare professional. " +
  "If a caller describes a medical emergency, direct them to local emergency services immediately; " +
  "do not delay that by trying to book a routine appointment.";

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readText(
  body: Record<string, unknown>,
  key: string,
  max: number,
  fallback = "",
): string {
  const value = body[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new HttpError(400, `field "${key}" must be a string`);
  const text = value.replace(CONTROL_CHARS, "").trim();
  if (text.length > max) throw new HttpError(400, `field "${key}" exceeds ${max} characters`);
  return text;
}

function readInt(
  body: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const value = body[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `field "${key}" must be an integer between ${min} and ${max}`);
  }
  return value;
}

function readBool(
  body: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = body[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new HttpError(400, `field "${key}" must be a boolean`);
  return value;
}

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function readWindows(value: unknown, label: string): AvailabilityWindow[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new HttpError(400, `${label} must be an array`);
  if (value.length > 3) throw new HttpError(400, `${label} accepts at most 3 windows`);

  const windows: AvailabilityWindow[] = [];
  for (const entry of value) {
    const window = asObject(entry, `${label} window`);
    const start = readText(window, "start", 5);
    const end = readText(window, "end", 5);
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
      throw new HttpError(400, `${label} times must be HH:MM in 24-hour form`);
    }
    if (start >= end) throw new HttpError(400, `${label} window must end after it starts`);
    windows.push({ start, end });
  }

  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous !== undefined && current !== undefined && current.start < previous.end) {
      throw new HttpError(400, `${label} windows must not overlap`);
    }
  }
  return sorted;
}

function readTimeZone(body: Record<string, unknown>, fallback: string): string {
  const zone = readText(body, "timezone", 64) || fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    throw new HttpError(400, 'field "timezone" must be a valid IANA time zone, e.g. Asia/Kolkata');
  }
  return zone;
}

export function parseAvailabilityConfig(value: unknown): AvailabilityConfig {
  const body = asObject(value, "availability configuration");
  const weeklyInput = body["weekly"];
  if (weeklyInput !== undefined && weeklyInput !== null && !Array.isArray(weeklyInput)) {
    throw new HttpError(400, 'field "weekly" must be an array of weekdays');
  }
  const weeklyEntries: unknown[] = Array.isArray(weeklyInput) ? weeklyInput : [];

  const byDay = new Map<string, WeeklyDay>();
  for (const entry of weeklyEntries) {
    const day = asObject(entry, "weekly day");
    const rawName = readText(day, "day", 20);
    const canonical = WEEKDAY_ORDER.find((name) => name.toLowerCase() === rawName.toLowerCase());
    if (canonical === undefined) {
      throw new HttpError(400, `"${rawName}" is not a weekday`);
    }
    if (byDay.has(canonical)) throw new HttpError(400, `weekday "${canonical}" appears twice`);
    const closed = readBool(day, "closed", true);
    const windows = readWindows(day["windows"], `${canonical} availability`);
    byDay.set(canonical, { day: canonical, closed: closed || windows.length === 0, windows });
  }

  const overridesInput = body["dateOverrides"];
  if (overridesInput !== undefined && overridesInput !== null && !Array.isArray(overridesInput)) {
    throw new HttpError(400, 'field "dateOverrides" must be an array');
  }
  const dateOverrides: DateOverride[] = [];
  const seenDates = new Set<string>();
  const overrideEntries: unknown[] = Array.isArray(overridesInput) ? overridesInput : [];
  for (const entry of overrideEntries) {
    if (dateOverrides.length >= 60) {
      throw new HttpError(400, 'field "dateOverrides" accepts at most 60 dates');
    }
    const override = asObject(entry, "date override");
    const date = readText(override, "date", 10);
    if (!isValidDate(date)) throw new HttpError(400, `"${date}" is not a valid YYYY-MM-DD date`);
    if (seenDates.has(date)) throw new HttpError(400, `date override "${date}" appears twice`);
    seenDates.add(date);
    const windows = readWindows(override["windows"], `${date} availability`);
    const closed = readBool(override, "closed", windows.length === 0);
    dateOverrides.push({
      date,
      closed: closed || windows.length === 0,
      windows,
      note: readText(override, "note", 200),
    });
  }

  const closureInput = body["temporaryClosures"];
  if (closureInput !== undefined && closureInput !== null && !Array.isArray(closureInput)) {
    throw new HttpError(400, 'field "temporaryClosures" must be an array');
  }
  const temporaryClosures: TemporaryClosure[] = [];
  const closureEntries: unknown[] = Array.isArray(closureInput) ? closureInput : [];
  for (const entry of closureEntries) {
    if (temporaryClosures.length >= 20) {
      throw new HttpError(400, 'field "temporaryClosures" accepts at most 20 entries');
    }
    const closure = asObject(entry, "temporary closure");
    const from = readText(closure, "from", 16);
    const to = readText(closure, "to", 16);
    if (!DATE_TIME_RE.test(from) || !DATE_TIME_RE.test(to)) {
      throw new HttpError(400, "temporary closure dates must be YYYY-MM-DD or YYYY-MM-DDTHH:MM");
    }
    if (!isValidDate(from.slice(0, 10)) || !isValidDate(to.slice(0, 10))) {
      throw new HttpError(400, "temporary closure dates must be real calendar dates");
    }
    if (from >= to) throw new HttpError(400, "temporary closure must end after it starts");
    temporaryClosures.push({ from, to, reason: readText(closure, "reason", 200) });
  }

  return {
    timezone: readTimeZone(body, DEFAULT_TIMEZONE),
    slotMinutes: readInt(body, "slotMinutes", 5, 240, CUSTOMIZATION_DEFAULTS.availability.slotMinutes),
    bufferMinutes: readInt(body, "bufferMinutes", 0, 120, CUSTOMIZATION_DEFAULTS.availability.bufferMinutes),
    maxPerSlot: readInt(body, "maxPerSlot", 1, 50, CUSTOMIZATION_DEFAULTS.availability.maxPerSlot),
    minAdvanceHours: readInt(
      body,
      "minAdvanceHours",
      0,
      720,
      CUSTOMIZATION_DEFAULTS.availability.minAdvanceHours,
    ),
    maxFutureDays: readInt(
      body,
      "maxFutureDays",
      1,
      365,
      CUSTOMIZATION_DEFAULTS.availability.maxFutureDays,
    ),
    weekly: WEEKDAY_ORDER.map(
      (day) => byDay.get(day) ?? { day, closed: true, windows: [] },
    ),
    dateOverrides: dateOverrides.sort((a, b) => a.date.localeCompare(b.date)),
    temporaryClosures,
  };
}

const DETAIL_FIELDS = ["name", "phone", "preferred_date", "preferred_time"] as const;

export function parseAppointmentBookingConfig(value: unknown): AppointmentBookingConfig {
  const body = asObject(value, "appointment_booking configuration");
  const detailsInput = body["requiredDetails"];
  if (detailsInput !== undefined && detailsInput !== null && !Array.isArray(detailsInput)) {
    throw new HttpError(400, 'field "requiredDetails" must be an array');
  }
  const detailEntries: unknown[] = Array.isArray(detailsInput)
    ? detailsInput
    : [...CUSTOMIZATION_DEFAULTS.appointment_booking.requiredDetails];
  const requiredDetails: string[] = [];
  for (const entry of detailEntries) {
    if (typeof entry !== "string" || !(DETAIL_FIELDS as readonly string[]).includes(entry)) {
      throw new HttpError(
        400,
        'field "requiredDetails" accepts name, phone, preferred_date and preferred_time',
      );
    }
    if (!requiredDetails.includes(entry)) requiredDetails.push(entry);
  }
  if (requiredDetails.length === 0) {
    throw new HttpError(400, 'field "requiredDetails" must contain at least one field');
  }

  return {
    bookingRules: readText(body, "bookingRules", 1_000),
    noSlotBehavior: readText(
      body,
      "noSlotBehavior",
      500,
      CUSTOMIZATION_DEFAULTS.appointment_booking.noSlotBehavior,
    ),
    requiredDetails,
  };
}

function parsePolicy(value: unknown, label: string): CancellationPolicyConfig {
  const body = asObject(value, `${label} configuration`);
  return {
    policyText: readText(body, "policyText", 1_500),
    cutoffHours: readInt(body, "cutoffHours", 0, 720, 0),
    feeNote: readText(body, "feeNote", 300),
  };
}

export function parseCancellationPolicyConfig(value: unknown): CancellationPolicyConfig {
  return parsePolicy(value, "cancellation_policy");
}

export function parseReschedulingPolicyConfig(value: unknown): ReschedulingPolicyConfig {
  return parsePolicy(value, "rescheduling_policy");
}

export function parseCallbackRequestsConfig(value: unknown): CallbackRequestsConfig {
  const body = asObject(value, "callback_requests configuration");
  return {
    instructions: readText(body, "instructions", 1_000),
    collectPhone: readBool(body, "collectPhone", true),
    responseWindow: readText(
      body,
      "responseWindow",
      200,
      CUSTOMIZATION_DEFAULTS.callback_requests.responseWindow,
    ),
  };
}

function optionalPhone(body: Record<string, unknown>, key: string): string | null {
  const raw = readText(body, key, 20);
  if (raw.length === 0) return null;
  const compact = raw.replace(/[\s().-]/g, "");
  const match = /^\+?(\d{8,15})$/.exec(compact);
  if (match === null || (match[1] ?? "").startsWith("0")) {
    throw new HttpError(400, `field "${key}" must be an E.164 phone number`);
  }
  return `+${match[1] ?? ""}`;
}

export function parseUrgentCallConfig(value: unknown): UrgentCallConfig {
  const body = asObject(value, "urgent_call_handling configuration");
  return {
    instructions: readText(body, "instructions", 1_500),
    emergencyInstructions: readText(
      body,
      "emergencyInstructions",
      1_000,
      CUSTOMIZATION_DEFAULTS.urgent_call_handling.emergencyInstructions,
    ),
    transferEnabled: readBool(body, "transferEnabled", false),
    transferNumber: optionalPhone(body, "transferNumber"),
  };
}

export function parseBusinessInstructionsConfig(value: unknown): BusinessInstructionsConfig {
  const body = asObject(value, "business_specific_instructions configuration");
  return { instructions: readText(body, "instructions", 3_000) };
}

export type ParsedCustomization =
  | { type: "availability"; isEnabled: boolean; configuration: AvailabilityConfig }
  | { type: "appointment_booking"; isEnabled: boolean; configuration: AppointmentBookingConfig }
  | { type: "cancellation_policy"; isEnabled: boolean; configuration: CancellationPolicyConfig }
  | { type: "rescheduling_policy"; isEnabled: boolean; configuration: ReschedulingPolicyConfig }
  | { type: "callback_requests"; isEnabled: boolean; configuration: CallbackRequestsConfig }
  | { type: "urgent_call_handling"; isEnabled: boolean; configuration: UrgentCallConfig }
  | {
      type: "business_specific_instructions";
      isEnabled: boolean;
      configuration: BusinessInstructionsConfig;
    };

function parseOne(type: CustomizationType, value: unknown): ParsedCustomization {
  const body = asObject(value, `customization "${type}"`);
  const isEnabled = readBool(body, "isEnabled", true);
  const configuration = body["configuration"] ?? {};

  const parsed = (() => {
    switch (type) {
      case "availability":
        return { type, isEnabled, configuration: parseAvailabilityConfig(configuration) } as const;
      case "appointment_booking":
        return {
          type,
          isEnabled,
          configuration: parseAppointmentBookingConfig(configuration),
        } as const;
      case "cancellation_policy":
        return {
          type,
          isEnabled,
          configuration: parseCancellationPolicyConfig(configuration),
        } as const;
      case "rescheduling_policy":
        return {
          type,
          isEnabled,
          configuration: parseReschedulingPolicyConfig(configuration),
        } as const;
      case "callback_requests":
        return { type, isEnabled, configuration: parseCallbackRequestsConfig(configuration) } as const;
      case "urgent_call_handling":
        return { type, isEnabled, configuration: parseUrgentCallConfig(configuration) } as const;
      case "business_specific_instructions":
        return {
          type,
          isEnabled,
          configuration: parseBusinessInstructionsConfig(configuration),
        } as const;
    }
  })();

  if (JSON.stringify(parsed.configuration).length > 20_000) {
    throw new HttpError(400, `customization "${type}" is too large (20000 character limit)`);
  }
  return parsed;
}

/** Parses `{ customizations: { availability: { isEnabled, configuration } } }`. */
export function parseCustomizationUpdates(body: Record<string, unknown>): ParsedCustomization[] {
  const container = body["customizations"];
  const source =
    container === undefined ? body : asObject(container, "customizations");
  const updates: ParsedCustomization[] = [];

  for (const key of Object.keys(source)) {
    if (key === "businessId") continue;
    if (!(CUSTOMIZATION_TYPES as readonly string[]).includes(key)) {
      throw new HttpError(400, `unknown customization type "${key}"`);
    }
    if (key === "customizations") continue;
    updates.push(parseOne(key as CustomizationType, source[key]));
  }

  if (updates.length === 0) {
    throw new HttpError(400, "at least one customization type is required");
  }
  return updates;
}

function parseStored<T>(type: CustomizationType, raw: string, parse: (value: unknown) => T, fallback: T): T {
  try {
    return parse(JSON.parse(raw) as unknown);
  } catch (error) {
    if (error instanceof HttpError) return fallback;
    return fallback;
  }
}

export interface ActiveCustomizations {
  availability: AvailabilityConfig | null;
  appointmentBooking: AppointmentBookingConfig | null;
  cancellationPolicy: CancellationPolicyConfig | null;
  reschedulingPolicy: ReschedulingPolicyConfig | null;
  callbackRequests: CallbackRequestsConfig | null;
  urgentCallHandling: UrgentCallConfig | null;
  businessInstructions: BusinessInstructionsConfig | null;
}

/** Disabled or missing rows resolve to `null`: a disabled feature is never applied. */
export function readActiveCustomizations(
  rows: BusinessVoiceAgentCustomization[],
): ActiveCustomizations {
  const byType = new Map(rows.map((row) => [row.customizationType, row]));
  const enabled = (type: CustomizationType): BusinessVoiceAgentCustomization | null => {
    const row = byType.get(type);
    return row !== undefined && row.isEnabled ? row : null;
  };

  const availabilityRow = enabled("availability");
  const bookingRow = enabled("appointment_booking");
  const cancellationRow = enabled("cancellation_policy");
  const reschedulingRow = enabled("rescheduling_policy");
  const callbackRow = enabled("callback_requests");
  const urgentRow = enabled("urgent_call_handling");
  const instructionsRow = enabled("business_specific_instructions");

  return {
    availability:
      availabilityRow === null
        ? null
        : parseStored("availability", availabilityRow.configuration, parseAvailabilityConfig, CUSTOMIZATION_DEFAULTS.availability),
    appointmentBooking:
      bookingRow === null
        ? null
        : parseStored(
            "appointment_booking",
            bookingRow.configuration,
            parseAppointmentBookingConfig,
            CUSTOMIZATION_DEFAULTS.appointment_booking,
          ),
    cancellationPolicy:
      cancellationRow === null
        ? null
        : parseStored(
            "cancellation_policy",
            cancellationRow.configuration,
            parseCancellationPolicyConfig,
            CUSTOMIZATION_DEFAULTS.cancellation_policy,
          ),
    reschedulingPolicy:
      reschedulingRow === null
        ? null
        : parseStored(
            "rescheduling_policy",
            reschedulingRow.configuration,
            parseReschedulingPolicyConfig,
            CUSTOMIZATION_DEFAULTS.rescheduling_policy,
          ),
    callbackRequests:
      callbackRow === null
        ? null
        : parseStored(
            "callback_requests",
            callbackRow.configuration,
            parseCallbackRequestsConfig,
            CUSTOMIZATION_DEFAULTS.callback_requests,
          ),
    urgentCallHandling:
      urgentRow === null
        ? null
        : parseStored(
            "urgent_call_handling",
            urgentRow.configuration,
            parseUrgentCallConfig,
            CUSTOMIZATION_DEFAULTS.urgent_call_handling,
          ),
    businessInstructions:
      instructionsRow === null
        ? null
        : parseStored(
            "business_specific_instructions",
            instructionsRow.configuration,
            parseBusinessInstructionsConfig,
            CUSTOMIZATION_DEFAULTS.business_specific_instructions,
          ),
  };
}

// ---------------------------------------------------------------------------
// Availability resolution
// ---------------------------------------------------------------------------

export type AvailabilitySource =
  | "date_override"
  | "weekly"
  | "temporary_closure"
  | "unconfigured";

export interface ResolvedDay {
  date: string;
  weekday: string;
  closed: boolean;
  windows: AvailabilityWindow[];
  source: AvailabilitySource;
  note: string;
}

function weekdayForDate(date: string): string {
  const index = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  // getUTCDay: 0 = Sunday … 6 = Saturday
  return WEEKDAY_ORDER[(index + 6) % 7] ?? "Monday";
}

export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  return new Date(base.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** The business's local calendar date, not the server's. */
export function dateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function timeInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

export function resolveAvailabilityDay(config: AvailabilityConfig, date: string): ResolvedDay {
  const weekday = weekdayForDate(date);

  const closure = config.temporaryClosures.find(
    (entry) => date >= entry.from.slice(0, 10) && date <= entry.to.slice(0, 10),
  );
  if (closure !== undefined) {
    return {
      date,
      weekday,
      closed: true,
      windows: [],
      source: "temporary_closure",
      note: closure.reason,
    };
  }

  const override = config.dateOverrides.find((entry) => entry.date === date);
  if (override !== undefined) {
    return {
      date,
      weekday,
      closed: override.closed,
      windows: override.closed ? [] : override.windows,
      source: "date_override",
      note: override.note,
    };
  }

  const day = config.weekly.find((entry) => entry.day === weekday);
  return {
    date,
    weekday,
    closed: day === undefined ? true : day.closed,
    windows: day === undefined || day.closed ? [] : day.windows,
    source: "weekly",
    note: "",
  };
}

export interface AvailabilityView {
  timezone: string;
  today: ResolvedDay;
  days: ResolvedDay[];
  availableNow: boolean;
}

export function resolveAvailability(
  config: AvailabilityConfig,
  now: Date = new Date(),
): AvailabilityView {
  const todayDate = dateInTimeZone(now, config.timezone);
  const currentTime = timeInTimeZone(now, config.timezone);
  const days = Array.from({ length: 7 }, (_, offset) =>
    resolveAvailabilityDay(config, addDays(todayDate, offset)),
  );
  const today = days[0] ?? resolveAvailabilityDay(config, todayDate);
  const availableNow =
    !today.closed && today.windows.some((window) => currentTime >= window.start && currentTime < window.end);

  return { timezone: config.timezone, today, days, availableNow };
}

function describeWindows(windows: AvailabilityWindow[]): string {
  return windows.map((window) => `${window.start}–${window.end}`).join(", ");
}

export function describeDay(day: ResolvedDay): string {
  if (day.closed) {
    const reason =
      day.source === "temporary_closure" && day.note.length > 0
        ? ` (temporary closure: ${day.note})`
        : day.source === "date_override"
          ? " (date-specific)"
          : "";
    return `${day.weekday} ${day.date}: closed${reason}`;
  }
  const suffix = day.source === "date_override" ? " (date-specific)" : "";
  return `${day.weekday} ${day.date}: ${describeWindows(day.windows)}${suffix}`;
}

export interface CustomizationVariables {
  availability_summary: string;
  available_today: string;
  todays_hours: string;
  next_7_days: string;
  timezone: string;
  appointment_booking: string;
  appointment_rules: string;
  appointment_mode: string;
  cancellation_policy: string;
  rescheduling_policy: string;
  callback_behavior: string;
  urgent_call_instructions: string;
  emergency_instructions: string;
  business_specific_instructions: string;
  safety_instructions: string;
}

function policySentence(
  policy: CancellationPolicyConfig | ReschedulingPolicyConfig | null,
): string {
  if (policy === null) return "";
  const parts = [policy.policyText];
  if (policy.cutoffHours > 0) parts.push(`The cutoff is ${policy.cutoffHours} hours before the slot.`);
  if (policy.feeNote.length > 0) parts.push(policy.feeNote);
  return parts.filter(Boolean).join(" ").trim();
}

export function buildCustomizationVariables(
  active: ActiveCustomizations,
  now: Date = new Date(),
): CustomizationVariables {
  const availability = active.availability;
  const view = availability === null ? null : resolveAvailability(availability, now);

  const availabilitySummary =
    view === null
      ? "Availability is not configured. Do not claim the business is open; offer to take a callback request."
      : `Today: ${describeDay(view.today)}. Upcoming: ${view.days
          .slice(1)
          .map(describeDay)
          .join("; ")}.`;

  const appointment = active.appointmentBooking;
  const callback = active.callbackRequests;
  const urgent = active.urgentCallHandling;

  const callbackBehavior =
    callback === null
      ? "Callback requests are not configured. Do not promise a callback; take the caller's number and say the owner must confirm."
      : [
          callback.instructions,
          callback.collectPhone ? "Collect a phone number the owner can call back." : "",
          `The owner aims to respond within ${callback.responseWindow}.`,
        ]
          .filter(Boolean)
          .join(" ");

  return {
    availability_summary: availabilitySummary,
    available_today: view === null ? "unknown" : view.today.closed ? "no" : "yes",
    todays_hours: view === null ? "unknown" : view.today.closed ? "closed" : describeWindows(view.today.windows),
    next_7_days: view === null ? "" : view.days.map(describeDay).join("; "),
    timezone: availability?.timezone ?? DEFAULT_TIMEZONE,
    appointment_booking: appointment === null ? "disabled" : "enabled",
    appointment_rules: appointment?.bookingRules ?? "",
    appointment_mode: "request_only",
    cancellation_policy: policySentence(active.cancellationPolicy),
    rescheduling_policy: policySentence(active.reschedulingPolicy),
    callback_behavior: callbackBehavior,
    urgent_call_instructions: urgent?.instructions ?? "",
    emergency_instructions:
      urgent?.emergencyInstructions ?? CUSTOMIZATION_DEFAULTS.urgent_call_handling.emergencyInstructions,
    business_specific_instructions: active.businessInstructions?.instructions ?? "",
    safety_instructions: SAFETY_INSTRUCTIONS,
  };
}

// ---------------------------------------------------------------------------
// Appointment / cancellation requests — never a confirmation
// ---------------------------------------------------------------------------

export const VOICE_REQUEST_TYPES = ["appointment", "reschedule", "cancellation", "callback"] as const;
export type VoiceRequestType = (typeof VOICE_REQUEST_TYPES)[number];

export interface VoiceRequestDisposition {
  accepted: boolean;
  /** Literal false: no calendar integration exists, so nothing can be confirmed. */
  confirmed: false;
  pending: boolean;
  intent: string;
  rule: RuleId;
  state: "triaged" | "escalated";
  actionStatus: "draft" | "escalated";
  urgency: number;
  message: string;
}

export function requestDisposition(input: {
  requestType: VoiceRequestType;
  appointmentEnabled: boolean;
  emergency: boolean;
}): VoiceRequestDisposition {
  if (input.emergency) {
    return {
      accepted: true,
      confirmed: false,
      pending: false,
      intent: "voice_emergency",
      rule: "R1",
      state: "escalated",
      actionStatus: "escalated",
      urgency: 100,
      message:
        "This sounds like an emergency. Tell the caller to contact local emergency services now. The business has been alerted.",
    };
  }

  if (
    (input.requestType === "appointment" || input.requestType === "reschedule") &&
    !input.appointmentEnabled
  ) {
    return {
      accepted: false,
      confirmed: false,
      pending: false,
      intent: "voice_request_rejected",
      rule: "R5",
      state: "triaged",
      actionStatus: "draft",
      urgency: 30,
      message:
        "Appointment booking is disabled for this business. Offer a callback request instead; do not promise a slot.",
    };
  }

  const intents: Record<VoiceRequestType, { intent: string; urgency: number }> = {
    appointment: { intent: "appointment_request", urgency: 40 },
    reschedule: { intent: "reschedule_request", urgency: 45 },
    cancellation: { intent: "cancellation_request", urgency: 50 },
    callback: { intent: "callback_request", urgency: 35 },
  };
  const chosen = intents[input.requestType];

  return {
    accepted: true,
    confirmed: false,
    pending: true,
    intent: chosen.intent,
    rule: "R5",
    state: "triaged",
    actionStatus: "draft",
    urgency: chosen.urgency,
    message:
      "Request recorded. The business still has to confirm it; tell the caller it is pending and do not say it is booked or cancelled.",
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export async function loadCustomizationRows(
  businessId: string,
): Promise<BusinessVoiceAgentCustomization[]> {
  return prisma.businessVoiceAgentCustomization.findMany({
    where: { businessId },
    orderBy: { customizationType: "asc" },
  });
}

export async function loadActiveCustomizations(
  businessId: string,
): Promise<ActiveCustomizations> {
  return readActiveCustomizations(await loadCustomizationRows(businessId));
}

export async function saveCustomizations(
  businessId: string,
  updates: ParsedCustomization[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      const configuration = JSON.stringify(update.configuration);
      await tx.businessVoiceAgentCustomization.upsert({
        where: { businessId_customizationType: { businessId, customizationType: update.type } },
        create: {
          businessId,
          customizationType: update.type,
          configuration,
          isEnabled: update.isEnabled,
        },
        update: { configuration, isEnabled: update.isEnabled },
      });
    }
  });
}

export interface CustomizationOwnerEntry {
  isEnabled: boolean;
  configuration: unknown;
  updatedAt: string | null;
}

export interface CustomizationOwnerResponse {
  businessId: string;
  customizations: Record<CustomizationType, CustomizationOwnerEntry>;
}

const DEFAULT_PARSERS: Record<CustomizationType, (value: unknown) => unknown> = {
  availability: parseAvailabilityConfig,
  appointment_booking: parseAppointmentBookingConfig,
  cancellation_policy: parseCancellationPolicyConfig,
  rescheduling_policy: parseReschedulingPolicyConfig,
  callback_requests: parseCallbackRequestsConfig,
  urgent_call_handling: parseUrgentCallConfig,
  business_specific_instructions: parseBusinessInstructionsConfig,
};

export async function buildOwnerCustomizationsResponse(
  businessId: string,
): Promise<CustomizationOwnerResponse> {
  const rows = await loadCustomizationRows(businessId);
  const byType = new Map(rows.map((row) => [row.customizationType, row]));

  const customizations = {} as Record<CustomizationType, CustomizationOwnerEntry>;
  for (const type of CUSTOMIZATION_TYPES) {
    const row = byType.get(type);
    if (row === undefined) {
      customizations[type] = {
        isEnabled: false,
        configuration: CUSTOMIZATION_DEFAULTS[type],
        updatedAt: null,
      };
      continue;
    }
    customizations[type] = {
      isEnabled: row.isEnabled,
      configuration: parseStored(type, row.configuration, DEFAULT_PARSERS[type], CUSTOMIZATION_DEFAULTS[type]),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  return { businessId, customizations };
}
