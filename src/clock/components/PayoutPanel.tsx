import type { PayoutResult } from '@shared/types';

interface Props {
  payouts: PayoutResult | null;
}

export default function PayoutPanel({ payouts }: Props) {
  return (
    <div className="shrink-0 mt-4 border-t border-green-900/40 pt-3">
      <h2 className="text-[11px] uppercase tracking-[0.2em] text-green-400 font-semibold mb-2">
        Payouts
      </h2>

      {!payouts ? (
        <p className="text-gray-600 text-xs">No payout data yet…</p>
      ) : (
        <div className="rounded-lg px-3 py-2 border border-green-900/30 bg-black/20">
          <p className="text-[11px] text-gray-500 font-mono">
            Prize ${payouts.prizePool.toLocaleString()} · Bounty ${payouts.bountyPool.toLocaleString()} · Paid ${payouts.paidOutBounties.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-gray-300 font-mono">
            {payouts.payouts
              .slice(0, 3)
              .map((entry) => `${entry.place}${entry.place === 1 ? 'st' : entry.place === 2 ? 'nd' : 'rd'} $${entry.amount.toLocaleString()}`)
              .join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
}