-- Preserve unclaimed local owner 1. Every registration creates a different owner.
create table beta_account (
    username varchar(40) primary key,
    password_hash varchar(100) not null,
    owner_id bigint not null unique references owner(id) on delete cascade,
    created_at timestamptz not null default now()
);
create table beta_session (
    token_hash char(64) primary key,
    owner_id bigint not null references beta_account(owner_id) on delete cascade,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);
create index beta_session_owner_idx on beta_session(owner_id);
create index beta_session_expiry_idx on beta_session(expires_at);
