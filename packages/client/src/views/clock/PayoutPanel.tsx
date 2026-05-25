export interface PayoutResult {
  playerCount: number;
  buyInTotal: number;
  prizePool: number;
  bountyPool: number;
  paidOutBounties: number;
  payouts: Array<{ place: number; amount: number }>;
}

interface Props {
  payouts: PayoutResult | null;
}

export default function PayoutPanel({ payouts }: Props) {
  return (
    <div className="shrink-0">
      <h2 className="text-sm uppercase tracking-[0.18em] text-green-400 font-semibold mb-2.5">
        Payouts
      </h2>

      {!payouts ? (
        <p className="text-gray-600 text-sm">No payout data yet…</p>
      ) : (
        <div className="rounded-lg px-3 py-2 border border-green-900/30 bg-black/20">
          <p className="text-sm text-gray-300 font-mono leading-6">
            Players {payouts.playerCount} · Buy-in ${payouts.buyInTotal.toLocaleString()} · Prize ${payouts.prizePool.toLocaleString()} · Bounty ${payouts.bountyPool.toLocaleString()}
          </p>
          <p className="mt-1.5 text-base text-gray-100 font-mono leading-7">
            {payouts.payouts
              .slice(0, 3)
              .map((e) => `${e.place}${e.place === 1 ? 'st' : e.place === 2 ? 'nd' : 'rd'} $${e.amount.toLocaleString()}`)
              .join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
}
