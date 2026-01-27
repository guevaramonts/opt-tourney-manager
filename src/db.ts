import Dexie, { Table } from 'dexie'

export interface Player {
  id?: number
  playerId: string
  name: string
  alias?: string
  contact?: string
}

export class OptDB extends Dexie {
  players!: Table<Player, number>

  constructor() {
    super('opt-db')
    this.version(1).stores({
      players: '++id,playerId,name,alias'
    })
  }
}

export const db = new OptDB()
