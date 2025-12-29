export const normalizePHPhoneNumber = (input: string): string | null => {
  const cleaned = input.replace(/\s|-/g, "");

  if (/^09\d{9}$/.test(cleaned)) {
    return "+63" + cleaned.slice(1);
  }

  if (/^9\d{9}$/.test(cleaned)) {
    return "+63" + cleaned;
  }

  if (/^\+639\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
};
