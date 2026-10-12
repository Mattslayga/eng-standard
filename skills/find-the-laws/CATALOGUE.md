# Law catalogue (shapes, all-input)

| Area | Law shape |
|---|---|
| Money | total never negative; total <= subtotal; a discount never increases the total; a fitting discount is applied exactly once; sum of line totals == order total; refunds never exceed the amount captured |
| Rounding | rounding happens once, at one boundary; sum of rounded parts differs from rounded sum by at most n-1 cents |
| Permissions | no action succeeds without the permission it needs; a derived grant is a subset of its parent; a revoked grant authorises nothing |
| State transitions | only listed transitions are allowed; terminal states have no exits; every reachable state can reach a terminal state |
| Deletion | deleting X never deletes data owned by someone else; soft-deleted rows never appear in reads; delete is idempotent |
| Idempotency | applying the same request (same key) twice equals applying it once |
| Limits | a counter never exceeds its limit; a rejected request changes nothing |
| Pagination | concatenating all pages returns each item exactly once, in order, for any page size |
| Pricing and dates | a price is never applied outside its validity window; ranges are half-open [start, end); end >= start |

Fixed-value checks ("total(100, 500) == 0") are examples, not laws. A law quantifies over every input.
