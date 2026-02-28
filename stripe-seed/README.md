# Stripe Test-Mode Seeder

Quickly create all BlackRoad production products, prices, and sample customers
in your Stripe **test** account. This seeds the full product catalog so
dashboards and billing flows light up immediately.

## Setup

```bash
cp .env.example .env
# edit .env and drop in your Stripe **test** secret key (sk_test_...)
npm install
```

## Usage

```bash
npm run seed
```

The script creates:

| Product              | Monthly  | Yearly   | Notes                        |
|----------------------|----------|----------|------------------------------|
| **BlackRoad Free**       | $0       | $0       | No Stripe prices (free tier) |
| **BlackRoad Creator**    | $9       | $90      | Starter paid plan            |
| **BlackRoad Pro**        | $29      | $290     | Full Orchestrator access     |
| **BlackRoad Enterprise** | $499     | $4,990   | SSO, SLA, custom limits      |
| **BlackRoad Drive**      | $4.99    | $49.90   | 50 GB storage add-on         |

- Customers: Alice and Bob Example (test accounts)

After seeding, copy the printed Stripe price IDs into your `.env`:

```
STRIPE_PRICE_CREATOR_MONTH=price_xxx
STRIPE_PRICE_CREATOR_YEAR=price_xxx
STRIPE_PRICE_PRO_MONTH=price_xxx
STRIPE_PRICE_PRO_YEAR=price_xxx
STRIPE_PRICE_ENTERPRISE_MONTH=price_xxx
STRIPE_PRICE_ENTERPRISE_YEAR=price_xxx
STRIPE_PRICE_DRIVE_MONTH=price_xxx
STRIPE_PRICE_DRIVE_YEAR=price_xxx
```

## Notes

- Only test-mode resources are created.
- Set `CURRENCY` in `.env` if you want something other than USD.
- Set `AMOUNT` in `.env` (cents) to create an additional workflow-dispatched charge.
- Re-running the seed will create new objects each time; clean up in the Stripe dashboard if desired.
