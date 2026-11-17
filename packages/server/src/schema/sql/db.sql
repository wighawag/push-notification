CREATE TABLE IF NOT EXISTS Subscriptions (
    address text NOT NULL,
    domain text NOT NULL,
    subscriptionID text NOT NULL,
    subscription text NOT NULL,
    timestamp timestamp NOT NULL,
    expiry timestamp,
    PRIMARY KEY (address, domain, subscriptionID)
);

CREATE INDEX IF NOT EXISTS idx_Subscriptions_address_domain ON Subscriptions (address, domain);

CREATE INDEX IF NOT EXISTS idx_Subscriptions_expiry ON Subscriptions (expiry);

-- One row per (push, subscription) a push with an Idempotency-Key reached or is
-- reaching: delivered = 1 once the push service accepted it, 0 while a request
-- holds the claim (claimedAt, in ms). A retry skips the delivered rows and
-- re-claims a stale claim. Rows older than the retention are pruned.
CREATE TABLE IF NOT EXISTS Deliveries (
    address text NOT NULL,
    domain text NOT NULL,
    idempotencyKey text NOT NULL,
    subscriptionID text NOT NULL,
    delivered integer NOT NULL,
    claimedAt integer NOT NULL,
    PRIMARY KEY (address, domain, idempotencyKey, subscriptionID)
);

CREATE INDEX IF NOT EXISTS idx_Deliveries_claimedAt ON Deliveries (claimedAt);
