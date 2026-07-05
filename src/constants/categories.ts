// Keep in sync with client/src/constants/categories.ts
export const CATEGORY_VALUES = [
  "food",
  "groceries",
  "transport",
  "shopping",
  "bills",
  "rent",
  "health",
  "entertainment",
  "travel",
  "education",
  "investments",
  "gifts",
  "personal",
  "other",
] as const;

export type CategoryValue = (typeof CATEGORY_VALUES)[number];

// Human-friendly labels for each category value (keep in sync with the client).
// Used to describe the allowed categories to the AI model.
export const CATEGORY_LABELS: Record<CategoryValue, string> = {
  food: "Food & Dining (restaurants, cafes, eating out)",
  groceries: "Groceries (supermarket, vegetables, kitchen supplies)",
  transport: "Transport (cab, auto, fuel, metro, bus, parking)",
  shopping: "Shopping (clothes, electronics, general retail)",
  bills: "Bills & Utilities (electricity, water, internet, phone, gas)",
  rent: "Rent & Housing (rent, maintenance, EMI on home)",
  health: "Health & Medical (doctor, medicines, pharmacy, hospital)",
  entertainment: "Entertainment (movies, OTT, games, events)",
  travel: "Travel (flights, trains, hotels, trips)",
  education: "Education (courses, books, tuition, fees)",
  investments: "Investments (mutual funds, stocks, SIP, savings)",
  gifts: "Gifts & Donations (presents, charity, gifting)",
  personal: "Personal Care (salon, grooming, cosmetics, gym)",
  other: "Other (anything that doesn't fit the above)",
};

// A legend string ("value = description") to embed in the tool's category description.
export const CATEGORY_LEGEND = CATEGORY_VALUES.map(
  (v) => `"${v}" = ${CATEGORY_LABELS[v]}`
).join("; ");

export function isValidCategory(value: string): value is CategoryValue {
  return (CATEGORY_VALUES as readonly string[]).includes(value);
}
