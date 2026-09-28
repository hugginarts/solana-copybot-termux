import 'dotenv/config';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { PublicKey } from '@solana/web3.js';
import { randomBytes, verify as verifySignature } from 'node:crypto';
import { Engine } from './src/engine.js';
import { Watcher } from './src/watcher.js';
const app=express(), engine=new Engine(), watcher=new Watcher(engine), server=createServer(app), wss=new WebSocketServer({server});
const challenges=new Map();
let watcherTask=Promise.resolve();
app.use(express.json({limit:'16kb'})); app.use(express.static('public'));
app.get('/api/state',(_,res)=>res.json(engine.snapshot()));
app.post('/api/reset',async(req,res)=>{
 if(req.body?.confirm!=='BORRAR')return res.status(400).json({error:'Confirmación requerida'});
 try {
  await watcher.stop();
  engine.state.config.enabled=false;
  engine.state.status='Pausado · historial paper reiniciado';
  engine.state.positions=[];engine.state.trades=[];engine.state.events=[];engine.state.lastSignal=null;
  engine.emit();res.json(engine.snapshot());
 } catch(e) { res.status(500).json({error:e.message}); }
});
app.post('/api/wallet/challenge',(req,res)=>{
 try {
  const wallet=new PublicKey(req.body?.wallet).toBase58();
  const message=`Solana CopyBot: verificar control de wallet\nWallet: ${wallet}\nNonce: ${randomBytes(16).toString('hex')}\nCaduca: ${new Date(Date.now()+120000).toISOString()}\nEsta firma no autoriza transacciones.`;
  challenges.set(wallet,{message,expires:Date.now()+120000});
  res.json({message});
 } catch {res.status(400).json({error:'Wallet inválida'});}
});
app.post('/api/wallet/verify',(req,res)=>{
 try {
  const key=new PublicKey(req.body?.wallet), wallet=key.toBase58(), challenge=challenges.get(wallet);
  challenges.delete(wallet);
  if(!challenge||challenge.expires<Date.now())return res.status(400).json({error:'Firma caducada. Conecta de nuevo.'});
  const signature=Buffer.from(req.body?.signature||'','base64');
  if(signature.length!==64)throw Error('Firma inválida');
  const publicKey={key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key.toBytes())]),format:'der',type:'spki'};
  if(!verifySignature(null,Buffer.from(challenge.message,'utf8'),publicKey,signature))throw Error('La firma no corresponde a la wallet');
  res.json({verified:true,wallet,liveEnabled:false});
 } catch(e) {res.status(400).json({error:e.message});}
});
app.post('/api/config',async(req,res)=>{
 const {wallet,solAmount,maxSlippage,takeProfit,takeProfitSellPct,trailingStopPct,stopLoss,minLiquidityUsd,maxPoolAgeMin,priorityFeeSol,enabled,paper}=req.body||{};
 if(paper!==true)return res.status(400).json({error:'Live Trading no implementado.'});
 try{if(wallet)new PublicKey(wallet)}catch{return res.status(400).json({error:'Wallet Solana inválida.'})}
 for(const [name,min,max] of [['solAmount',0.0001,10],['maxSlippage',0.01,50],['takeProfit',0.1,10000],['takeProfitSellPct',1,100],['trailingStopPct',0,99],['stopLoss',0.1,99],['minLiquidityUsd',0,1000000000],['maxPoolAgeMin',0,1000000],['priorityFeeSol',0,0.1]])if(!Number.isFinite(Number(req.body[name]))||Number(req.body[name])<min||Number(req.body[name])>max)return res.status(400).json({error:`${name} fuera de rango (${min}–${max})`});
 if(enabled&&!wallet)return res.status(400).json({error:'Introduzca wallet pública.'});
 engine.state.config={wallet:wallet||'',solAmount:Number(solAmount),maxSlippage:Number(maxSlippage),takeProfit:Number(takeProfit),takeProfitSellPct:Number(takeProfitSellPct),trailingStopPct:Number(trailingStopPct),stopLoss:Number(stopLoss),minLiquidityUsd:Number(minLiquidityUsd),maxPoolAgeMin:Number(maxPoolAgeMin),priorityFeeSol:Number(priorityFeeSol),enabled:enabled===true,paper:true};
 engine.state.status=enabled?'Conectando RPC…':'Pausado';engine.emit();res.json(engine.snapshot());
 watcherTask=watcherTask.catch(()=>{}).then(()=>watcher.start()).catch(e=>engine.event(`Error RPC: ${e.message}`));
});
wss.on('connection',s=>s.send(JSON.stringify(engine.snapshot())));
engine.onUpdate=s=>{const m=JSON.stringify(s);for(const client of wss.clients)if(client.readyState===1)client.send(m)};
setInterval(()=>watcher.refresh().catch(e=>engine.event(`Error actualización: ${e.message}`)),Math.max(5000,Number(process.env.POLL_MS)||12000));
server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log('Panel paper: http://localhost:3000'));
