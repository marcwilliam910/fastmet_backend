export function isValidDate(dateString: string): boolean {
  // Check if string exists
  if (!dateString || typeof dateString !== "string") {
    return false;
  }

  // Check ISO format with regex (optional but recommended)
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!isoRegex.test(dateString)) {
    return false;
  }

  // Check if it creates a valid date
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date.toISOString() === dateString;
}

export const getLateBoundary = () => {
  const now = new Date();
  const lateThresholdMinutes = 30;
  return new Date(now.getTime() - lateThresholdMinutes * 60 * 1000);
};

export function formatDate(dateString: string) {
  const date = new Date(dateString);

  const dateOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };

  const formattedDate = date
    .toLocaleDateString("en-US", dateOptions)
    .replace(",", "")
    .replace(/(\b[A-Za-z]{3})/, "$1."); // add dot after month

  const formattedTime = date.toLocaleTimeString("en-US", timeOptions);

  return `${formattedDate}, ${formattedTime}`;
}
