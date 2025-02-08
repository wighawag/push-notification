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