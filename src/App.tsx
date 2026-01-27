import React, { useState } from 'react'
import PlayersList from './components/PlayersList'
import PlayerForm from './components/PlayerForm'

export default function App() {
  const [view, setView] = useState<'players'|'seasons'>('players')

  return (
    <div className="app">
      <header>
        <h1>OPT App — Tournament Manager (PWA)</h1>
      </header>
      <nav style={{marginBottom:12}}>
        <button onClick={()=>setView('players')} style={{marginRight:8}}>Players</button>
        <button onClick={()=>setView('seasons')}>Seasons</button>
      </nav>
      <main>
        {view === 'players' && (
          <section>
            <PlayerForm onCreated={() => {/* no-op for now */}} />
            <PlayersList />
          </section>
        )}
        {view === 'seasons' && (
          <section>
            <h2>Seasons (TODO)</h2>
            <p>Season setup and scoring will be implemented in Phase 2.</p>
          </section>
        )}
      </main>
    </div>
  )
}
