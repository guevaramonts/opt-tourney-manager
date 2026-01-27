import React, { useState } from 'react'
import { db, Player } from '../db'

function formatUSPhone(input: string) {
  const digits = input.replace(/\D/g, '').slice(0, 10)
  const len = digits.length
  if (len === 0) return ''
  if (len < 4) return `(${digits}`
  if (len < 7) return `(${digits.slice(0,3)}) ${digits.slice(3)}`
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
}

export default function PlayerForm({ onCreated }: { onCreated?: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function createPlayer(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!name.trim()) return
    const p: Omit<Player, 'id'> = {
      playerId: crypto.randomUUID(),
      name: name.trim(),
      email: email.trim() || undefined,
      // store digits-only for consistency
      phone: phone.replace(/\D/g, '') || undefined,
      seasonRegistered: false
    }
    try {
      await db.addPlayer(p)
    } catch (err: any) {
      if (err?.message === 'player-name-duplicate') {
        setError('A player with this name already exists.')
        return
      }
      throw err
    }
    setName('')
  setEmail('')
  setPhone('')
  onCreated?.()
  // notify other components that the players list changed
  try { window.dispatchEvent(new CustomEvent('players-updated')) } catch {}
  }

  return (
    <form onSubmit={createPlayer} style={{marginBottom:16}}>
  {error && <div style={{color:'crimson',marginBottom:8}}>{error}</div>}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <input placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} />
  <input placeholder="Email (optional)" value={email} onChange={e=>setEmail(e.target.value)} />
  <input placeholder="Phone (optional)" value={phone} onChange={e=>setPhone(formatUSPhone(e.target.value))} />
        <button type="submit">Add player</button>
      </div>
    </form>
  )
}
