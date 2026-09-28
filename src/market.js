import { SOL_MINT } from './engine.js';
const cache = new Map();
async function pairs(mint) {
  const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(mint)}`, { signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`DEX Screener HTTP ${r.status}`);
  return await r.json();
}
export async function getMarket(mint) {
  const cached = cache.get(mint); if (cached && Date.now() - cached.at < 10000) return cached.value;
  const [solPairs, tokenPairs] = await Promise.all([pairs(SOL_MINT), pairs(mint)]);
  const sol = solPairs.find(p => p.baseToken?.address === SOL_MINT && Number(p.priceUsd) > 0);
  const solUsd = Number(sol?.priceUsd);
  if (!solUsd) throw new Error('No se pudo cotizar SOL/USD');
  // DexScreener priceUsd describes baseToken; using it for quoteToken would misprice that token.
  const p = tokenPairs.filter(x => x.chainId === 'solana' && Number(x.liquidity?.usd) > 0 && Number(x.priceUsd) > 0 && x.baseToken?.address === mint).sort((a,b) => Number(b.liquidity.usd) - Number(a.liquidity.usd))[0];
  if (!p) return null;
  const value = { solUsd, solPrice: Number(p.priceUsd) / solUsd, liquiditySol: Number(p.liquidity.usd) / solUsd, liquidityUsd: Number(p.liquidity.usd), pairCreatedAt: Number(p.pairCreatedAt) || null, symbol: p.baseToken.symbol, source: `DEX Screener · ${p.dexId} · ${p.pairAddress}`, pairAddress: p.pairAddress };
  cache.set(mint, { at: Date.now(), value }); return value;
}
