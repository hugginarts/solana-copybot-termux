import fs from 'node:fs';
import path from 'node:path';
const STORE = path.resolve('data/state.json');
const BASE_FEE = 0.000005;
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = (n) => Number(n.toFixed(9));
export class Engine {
  constructor() {
    this.state = { config: { wallet: '', solAmount: 0.05, maxSlippage: 3, takeProfit: 25, takeProfitSellPct: 100, trailingStopPct: 0, stopLoss: 12, minLiquidityUsd: 0, maxPoolAgeMin: 0, priorityFeeSol: Number(process.env.PRIORITY_FEE_SOL || 0.0001), paper: true, enabled: false }, positions: [], trades: [], events: [], solUsd: null, status: 'Configure una wallet para iniciar', lastSignal: null };
    try { const saved = JSON.parse(fs.readFileSync(STORE, 'utf8')); this.state.config = { ...this.state.config, ...saved.config, paper: true, enabled: false }; this.state.positions = saved.positions || []; this.state.trades = saved.trades || []; this.state.events = saved.events || []; } catch {}
    this.dexRate = Number(process.env.DEX_FEE_PCT || 0.3) / 100;
    this.market = new Map();
    this.onUpdate = () => {};
  }
  get fee() { return BASE_FEE + Number(this.state.config.priorityFeeSol || 0); }
  save() { fs.mkdirSync(path.dirname(STORE), { recursive: true }); const tmp = `${STORE}.tmp`; fs.writeFileSync(tmp, JSON.stringify({ config: this.state.config, positions: this.state.positions, trades: this.state.trades, events: this.state.events.slice(0, 80) }, null, 2)); fs.renameSync(tmp, STORE); }
  emit() { this.save(); this.onUpdate(this.snapshot()); }
  event(message) { this.state.events.unshift({ at: new Date().toISOString(), message }); this.state.events.length = Math.min(this.state.events.length, 80); this.emit(); }
  snapshot() {
    const closed = this.state.trades.filter(t => t.side === 'SELL');
    const buys = this.state.trades.filter(t => t.side === 'BUY');
    const pnl = closed.reduce((s, t) => s + t.pnlSol, 0);
    const unrealized = this.state.positions.reduce((s, p) => s + (this.estimate(p)?.pnlSol || 0), 0);
    const networkFees = this.state.trades.reduce((s,t)=>s+Number(t.networkFeeSol||0),0);
    const dexFees = this.state.trades.reduce((s,t)=>s+Number(t.dexFeeSol||0),0);
    return { ...this.state, positions: this.state.positions.map(p => ({ ...p, estimate: this.estimate(p) })), metrics: { realizedSol: round(pnl), unrealizedSol: round(unrealized), realizedUsd: this.state.solUsd ? round(pnl * this.state.solUsd) : null, unrealizedUsd: this.state.solUsd ? round(unrealized * this.state.solUsd) : null, total: closed.length, buys: buys.length, wins: closed.filter(t => t.pnlSol > 0).length, losses: closed.filter(t => t.pnlSol <= 0).length, networkFeesSol: round(networkFees), dexFeesSol: round(dexFees), winRate: closed.length ? round(100 * closed.filter(t => t.pnlSol > 0).length / closed.length) : 0 }, model: { networkFeeSol: this.fee, dexFeePct: round(this.dexRate * 100), priceSource: 'DEX Screener API; reservas aproximadas desde liquidity.usd' } };
  }
  setMarket(mint, quote) { if (quote && quote.solPrice > 0 && quote.liquiditySol > 0) { this.market.set(mint, { ...quote, at: Date.now() }); this.state.solUsd = quote.solUsd; this.onUpdate(this.snapshot()); } }
  quote(mint) { const q = this.market.get(mint); return q && Date.now() - q.at < 60000 ? q : null; }
  impact(orderSol, liquiditySol) { // constant-product approximation; liquidity is two-sided USD TVL / 2
    const reserveSol = liquiditySol / 2;
    return orderSol / (reserveSol + orderSol);
  }
  buy(mint, signature) {
    if (this.state.positions.some(p => p.mint === mint)) return this.event(`Compra omitida: posición existente ${mint} · transacción ${signature}`);
    const q = this.quote(mint), c = this.state.config;
    if (!q) return this.event(`Compra omitida: sin cotización o liquidez verificable en DEX Screener · token ${mint} · transacción ${signature}`);
    if (q.liquidityUsd < c.minLiquidityUsd) return this.event(`Compra omitida: liquidez $${q.liquidityUsd.toFixed(0)} inferior al mínimo $${c.minLiquidityUsd} · token ${mint}`);
    if (c.maxPoolAgeMin > 0 && (!q.pairCreatedAt || Date.now()-q.pairCreatedAt > c.maxPoolAgeMin*60000)) return this.event(`Compra omitida: pool antiguo o sin fecha verificable · token ${mint}`);
    const spend = c.solAmount, dexFee = spend * this.dexRate, impact = this.impact(spend, q.liquiditySol);
    if (impact * 100 > c.maxSlippage) return this.event(`Compra omitida: impacto ${(impact * 100).toFixed(2)}% supera límite ${c.maxSlippage}% · token ${mint} · transacción ${signature}`);
    const qty = (spend - dexFee) / (q.solPrice * (1 + impact));
    const position = { mint, symbol: q.symbol, qty, entrySolPrice: q.solPrice, costSol: spend + this.fee, spentSol: spend, entryDexFeeSol: dexFee, entryNetworkFeeSol: this.fee, entryImpactPct: impact * 100, liquiditySol: q.liquiditySol, openedAt: new Date().toISOString(), signal: signature, peakPrice: q.solPrice, tpTaken: false, trailingActive: false };
    this.state.positions.unshift(position);
    this.state.trades.unshift({ side: 'BUY', at: position.openedAt, mint, symbol: q.symbol, signal: signature, grossSol: round(spend), dexFeeSol: round(dexFee), networkFeeSol: round(this.fee), impactPct: round(impact * 100), netSol: round(-position.costSol), pnlSol: null, priceSource: q.source });
    this.event(`Compra paper: ${q.symbol} por ${spend} SOL`);
  }
  estimate(p) {
    const q = this.quote(p.mint); if (!q) return null;
    const gross = p.qty * q.solPrice;
    const impact = this.impact(gross, q.liquiditySol);
    const dexFee = gross * (1 - impact) * this.dexRate;
    const proceeds = gross * (1 - impact) - dexFee - this.fee;
    return { pnlSol: round(proceeds - p.costSol), pnlPct: round((proceeds - p.costSol) / p.costSol * 100), proceedsSol: round(proceeds), exitImpactPct: round(impact * 100), exitDexFeeSol: round(dexFee), exitNetworkFeeSol: round(this.fee), priceSol: q.solPrice, quotedAt: new Date(q.at).toISOString() };
  }
  sell(mint, reason, signature = null, fraction = 1) {
    const i = this.state.positions.findIndex(p => p.mint === mint); if (i < 0) return;
    const p = this.state.positions[i], e = this.estimate(p), q = this.quote(mint);
    if (!e) return this.event(`Venta pendiente: no hay precio reciente para ${p.symbol}`);
    const portion=Math.max(0.01,Math.min(1,fraction)), gross=p.qty*portion*q.solPrice;
    const impact=this.impact(gross,q.liquiditySol), fee=gross*(1-impact)*this.dexRate, proceeds=gross*(1-impact)-fee-this.fee;
    if (impact*100 > this.state.config.maxSlippage) return this.event(`Venta pendiente: impacto ${(impact*100).toFixed(2)}% supera límite; ${p.symbol}`);
    const entryCost=p.costSol*portion, entryDexFee=p.entryDexFeeSol*portion, entryNetworkFee=p.entryNetworkFeeSol*portion, pnl=proceeds-entryCost, pnlPct=pnl/entryCost*100;
    if(portion>=1) this.state.positions.splice(i,1);
    else { p.qty*=1-portion;p.costSol*=1-portion;p.spentSol*=1-portion;p.entryDexFeeSol*=1-portion;p.entryNetworkFeeSol*=1-portion;p.tpTaken=true;p.trailingActive=true; }
    this.state.trades.unshift({ side: 'SELL', at: new Date().toISOString(), mint, symbol: p.symbol, signal: signature, reason, portionPct: round(portion*100), grossSol: round(gross), dexFeeSol: round(fee), networkFeeSol: round(this.fee), impactPct: round(impact*100), netSol: round(proceeds), pnlSol: round(pnl), pnlPct: round(pnlPct), entryCostSol: round(entryCost), entryDexFeeSol: round(entryDexFee), entryNetworkFeeSol: round(entryNetworkFee), priceSource: q.source });
    this.event(`Venta paper (${reason}, ${(portion*100).toFixed(0)}%): ${p.symbol}, PNL ${round(pnl)} SOL`);
  }
  checkExits() { if (!this.state.config.enabled) return; for (const p of [...this.state.positions]) {
    const e=this.estimate(p), q=this.quote(p.mint); if(!e||!q) continue;
    p.peakPrice=Math.max(Number(p.peakPrice)||p.entrySolPrice,q.solPrice);
    if(e.pnlPct<=-this.state.config.stopLoss) this.sell(p.mint,'STOP LOSS');
    else if(!p.tpTaken && e.pnlPct>=this.state.config.takeProfit) this.sell(p.mint,'TAKE PROFIT',null,this.state.config.takeProfitSellPct/100);
    else if(p.trailingActive && this.state.config.trailingStopPct>0 && (p.peakPrice-q.solPrice)/p.peakPrice*100>=this.state.config.trailingStopPct) this.sell(p.mint,'TRAILING STOP');
  } }
}
export { SOL_MINT };
