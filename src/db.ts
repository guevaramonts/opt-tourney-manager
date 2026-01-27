import Dexie, { Table } from 'dexie'

// Player model expanded to support season registration and payments
export interface SeasonPayment {
  paid: boolean
  amount?: number
  date?: string
  method?: string
  transactionId?: string
  notes?: string
}

export interface TournamentPaymentRecord {
  tournamentId: string
  paid: boolean
  amount?: number
  date?: string
  method?: string
  transactionId?: string
  notes?: string
}

export interface Player {
  id?: number
  playerId: string // external unique id (UUID or similar)
  name: string
  email?: string
  phone?: string
  seasonRegistered?: boolean
  seasonPayment?: SeasonPayment
  tournamentPayments?: TournamentPaymentRecord[]
}

export class OptDB extends Dexie {
  players!: Table<Player, number>

  constructor() {
    super('opt-db')
    this.version(1).stores({
      players: '++id,playerId,name,email,phone,seasonRegistered'
    })
  }

  // convenience helpers
  async addPlayer(p: Omit<Player, 'id'>) {
  // enforce unique name (case-insensitive)
  const nameKey = p.name.trim().toLowerCase()
  const existing = await this.players.filter(x => x.name.trim().toLowerCase() === nameKey).first()
  if (existing) throw new Error('player-name-duplicate')
  return this.players.add(p)
  }

  async listPlayers() {
    return this.players.toArray()
  }

  async deletePlayerById(id: number) {
    return this.players.delete(id)
  }
}

export const db = new OptDB()
