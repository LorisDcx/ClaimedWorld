import type { Metadata } from 'next';
import SponsoringInformation from '@/components/sponsoring-information';
import './terms.css';
export const metadata: Metadata = { title: 'Sponsoring et crédits — CLAIMED.WORLD' };
export default function Page() { return <SponsoringInformation />; }
