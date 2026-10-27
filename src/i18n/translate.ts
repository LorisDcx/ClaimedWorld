import messages from './messages.json';
import type { Locale } from './locales';
const dictionary: Record<string, string[]> = messages;
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const patterns = Object.keys(dictionary).filter((key) => /\{\d+\}/.test(key)).sort((a,b) => b.length-a.length).map((key) => {
  const slots: number[] = [];
  const escaped = key.split(/(\{\d+\})/).map((part) => {
    if (/^\{\d+\}$/.test(part)) { slots.push(Number(part.slice(1,-1))); return '(.*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { key, slots, expression: new RegExp(`^${escaped}$`, 'u') };
});
export function translate(locale: Locale, source: string | number | null | undefined, values?: readonly unknown[]): string {
  if (source == null) return '';
  const text = String(source);
  const key = normalize(text);
  const entry = dictionary[key];
  if (values) return (locale === 'fr' ? key : entry?.[locale === 'en' ? 0 : 1] || key).replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? ''));
  if (locale === 'fr') return text;
  if (entry) return `${/^\s/.test(text) ? ' ' : ''}${entry[locale === 'en' ? 0 : 1]}${/\s$/.test(text) ? ' ' : ''}`;
  for (const pattern of patterns) {
    const match = pattern.expression.exec(key);
    if (match) {
      const args: string[] = [];
      pattern.slots.forEach((slot,index) => { args[slot] = match[index+1]; });
      return translate(locale, pattern.key, args);
    }
  }
  return text;
}
export function translator(locale: Locale) { return (source: string | number | null | undefined, values?: readonly unknown[]) => translate(locale, source, values); }
