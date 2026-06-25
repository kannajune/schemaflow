-- Sample application queries. SchemaFlow mines these for real JOIN usage and
-- upgrades naming-only "inferred" edges to evidence-backed "observed" edges.
-- Note the table aliases (o, a, t, i, p) — the parser resolves them.

SELECT o.id, o.qty, a.broker
FROM orders o
JOIN accounts a ON o.account_id = a.id;

SELECT t.id, i.symbol, t.fill_price
FROM trades t
JOIN instruments i ON t.instrument_id = i.id;

SELECT p.net_qty, p.pnl, acc.balance, inst.symbol
FROM positions p
JOIN accounts acc ON p.account_id = acc.id
JOIN instruments inst ON p.instrument_id = inst.id
WHERE p.net_qty <> 0;
