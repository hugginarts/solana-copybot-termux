import { Connection, PublicKey } from '@solana/web3.js';
import { SOL_MINT } from './engine.js';
import { getMarket } from './market.js';
const IGNORED = new Set([SOL_MINT, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERpT4E5iwmtRv5w3gCfYg9PZb8QzVtV']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
export class Watcher {
  constructor(engine) { this.engine = engine; this.conn = new Connection(process.env.RPC_HTTP || 'https://api.mainnet-beta.solana.com', { commitment: 'confirmed', wsEndpoint: process.env.RPC_WS || 'wss://api.mainnet-beta.solana.com' }); this.subscription = null; this.generation = 0; this.seen = new Set(); this.queue = Promise.resolve(); this.busy = false; }
  async stop() { this.generation++; if (this.subscription != null) { try { await this.conn.removeOnLogsListener(this.subscription); } catch {} this.subscription = null; } }
  async start() {
    await this.stop(); this.seen.clear(); const c = this.engine.state.config; if (!c.enabled || !c.wallet) return;
    const gen = this.generation, wallet = new PublicKey(c.wallet);
    try { this.subscription = await this.conn.onLogs(wallet, ({ signature, err }) => { if (err || this.seen.has(signature)) return; this.seen.add(signature); if (this.seen.size > 2000) this.seen.clear(); this.queue = this.queue.then(() => this.process(signature, wallet, gen)).catch(async e => { if (/\b429\b|rate limit|too many requests/i.test(e.message)) { this.engine.state.config.enabled = false; this.engine.state.status = 'RPC limitado (429): seguimiento pausado. Configura un RPC privado y reinicia.'; await this.stop(); } this.engine.event(`Error señal: ${e.message}`); }); }, 'confirmed'); this.engine.state.status = 'Escuchando transacciones confirmadas'; this.engine.emit(); }
    catch (e) { this.engine.state.status = `RPC sin conexión: ${e.message}`; this.engine.emit(); }
  }
  async process(signature, wallet, gen) {
    let tx; for (let n=0; n<5; n++) { if (gen !== this.generation) return; tx = await this.conn.getParsedTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 1 }); if (tx) break; await sleep(700 * (n+1)); }
    if (!tx || tx.meta?.err || gen !== this.generation) return;
    const keys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());
    const idx = keys.indexOf(wallet.toBase58()); if (idx < 0) return;
    const solDelta = (tx.meta.postBalances[idx] - tx.meta.preBalances[idx] + (keys[0] === wallet.toBase58() ? tx.meta.fee : 0)) / 1e9;
    const balance = (rows, mint) => rows.filter(x => x.owner === wallet.toBase58() && x.mint === mint).reduce((s,x) => s + Number(x.uiTokenAmount?.uiAmountString || 0), 0);
    const mints = new Set([...tx.meta.preTokenBalances, ...tx.meta.postTokenBalances].filter(x => x.owner === wallet.toBase58()).map(x => x.mint));
    for (const mint of mints) {
      if (IGNORED.has(mint) || gen !== this.generation) continue;
      const delta = balance(tx.meta.postTokenBalances, mint) - balance(tx.meta.preTokenBalances, mint);
      if (Math.abs(delta) < 1e-12) continue;
      // SOL-wrapped/USDC routes may have near-zero native SOL balance change; those are intentionally skipped.
      if ((delta > 0 && solDelta >= -0.00001) || (delta < 0 && solDelta <= 0.00001)) continue;
      try { const quote = await getMarket(mint); if (gen !== this.generation) return; if (quote) this.engine.setMarket(mint, quote); if (delta > 0) this.engine.buy(mint, signature); else this.engine.sell(mint, 'WALLET COPIADA', signature); } catch(e) { this.engine.event(`Cotización no disponible: ${e.message}`); }
    }
    this.engine.state.lastSignal = { signature, at: new Date().toISOString() }; this.engine.emit();
  }
  async refresh() {
    if (this.busy) return; this.busy = true;
    try { for (const p of [...this.engine.state.positions]) { try { this.engine.setMarket(p.mint, await getMarket(p.mint)); } catch(e) { this.engine.state.status = `Error de precio: ${e.message}`; this.engine.emit(); } } this.engine.checkExits(); } finally { this.busy = false; }
  }
}
