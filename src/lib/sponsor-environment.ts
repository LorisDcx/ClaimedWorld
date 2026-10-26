import { stripeEnvironment } from './payments-config';

// Campaign artwork and game accounts are shared; financial records never are.
// The existing tables remain the test register, without copying or deleting funds.
export const sponsorFinancialTables = [
  'sponsor_wallets',
  'sponsor_topups',
  'sponsor_stakes',
  'sponsor_ownership',
  'sponsor_clock',
  'sponsor_disputes',
  'sponsor_ledger',
  'webhook_events',
] as const;
const financial = new Set<string>(sponsorFinancialTables);

export function sponsorEnvironmentQuery(
  source: string,
  environment = stripeEnvironment() || 'test',
) {
  if (environment !== 'live') return source;
  // Rewrite only fixed SQL identifiers, never literals, values or parameters.
  return source.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\b[a-z_][a-z_0-9]*\b/gi, (token) =>
    financial.has(token.toLowerCase()) ? `live_${token.toLowerCase()}` : token,
  );
}
