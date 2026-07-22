'use client';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Car, RotateCcw, Search } from 'lucide-react';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';

/** The four car-movement flows + a "view all cars" tile — the screen behind the Cars In / Out button. */
const TILES = [
  {
    href: '/inout/new?kind=in',
    label: 'Customer car IN',
    sub: 'Damaged car for repair',
    color: 'var(--at-red)',
    Icon: ArrowDown,
  },
  {
    href: '/inout/new?kind=out',
    label: 'Loan car OUT',
    sub: 'Give courtesy car to customer',
    color: 'var(--at-blue)',
    Icon: ArrowUp,
  },
  {
    href: '/inout/new?kind=back',
    label: 'Give car back',
    sub: 'Repaired car to customer',
    color: 'var(--at-green)',
    Icon: Car,
  },
  {
    href: '/inout/new?kind=return',
    label: 'Loan car back',
    sub: 'Our car returned',
    color: 'var(--at-green)',
    Icon: RotateCcw,
  },
] as const;

export function CarsMenu() {
  return (
    <>
      <AtTopbar backHref="/" right={<SignOutButton />} />
      <div className="at-h2">Cars In / Out</div>
      <div className="at-tiles">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="at-tile">
            <span className="ti-ic" style={{ background: t.color }}>
              <t.Icon size={33} strokeWidth={2} color="#fff" />
            </span>
            <span className="ti-lab">{t.label}</span>
            <span className="ti-sub">{t.sub}</span>
          </Link>
        ))}
        <Link href="/inout/cars" className="at-tile wide">
          <span className="ti-ic" style={{ background: 'var(--at-gray)' }}>
            <Search size={24} strokeWidth={2} color="#fff" />
          </span>
          <span className="ti-lab">View all cars &amp; search rego</span>
        </Link>
      </div>
    </>
  );
}
