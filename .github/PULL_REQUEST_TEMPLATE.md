<!--
Thanks for contributing to the PayLink JS SDK. Keep the description focused on
what changes and why. Delete any section that does not apply.
-->

## What & why

<!-- What does this PR change, and what problem does it solve? Link issues with "Closes #123". -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that changes existing behavior)
- [ ] Chore / tooling / docs (no runtime behavior change)

## Checklist

- [ ] `npm run verify` passes locally (lint + format + types + tests + build + smoke + exports)
- [ ] Added or updated tests for the change
- [ ] Public API changes are reflected in the README and the exported types
- [ ] No secret (`hashToken`) or card data is logged, committed, or added to a fixture

## Signature parity

<!--
Only if this PR touches a signed request field or a fieldOrders.ts entry.
The SDK must reproduce the server's byte-exact HMAC, so field order matters.
-->

- [ ] Not applicable — this PR does not touch signed request fields
- [ ] `src/internal/fieldOrders.ts` matches the endpoint's FormRequest `rules()` order
- [ ] Golden-signature fixtures were regenerated and the parity tests pass
