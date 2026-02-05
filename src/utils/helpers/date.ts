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
