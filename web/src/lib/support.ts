export const DRONE_OPS_SUPPORT_EMAIL = "support@natfordplanning.com";

export function createSupportMailto(options: {
  subject: string;
  body?: string;
  email?: string;
}) {
  const email = options.email ?? DRONE_OPS_SUPPORT_EMAIL;
  const subject = encodeURIComponent(options.subject);
  const body = options.body ? `&body=${encodeURIComponent(options.body)}` : "";

  return `mailto:${email}?subject=${subject}${body}`;
}
