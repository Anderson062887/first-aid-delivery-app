import { Router } from 'express';
import User from '../models/User.js';

const r = Router();

r.get('/', async (req,res)=>{ res.json(await User.find().sort('name')); });

r.post('/', async (req,res)=>{
  const { name, email, role='rep', active=true } = req.body;
  if(!name) return res.status(400).json({error:'name is required'});
  const user = await User.create({ name, email, role, active });
  res.status(201).json(user);
});

r.put('/:id', async (req,res)=>{
  const u = await User.findByIdAndUpdate(req.params.id, req.body, { new:true });
  res.json(u);
});

r.delete('/:id', async (req,res)=>{
  await User.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

export default r;
