// Checking an enquiry. Shared by the form (so mistakes are shown next to the field as people type) and by the server
// (which never trusts the browser), so both always agree.

export interface ContactInput {
  name: string;
  email: string;
  phone: string;
  company: string;
  projectType: string;
  budget: string;
  timeline: string;
  /** The description of the project. */
  message: string;
}

export type ContactField = keyof ContactInput;
export type ContactErrors = Partial<Record<ContactField, string>>;

export const CONTACT_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  emailMax: 254,
  phoneMinDigits: 7,
  phoneMaxDigits: 15,
  companyMax: 100,
  choiceMax: 100,
  messageMin: 10,
  messageMax: 2000,
} as const;

/** Letters of any alphabet, then letters, spaces, dots, apostrophes and hyphens: "Sasank Muppalla", "D'Souza", "Ravi K." */
const NAME = /^\p{L}[\p{L}\p{M}\s.'’-]*$/u;
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

const text = (v: unknown) => (typeof v === "string" ? v.replace(/\u0000/g, "").trim() : "");

/** "+91 98765-43210" → "+919876543210": a leading + and digits only. */
export function normalizePhone(raw: string): string {
  const plus = raw.trim().startsWith("+") ? "+" : "";
  return plus + raw.replace(/\D/g, "");
}

/** Which fields are wrong, and why in plain words. Nothing wrong = `errors` is empty and `value` is the cleaned enquiry. */
export function validateContact(raw: Record<string, unknown>): { errors: ContactErrors; value: ContactInput } {
  const L = CONTACT_LIMITS;
  const value: ContactInput = {
    name: text(raw.name).replace(/\s+/g, " "),
    email: text(raw.email).toLowerCase(),
    phone: text(raw.phone),
    company: text(raw.company).replace(/\s+/g, " "),
    projectType: text(raw.projectType),
    budget: text(raw.budget),
    timeline: text(raw.timeline),
    message: text(raw.message).replace(/\r\n?/g, "\n"),
  };
  const errors: ContactErrors = {};

  if (!value.name) errors.name = "Please enter your name.";
  else if (value.name.length < L.nameMin || (value.name.match(/\p{L}/gu)?.length ?? 0) < L.nameMin) errors.name = "Your name needs at least two letters.";
  else if (value.name.length > L.nameMax) errors.name = `Please keep your name under ${L.nameMax} characters.`;
  else if (!NAME.test(value.name)) errors.name = "Use letters only in your name (spaces, dots, apostrophes and hyphens are fine).";

  if (!value.email) errors.email = "Please enter your email address.";
  else if (value.email.length > L.emailMax || !EMAIL.test(value.email)) errors.email = "That email address doesn’t look right (for example name@example.com).";

  const digits = value.phone.replace(/\D/g, "");
  if (!value.phone) errors.phone = "Please enter a phone number we can reach you on.";
  else if (!/^\+?[\d\s().-]+$/.test(value.phone)) errors.phone = "Use digits only in the phone number (a leading + and spaces are fine).";
  else if (digits.length < L.phoneMinDigits || digits.length > L.phoneMaxDigits) errors.phone = `A phone number has ${L.phoneMinDigits} to ${L.phoneMaxDigits} digits. Include the country code if it’s not an Indian number.`;
  else if (/^(\d)\1+$/.test(digits)) errors.phone = "That phone number doesn’t look real.";
  else value.phone = normalizePhone(value.phone);

  if (value.company.length > L.companyMax) errors.company = `Please keep this under ${L.companyMax} characters.`;
  if (!value.projectType) errors.projectType = "Please choose the kind of project.";
  else if (value.projectType.length > L.choiceMax) errors.projectType = "That choice isn’t valid.";
  if (value.budget.length > L.choiceMax) errors.budget = "That choice isn’t valid.";
  if (value.timeline.length > L.choiceMax) errors.timeline = "That choice isn’t valid.";

  if (!value.message) errors.message = "Please describe your project.";
  else if (value.message.length < L.messageMin) errors.message = `Tell us a little more: at least ${L.messageMin} characters.`;
  else if (value.message.length > L.messageMax) errors.message = `Please keep the description under ${L.messageMax} characters (it is ${value.message.length}).`;
  else if (new Set(value.message.replace(/\s/g, "")).size < 4) errors.message = "That description doesn’t look real. Tell us about your project.";

  return { errors, value };
}
