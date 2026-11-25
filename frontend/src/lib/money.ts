// Prices are stored in US dollars (the Amazon dataset is in USD).
// They are shown and entered in Indian rupees using this single rate.
// Change it here, or set VITE_USD_TO_INR in frontend/.env, to update every price.
export const USD_TO_INR: number = Number(import.meta.env.VITE_USD_TO_INR ?? 83);

const inrFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

/** Display a stored USD price as rupees, e.g. "₹1,659". */
export function formatINR(usd: string | number | null | undefined): string {
  const n = toNumber(usd);
  return n === null ? "—" : inrFormat.format(n * USD_TO_INR);
}

/** Stored USD value -> rupee string for a form field, e.g. "1659.17". */
export function usdToInrInput(usd: string | number | null | undefined): string {
  const n = toNumber(usd);
  return n === null ? "" : (n * USD_TO_INR).toFixed(2);
}

/** Rupee value typed in a form field -> USD string to store, e.g. "19.99". */
export function inrInputToUsd(inr: string | number | null | undefined): string {
  const n = toNumber(inr);
  return n === null ? "" : (n / USD_TO_INR).toFixed(2);
}
