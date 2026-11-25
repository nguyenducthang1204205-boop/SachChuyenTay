import { LOCALE } from "@sct/shared";

const vnd = new Intl.NumberFormat(LOCALE);
const num = new Intl.NumberFormat(LOCALE);

/** 45000 → "45.000₫" */
export const formatVnd = (amount: number) => `${vnd.format(Math.round(amount))}₫`;

export const formatNumber = (n: number) => num.format(n);
