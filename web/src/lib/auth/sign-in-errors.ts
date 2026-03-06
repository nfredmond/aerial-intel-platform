type SignInErrorLike = {
  message?: string;
  code?: string;
} | null;

const GENERIC_SIGN_IN_ERROR =
  "We couldn’t sign you in right now. Please try again, or contact support if this keeps happening.";

export function getFriendlySignInError(error: SignInErrorLike) {
  if (!error) {
    return GENERIC_SIGN_IN_ERROR;
  }

  const normalized = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid_credentials")
  ) {
    return "We couldn’t match that email and password. Double-check your credentials and try again.";
  }

  if (
    normalized.includes("email not confirmed") ||
    normalized.includes("email_not_confirmed")
  ) {
    return "Your email is not verified yet. Check your inbox for a confirmation message or contact support.";
  }

  if (
    normalized.includes("too many requests") ||
    normalized.includes("rate limit") ||
    normalized.includes("over_email_send_rate_limit")
  ) {
    return "Too many sign-in attempts were detected. Wait a moment, then try again.";
  }

  return GENERIC_SIGN_IN_ERROR;
}
