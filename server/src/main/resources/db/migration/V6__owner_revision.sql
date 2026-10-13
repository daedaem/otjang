-- One revision per successful owner-scoped API mutation. Unclaimed legacy owner 1 is preserved.
alter table owner add column revision bigint not null default 0 check (revision >= 0);
