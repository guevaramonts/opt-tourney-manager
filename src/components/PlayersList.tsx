import React, { useEffect, useState } from 'react'
import { db, Player } from '../db'

function formatPhoneDisplay(raw?: string) {
  if (!raw) return '-'
  const digits = raw.replace(/\D/g, '').slice(0,10)
  if (digits.length === 0) return '-'
  if (digits.length < 4) return `(${digits}`
  if (digits.length < 7) return `(${digits.slice(0,3)}) ${digits.slice(3)}`
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
}

export default function PlayersList() {
  const [players, setPlayers] = useState<Player[]>([])

  async function load() {
    const all = await db.listPlayers()
    setPlayers(all)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    const h = () => load()
    window.addEventListener('players-updated', h)
    return () => window.removeEventListener('players-updated', h)
  }, [])

  async function remove(id?: number) {
    if (!id) return
    await db.deletePlayerById(id)
    load()
  }

  return (
    <div>
      <h2>Players</h2>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th style={{textAlign:'left'}}>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Season Paid</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {players.map(p => (
            <tr key={p.id} style={{borderTop:'1px solid #eee'}}>
              <td>{p.name}</td>
              <td style={{textAlign:'center'}}>{p.email || '-'}</td>
              <td style={{textAlign:'center'}}>{formatPhoneDisplay(p.phone)}</td>
              <td style={{textAlign:'center'}}>{p.seasonPayment?.paid ? 'Yes' : 'No'}</td>
              <td style={{textAlign:'right'}}><button onClick={()=>remove(p.id)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
