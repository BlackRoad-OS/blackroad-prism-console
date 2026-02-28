import 'dotenv/config';
import Stripe from 'stripe';

const stripeKey = process.env.STRIPE_KEY;
if (!stripeKey) {
  console.error('Missing STRIPE_KEY in environment.');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
const currency = process.env.CURRENCY || 'usd';

interface ProductDef {
  name: string;
  description: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  features: string[];
}

const products: ProductDef[] = [
  {
    name: 'BlackRoad Free',
    description: 'Starter tier – 1 project, 1 agent, 100 prompts/month, 500 MB storage',
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    features: ['1 project', '1 agent', '100 prompts/month', 'community support', '500 MB storage']
  },
  {
    name: 'BlackRoad Creator',
    description: '10 projects, 5 agents, 5K prompts/mo, RoadCoin minting, 10 GB storage',
    monthlyPriceCents: 900,
    yearlyPriceCents: 9000,
    features: ['10 projects', '5 agents', '5,000 prompts/mo', 'RoadCoin minting (basic)', '10 GB storage']
  },
  {
    name: 'BlackRoad Pro',
    description: 'Unlimited projects, 20 agents, 25K prompts/mo, full Orchestrator, 100 GB storage',
    monthlyPriceCents: 2900,
    yearlyPriceCents: 29000,
    features: ['unlimited projects', '20 agents', '25,000 prompts/mo', 'Orchestrator (full)', '100 GB storage']
  },
  {
    name: 'BlackRoad Enterprise',
    description: 'SSO/SAML, custom limits, private models, SLA, dedicated support, unlimited storage',
    monthlyPriceCents: 49900,
    yearlyPriceCents: 499000,
    features: ['SSO/SAML', 'custom limits', 'private models', 'SLA', 'unlimited storage']
  },
  {
    name: 'BlackRoad Drive',
    description: '50 GB additional storage add-on with RoadView asset hosting and shareable links',
    monthlyPriceCents: 499,
    yearlyPriceCents: 4990,
    features: ['50 GB additional storage', 'RoadView asset hosting', 'version history', 'shareable links']
  }
];

async function main() {
  console.log('Seeding Stripe products for BlackRoad …');

  for (const def of products) {
    // Skip creating prices for free tier (no billing needed)
    if (def.monthlyPriceCents === 0 && def.yearlyPriceCents === 0) {
      const prod = await stripe.products.create({
        name: def.name,
        description: def.description,
        metadata: { features: JSON.stringify(def.features) }
      });
      console.log(`  ✓ ${def.name}: product=${prod.id} (free – no prices created)`);
      continue;
    }

    const prod = await stripe.products.create({
      name: def.name,
      description: def.description,
      metadata: { features: JSON.stringify(def.features) }
    });

    const monthly = await stripe.prices.create({
      unit_amount: def.monthlyPriceCents,
      currency,
      recurring: { interval: 'month' },
      product: prod.id
    });

    const yearly = await stripe.prices.create({
      unit_amount: def.yearlyPriceCents,
      currency,
      recurring: { interval: 'year' },
      product: prod.id
    });

    console.log(`  ✓ ${def.name}: product=${prod.id} monthly=${monthly.id} yearly=${yearly.id}`);
  }

  // Create sample customers for testing
  const alice = await stripe.customers.create({
    email: 'alice@example.com',
    name: 'Alice Example'
  });
  const bob = await stripe.customers.create({
    email: 'bob@example.com',
    name: 'Bob Example'
  });

  console.log(`  ✓ Customers: ${alice.email}, ${bob.email}`);

  // Optional workflow-dispatched charge
  const extraAmount = Number(process.env.AMOUNT || '0');
  if (!Number.isNaN(extraAmount) && extraAmount > 0) {
    await stripe.charges.create({
      amount: extraAmount,
      currency,
      customer: bob.id,
      description: 'Workflow-dispatched charge',
      source: 'tok_visa'
    });
    console.log(`  ✓ Extra charge of ${extraAmount} cents on ${bob.email}`);
  }

  console.log('Done – all BlackRoad products seeded.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
