export function formatPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "").trim();
  if (!digits) return "Numer z ustawień";
  if (digits.startsWith("+") && digits.length >= 11) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  if (digits.length === 9) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return digits;
}
